# Phase 2: Auth Flow - Research

**Researched:** 2026-03-14
**Domain:** Adobe IMS PKCE OAuth, Express session management, hosted MCP server auth
**Confidence:** HIGH

## Summary

Phase 2 wires the existing Adobe IMS PKCE infrastructure in `http.ts` into a proper hosted auth flow. The codebase already contains the session Map, PKCE helpers, and token-exchange function — but the `POST /mcp` handler does not enforce authentication (unauthenticated calls silently pass through), the `/login` and `/callback` routes do not exist, and all OAuth URLs are hardcoded to `http://localhost:3000`.

The work is surgical: add three HTTP routes (`GET /login`, `GET /callback`, route them into the existing session Map), add a 401 guard on `POST /mcp` that returns a human-readable login URL, replace the two `localhost:3000` placeholders with `process.env.PUBLIC_URL`, and change `da_login`'s `openBrowser()` call into a URL-return when `httpMode` is true.

There is one critical external dependency: Adobe must add `https://mcp.aemxsc.com/callback` to the `darkalley` client's allowed redirect URIs in Adobe Developer Console before the `/callback` exchange will succeed. All code can be written and tested locally first; that registration is just required for production.

**Primary recommendation:** Implement `/login` → IMS authorize redirect, `/callback` → token exchange + session store, 401 guard on `/mcp`, PUBLIC_URL substitution, and da_login httpMode branch — in that order, in a single well-scoped plan.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | Unauthenticated tool calls return a human-readable login URL in the response (not a raw error) | Add 401 guard block in `POST /mcp` before tool dispatch; return JSON with `login_url` field and `WWW-Authenticate` header |
| AUTH-02 | `GET /login?session=<id>` initiates Adobe IMS PKCE OAuth flow | New Express route: generate code_verifier/challenge, store in pendingOAuthStates keyed by `session` param, redirect to IMS authorize URL |
| AUTH-03 | `GET /callback` receives OAuth code, exchanges for token, stores in session Map | New Express route: look up pendingOAuthState by `state` query param, call `exchangeCodeForToken`, store result in `sessions` Map under the session UUID |
| AUTH-04 | Session tokens stored in in-memory Map (keyed by session UUID) | Already exists as `sessions: Map<string, Session>` in http.ts; task is ensuring correct key (UUID, not IMS token) |
| AUTH-05 | `PUBLIC_URL` env var used for all OAuth callback/redirect URIs (no hardcoded localhost) | Two `TODO Phase 2` comments in http.ts identify exact lines; replace with `process.env.PUBLIC_URL ?? 'http://localhost:3000'` |
| AUTH-06 | `darkalley` client_id PKCE flow registered at `https://mcp.aemxsc.com/callback` | External dependency — code reads `ADOBE_IMS_CLIENT_ID` env (must be set to `darkalley`); redirect URI must match; cannot be validated in code alone |
| DA-05 | `da_login` returns login URL (not browser open) when in hosted mode | In `tools.ts` `da_login` case: when `httpMode === true`, skip `openBrowser()` and return the login URL string instead |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express | ^4.18.0 | HTTP routing for /login and /callback routes | Already in project; no new dependency needed |
| node:crypto | built-in | `randomBytes` for session UUID generation, `createHash` for PKCE S256 | Already used in http.ts for PKCE helpers |
| uuid | ^9.0.0 | `uuidv4()` for session IDs | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @modelcontextprotocol/sdk | ^1.0.0 | MCP types (Tool, etc.) | Already in use; no changes needed for auth |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory Map | express-session + Redis | Redis is v2; in-memory is intentional for March 24 scope |
| Custom PKCE helpers | passport-oauth2 or similar | No new dependencies needed; crypto-native PKCE is already implemented |

**Installation:** No new packages required. All dependencies are already in `package.json`.

---

## Architecture Patterns

### Existing Session Flow (already in http.ts)
```
sessions: Map<string, Session>
  key   = session UUID (issued to client)
  value = { imsToken, imsRefreshToken, imsExpiresAt, clientId, createdAt }

pendingOAuthStates: Map<string, PendingOAuthState>
  key   = ims_state (random, sent to IMS /authorize)
  value = { imsCodeVerifier, createdAt, ... }
```

### Recommended Auth Flow (Phase 2 target)
```
MCP Client                    Express Server                Adobe IMS
     |                              |                            |
     |--- POST /mcp (no token) ---->|                            |
     |<-- 401 + login URL ----------|                            |
     |                              |                            |
     |--- GET /login?session=<id> ->|                            |
     |                              |-- gen verifier/challenge   |
     |                              |-- store in pendingOAuth    |
     |<-- 302 Location: IMS /auth-->|                            |
     |                              |                            |
     |---- browser follows -------->|                            |
     |                              |------ GET /authorize ----->|
     |                              |<-- 302 /callback?code=X ---|
     |--- GET /callback?code=X ---->|                            |
     |                              |-- POST /ims/token/v3 ----->|
     |                              |<-- access_token -----------|
     |                              |-- sessions.set(uuid, tok)  |
     |<-- 200 "Login complete" -----|                            |
     |                              |                            |
     |--- POST /mcp + Bearer uuid ->|                            |
     |                              |-- resolveSessionToken(uuid)|
     |<-- tool result --------------|                            |
```

### Pattern 1: Session UUID as Bearer Token
**What:** The session key (`uuid`) is what the MCP client sends as a Bearer token. The server looks it up in the `sessions` Map to retrieve the actual IMS token.
**When to use:** Always in hosted mode. The client never sees the IMS token.
**Example:**
```typescript
// In POST /mcp handler — auth guard to add:
const sessionToken = extractBearer(req); // already exists
if (!sessionToken) {
  const sessionId = uuidv4();
  const loginUrl = `${process.env.PUBLIC_URL ?? 'http://localhost:3000'}/login?session=${sessionId}`;
  res.status(401)
    .setHeader('WWW-Authenticate', `Bearer realm="hlx-admin-mcp", login_url="${loginUrl}"`)
    .json({
      error: 'unauthenticated',
      message: `Not authenticated. Visit this URL to log in: ${loginUrl}`,
      login_url: loginUrl,
    });
  return;
}
const imsToken = await resolveSessionToken(sessionToken);
if (!imsToken) {
  // same 401 response — session expired
}
```

### Pattern 2: GET /login Route
**What:** Generates PKCE pair, stores in `pendingOAuthStates` keyed by a random `ims_state`, redirects browser to IMS `/authorize`.
**When to use:** When user follows the login URL from Claude Code.
**Example:**
```typescript
app.get('/login', (req: Request, res: Response) => {
  const sessionId = req.query.session as string | undefined;
  if (!sessionId) {
    res.status(400).send('Missing session parameter');
    return;
  }
  const imsCodeVerifier = generateCodeVerifier();   // already exported from tools.ts
  const imsCodeChallenge = generateCodeChallenge(imsCodeVerifier);
  const imsState = randomBytes(16).toString('hex');
  const publicUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000';
  const redirectUri = `${publicUrl}/callback`;

  pendingOAuthStates.set(imsState, {
    sessionId,           // carry the session UUID through the flow
    imsCodeVerifier,
    createdAt: Date.now(),
  });

  const authorizeUrl = new URL(`${IMS_BASE}/ims/authorize/v2`);
  authorizeUrl.searchParams.set('client_id', process.env.ADOBE_IMS_CLIENT_ID ?? '');
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'openid,AdobeID,additional_info.roles,read_organizations');
  authorizeUrl.searchParams.set('code_challenge', imsCodeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('state', imsState);

  res.redirect(authorizeUrl.toString());
});
```

### Pattern 3: GET /callback Route
**What:** Receives IMS redirect with `code` and `state`, looks up the pending state, calls `exchangeCodeForToken`, stores the IMS token in `sessions` under the session UUID.
**When to use:** IMS redirects here after the user logs in.
**Example:**
```typescript
app.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) {
    res.status(400).send(`IMS login error: ${error} — ${req.query.error_description ?? ''}`);
    return;
  }
  if (!code || !state) {
    res.status(400).send('Missing code or state');
    return;
  }

  const pending = pendingOAuthStates.get(state);
  if (!pending) {
    res.status(400).send('Unknown or expired state — please start login again');
    return;
  }
  pendingOAuthStates.delete(state);

  const publicUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000';
  const redirectUri = `${publicUrl}/callback`;

  try {
    const tokenData = await exchangeCodeForToken(
      process.env.ADOBE_IMS_CLIENT_ID ?? '',
      code,
      pending.imsCodeVerifier,
      redirectUri,
    );
    sessions.set(pending.sessionId, {
      imsToken: tokenData.access_token,
      imsRefreshToken: tokenData.refresh_token,
      imsExpiresAt: Date.now() + tokenData.expires_in * 1000,
      clientId: process.env.ADOBE_IMS_CLIENT_ID ?? '',
      createdAt: Date.now(),
    });
    res.send(`
      <html><body>
        <h1>Login successful</h1>
        <p>You are now authenticated. Return to Claude and retry your request.</p>
        <p>Session ID: <code>${pending.sessionId}</code></p>
      </body></html>
    `);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Token exchange failed: ${msg}`);
  }
});
```

### Pattern 4: da_login httpMode Branch
**What:** When `httpMode === true`, return the login URL as a string rather than opening a browser.
**When to use:** In `tools.ts` `da_login` case, branch on `httpMode`.
**Example:**
```typescript
case 'da_login': {
  if (httpMode) {
    // Hosted mode — caller must supply their session ID via context or tool argument
    // For v1: instruct user to visit /login?session=<bearer-token-they-are-using>
    const publicUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000';
    const loginUrl = `${publicUrl}/login?session=<your-session-id>`;
    return {
      content: [{
        type: 'text',
        text: `To authenticate, visit: ${loginUrl}\n\nReplace <your-session-id> with the Bearer token shown in the 401 response.`,
      }],
    };
  }
  // ... existing openBrowser() flow for local/stdio mode
}
```

### Anti-Patterns to Avoid
- **Issuing a new session UUID on every 401:** The 401 handler should generate a fresh UUID per unauthenticated request OR instruct the client to use a stable UUID. The current design in http.ts shows the 401 generating the UUID — the client then uses that UUID as Bearer on subsequent requests. Do not look up a UUID from an incoming (missing) Bearer header.
- **Hardcoded localhost in callback URI:** `exchangeCodeForToken` in tools.ts defaults to `CALLBACK_URI` (`http://localhost:${CALLBACK_PORT}/callback`) — the Phase 2 calls must always pass `redirectUri` explicitly with `PUBLIC_URL`.
- **Treating pendingOAuthStates key as the session UUID:** `pendingOAuthStates` is keyed by `ims_state` (random opaque value sent to IMS). The session UUID travels inside the `PendingOAuthState` value.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PKCE verifier/challenge generation | Custom base64url SHA-256 | `generateCodeVerifier` / `generateCodeChallenge` already in tools.ts | Edge cases in padding, URL-safe encoding |
| Token exchange HTTP call | Custom fetch wrapper | `exchangeCodeForToken` already in tools.ts | Already handles error extraction, correct endpoint |
| Session UUID generation | `Math.random()` | `uuidv4()` from the `uuid` package (already imported in http.ts) | Cryptographic randomness |
| State cleanup | Custom interval | Existing `setInterval` cleanup in http.ts (10 min TTL) | `pendingOAuthStates` already expires stale entries |

**Key insight:** The main risk in this phase is misrouting the data that already exists — not implementing new algorithms. The PKCE flow, session Map, and token exchange are complete. The work is plumbing them together with proper HTTP routes.

---

## Common Pitfalls

### Pitfall 1: redirect_uri Mismatch
**What goes wrong:** IMS token exchange returns `invalid_redirect_uri` error (HTTP 400).
**Why it happens:** The `redirect_uri` in `/authorize` and the `redirect_uri` in `/token` must be byte-identical AND must match the URI registered in Adobe Developer Console for `darkalley`.
**How to avoid:** Build `redirectUri` from `PUBLIC_URL` in exactly one place; pass it to both `/login` (authorize redirect) and `/callback` (token exchange). Test locally with `PUBLIC_URL=http://localhost:9999` and `redirect_uri=http://localhost:9999/callback` — this works for local testing because `darkalley` already has `http://localhost:8765/callback` registered; we need to either use 8765 locally or add a local redirect to darkalley.
**Warning signs:** Token exchange step fails while authorize redirect works fine.

### Pitfall 2: IMS Client ID for darkalley
**What goes wrong:** IMS authorize redirect succeeds but token exchange returns 401 or `client_id_mismatch`.
**Why it happens:** The `darkalley` client_id is not the same as `aem-cli`. Using the wrong client_id is silent at authorize time but fails at token time.
**How to avoid:** Set `ADOBE_IMS_CLIENT_ID=darkalley` in Railway env vars. Locally, the `aem-cli` client_id can be used for testing the flow shape, but the production registration requires `darkalley`.
**Warning signs:** Token exchange 400/401 with `invalid_client`.

### Pitfall 3: Session UUID Not Persisted to Client
**What goes wrong:** After `/callback` stores the session, the client has no way to know what UUID to use as Bearer.
**Why it happens:** The 401 response generates a UUID, but if the browser follows `/login?session=<uuid>` the client connection is separate — the MCP client must re-send with that same UUID as Bearer.
**How to avoid:** The 401 response generates the UUID AND includes it in the login URL (`/login?session=<uuid>`). After login, the user returns to Claude and the UUID is already embedded in the tool context. The design relies on the user copying the URL or the MCP client recording the UUID from the 401. Document this flow clearly.
**Warning signs:** Login completes but subsequent POST /mcp still gets 401 because a different UUID is used.

### Pitfall 4: well-known Endpoints Still Use localhost
**What goes wrong:** MCP clients that do OAuth discovery read `/.well-known/oauth-authorization-server` and get `http://localhost:3000/authorize` — unusable from a hosted client.
**Why it happens:** Two TODO comments in http.ts mark these as Phase 2 work; they'll be missed if only the /login and /callback routes are addressed.
**How to avoid:** Replace ALL four `localhost:3000` strings in the well-known handlers with `process.env.PUBLIC_URL ?? 'http://localhost:3000'`. Also replace the `http://localhost:${activePort}` resource references.
**Warning signs:** MCP client cannot initiate OAuth because discovery metadata points to localhost.

### Pitfall 5: `da_login` httpMode Missing Session Context
**What goes wrong:** `da_login` returns a login URL with `<your-session-id>` placeholder — Claude cannot auto-complete the auth flow.
**Why it happens:** In hosted mode, the session UUID is determined by the 401 response from `/mcp`, not by the `da_login` call itself.
**How to avoid:** For v1, `da_login` in httpMode should return a message instructing the user to check the 401 response for the login URL. In practice, the primary auth entry point is the 401 on `/mcp`, not `da_login`. The tool can remain as a convenience "how to log in" explainer in hosted mode.
**Warning signs:** Users try `da_login` first in hosted mode and get a confusing placeholder URL.

---

## Code Examples

### IMS Authorize URL Construction (verified against IMS_BASE = `https://ims-na1.adobelogin.com`)
```typescript
// Source: existing tools.ts constants + IMS API standard
const authorizeUrl = new URL(`${IMS_BASE}/ims/authorize/v2`);
authorizeUrl.searchParams.set('client_id', process.env.ADOBE_IMS_CLIENT_ID!);
authorizeUrl.searchParams.set('redirect_uri', `${process.env.PUBLIC_URL}/callback`);
authorizeUrl.searchParams.set('response_type', 'code');
authorizeUrl.searchParams.set('scope', 'openid,AdobeID,additional_info.roles,read_organizations');
authorizeUrl.searchParams.set('code_challenge', imsCodeChallenge);
authorizeUrl.searchParams.set('code_challenge_method', 'S256');
authorizeUrl.searchParams.set('state', imsState); // random opaque value
```

### WWW-Authenticate Header (RFC 6750 compliant)
```typescript
// 401 response structure per RFC 6750 + human-readable body
res.status(401)
  .setHeader('WWW-Authenticate', `Bearer realm="hlx-admin-mcp"`)
  .json({
    error: 'unauthenticated',
    message: `Not authenticated. Visit this URL to log in:\n${loginUrl}`,
    login_url: loginUrl,
  });
```

### PUBLIC_URL Substitution (the two well-known handlers)
```typescript
// Replace both TODO Phase 2 blocks in http.ts
const publicUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000';

app.get('/.well-known/oauth-authorization-server', (_req, res) => {
  res.json({
    issuer: publicUrl,
    authorization_endpoint: `${publicUrl}/authorize`,
    token_endpoint: `${publicUrl}/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['openid', 'AdobeID'],
    resource: publicUrl,
  });
});
```

### PendingOAuthState Shape (must carry sessionId)
```typescript
// The existing PendingOAuthState interface in http.ts must be extended to carry sessionId
// Current shape (from http.ts):
interface PendingOAuthState {
  claudeRedirectUri: string;   // not needed for our simpler flow
  claudeCodeChallenge: string; // not needed for our simpler flow
  claudeState: string;
  imsCodeVerifier: string;
  createdAt: number;
}

// Phase 2 shape (replace or extend — simpler for our use case):
interface PendingOAuthState {
  sessionId: string;       // the UUID from /login?session=<uuid>
  imsCodeVerifier: string; // PKCE verifier for the IMS leg
  createdAt: number;
}
```

**Note:** The existing `PendingOAuthState` was designed for a more complex proxy flow (Claude Code acting as OAuth client). For Phase 2's simpler hosted-session approach, we only need `sessionId`, `imsCodeVerifier`, and `createdAt`. The `claudeRedirectUri`, `claudeCodeChallenge`, `claudeState`, and `authCodes` Map can be removed or left unused — removing reduces confusion.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dual-server (Express + separate HTTPS on 3443) | Single Express on PORT | Phase 1 (complete) | Railway-compatible |
| `selfsigned` for local TLS | Railway handles TLS at edge | Phase 1 (complete) | No self-signed cert needed |
| `openBrowser()` for local auth | Login URL returned to client | Phase 2 (this phase) | Works in hosted/headless environment |
| Hardcoded `localhost:3000` in OAuth discovery | `PUBLIC_URL` env var | Phase 2 (this phase) | Works from any domain |

**Deprecated/outdated in this codebase:**
- `CALLBACK_URI` constant in tools.ts (`http://localhost:${CALLBACK_PORT}/callback`): Used only when `redirectUri` is not passed to `exchangeCodeForToken`. Phase 2 must always pass the `PUBLIC_URL`-based URI explicitly.
- `callbackServerStarted` / `pendingAuth` exports in tools.ts: Were part of the old local-only PKCE flow. Now superseded by the Express routes in http.ts. Can be left but will be unused in HTTP mode.
- The `claudeRedirectUri` / `claudeCodeChallenge` / `claudeState` fields in `PendingOAuthState`: Part of a two-legged OAuth proxy design (Claude Code as client). Unused in the simpler session-cookie approach. Safe to simplify.

---

## Open Questions

1. **darkalley client_id value**
   - What we know: Requirements say "darkalley client_id"; `ADOBE_IMS_CLIENT_ID` env var must be set to this value; the existing code reads it correctly.
   - What's unclear: The actual string value of the `darkalley` client_id is not documented in the codebase. The developer must obtain this from Adobe Developer Console or the team that manages it.
   - Recommendation: Set `ADOBE_IMS_CLIENT_ID` in Railway env vars to the darkalley client_id before Phase 3. For local testing, the `aem-cli` client_id can test the OAuth flow shape (its redirect URIs include localhost).

2. **offline_access scope and refresh tokens**
   - What we know: STATE.md flags this as MEDIUM RISK — `offline_access` scope behavior with `darkalley` is unverified. The existing `refreshImsToken` function and `resolveSessionToken` logic already handle refresh.
   - What's unclear: Whether darkalley issues refresh tokens. If not, sessions expire with the IMS access token TTL (~24h typically for Adobe IMS).
   - Recommendation: Test early in Phase 2 execution. If refresh tokens are unavailable, ensure the 401 response is informative (includes a fresh login URL). The SESSION expiry handling in `resolveSessionToken` already cleans up the Map entry.

3. **Session UUID communication back to MCP client**
   - What we know: The 401 response includes `login_url` with the UUID embedded. After login, the user must use that UUID as Bearer on subsequent `/mcp` calls.
   - What's unclear: Whether Claude Code's MCP client can automatically extract and reuse this UUID, or whether the user must manually configure it. The MCP spec does not standardize this flow.
   - Recommendation: For v1, rely on the user seeing the 401 response message and pasting the UUID/URL into their MCP config. Document this in the onboarding flow (Phase 4).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bash smoke tests (test-phase1.sh pattern) |
| Config file | none — scripts live in `tools/hlx-admin-mcp/` |
| Quick run command | `bash tools/hlx-admin-mcp/test-phase2.sh` |
| Full suite command | `bash tools/hlx-admin-mcp/test-phase2.sh` (same — no separate unit framework) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Unauthenticated POST /mcp returns HTTP 401 with WWW-Authenticate header and login_url in body | smoke | `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:9999/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` → 401 | ❌ Wave 0 |
| AUTH-02 | GET /login?session=<id> returns 302 redirect to IMS authorize URL | smoke | `curl -s -o /dev/null -w "%{http_code}" "http://localhost:9999/login?session=test-uuid"` → 302 | ❌ Wave 0 |
| AUTH-03 | GET /callback with valid code+state stores token in sessions Map | manual-only | Cannot automate without live IMS roundtrip; verify via /health `sessions` count after manual login | manual |
| AUTH-04 | Sessions Map keyed by session UUID; POST /mcp with valid Bearer returns 200 | smoke | Inject test session into Map via `/health` inspection or a debug route; then POST /mcp with Bearer | manual |
| AUTH-05 | No hardcoded localhost in OAuth discovery or callback URI | static | `grep -r 'localhost:3000' tools/hlx-admin-mcp/src/` returns no results | ❌ Wave 0 |
| AUTH-06 | Callback registered — external validation only | manual-only | Cannot automate; requires Adobe Developer Console access | manual |
| DA-05 | da_login returns URL string (not openBrowser) in httpMode | smoke | POST /mcp with da_login tool call while unauthenticated; response text should contain a URL, not "Browser opened" | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bash tools/hlx-admin-mcp/test-phase2.sh` (static checks + smoke)
- **Per wave merge:** `bash tools/hlx-admin-mcp/test-phase2.sh && bash tools/hlx-admin-mcp/test-phase1.sh` (regression)
- **Phase gate:** Phase 2 smoke suite green + manual IMS flow verification before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tools/hlx-admin-mcp/test-phase2.sh` — covers AUTH-01, AUTH-02, AUTH-05, DA-05
- [ ] Static grep check for `localhost:3000` in src/http.ts (verifies AUTH-05)

*(AUTH-03, AUTH-04 full automation, AUTH-06 are manual-only — documented above)*

---

## Sources

### Primary (HIGH confidence)
- Direct code analysis of `tools/hlx-admin-mcp/src/http.ts` — full session Map, PKCE helpers, existing TODO comments
- Direct code analysis of `tools/hlx-admin-mcp/src/tools.ts` — `exchangeCodeForToken`, `generateCodeVerifier`, `generateCodeChallenge`, `da_login` case, `httpMode` flag
- `.planning/REQUIREMENTS.md` — AUTH-01 through AUTH-06, DA-05 specifications
- `.planning/STATE.md` — decisions log (darkalley external dependency, PUBLIC_URL TODO, in-memory sessions rationale)

### Secondary (MEDIUM confidence)
- Adobe IMS API: endpoint `https://ims-na1.adobelogin.com/ims/authorize/v2` and `/ims/token/v3` — inferred from existing codebase constants (`IMS_BASE`) which match documented Adobe IMS endpoints
- RFC 6750 Bearer Token format for `WWW-Authenticate` header — standard HTTP auth spec, high confidence

### Tertiary (LOW confidence)
- `darkalley` registered redirect URIs and actual client_id string value — not available in codebase; requires Adobe Developer Console access
- Whether IMS issues refresh tokens with `darkalley` + `offline_access` scope — flagged as unverified in STATE.md

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, no new dependencies needed
- Architecture: HIGH — flow is clear from code analysis; routes follow standard Express + PKCE patterns
- Pitfalls: HIGH — identified from direct code inspection (hardcoded strings, existing TODO comments, flow design issues)
- External (darkalley): LOW — requires Adobe team action, cannot be verified from codebase alone

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable domain — IMS API and Express patterns are stable; darkalley registration may change)

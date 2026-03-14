# Architecture Patterns: Hosted MCP Server with Per-User OAuth

**Domain:** Hosted MCP server, OAuth proxy, Railway deployment
**Researched:** 2026-03-14
**Confidence:** HIGH (spec-verified) / MEDIUM (Adobe CS MCP internals inferred)

---

## 1. What the Existing Code Actually Is

Before designing the hosted architecture, understand what `http.ts` already does — it is
not what the PROJECT.md heading "HTTP SSE transport" implies.

**Key discovery:** `http.ts` already implements Streamable HTTP (the March 2025 MCP
spec), not the deprecated HTTP+SSE transport. Evidence:

- `POST /mcp` handles all JSON-RPC messages — initialize, tools/list, tools/call
- `GET /mcp` returns 405 — explicitly not an SSE stream endpoint
- `DELETE /mcp` terminates sessions — matches Streamable HTTP session close spec
- Bearer token in `Authorization` header on every request — not a long-lived SSE conn
- No `Mcp-Session-Id` header yet — but sessions are tracked via the Bearer token itself

This is significant: **there are no long-lived SSE connections to worry about.** The
architectural challenge stated in the milestone context ("SSE creates long-lived
connections") does not apply to this codebase. Each tool call is a discrete HTTP POST
with a Bearer token. The problem simplifies considerably.

---

## 2. Transport Architecture Clarification

### What the spec says (MCP 2025-03-26)

Streamable HTTP operates as stateless HTTP:
- Every message is a fresh `POST /mcp`
- Client sends `Authorization: Bearer <token>` on EVERY request
- Server returns `Mcp-Session-Id` in `InitializeResult` response headers (optional but
  recommended) so clients can correlate requests to sessions
- No persistent TCP connection is held open between requests

### What this means for hosting

The "how to associate connections with OAuth sessions" question dissolves:

- There are no persistent connections
- Each POST carries the Bearer token
- The server looks up the session by Bearer token on every request
- The OAuth callback updates the session in the in-memory Map before the next MCP POST
  arrives
- Railway's 5-minute SSE timeout is irrelevant — no SSE is used

---

## 3. Component Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│  MCP Client (Claude Code / Cursor / VS Code)                    │
│  Config: { url: "https://mcp.aemxsc.com/mcp" }                 │
└────────────────────────┬────────────────────────────────────────┘
                         │  HTTPS  POST /mcp  Authorization: Bearer <session-token>
                         │  (every tool call, every initialize)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Railway: mcp.aemxsc.com  (single Node.js process)             │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Express app  (port = process.env.PORT, bind 0.0.0.0)   │  │
│  │                                                          │  │
│  │  GET  /.well-known/oauth-authorization-server            │  │
│  │  GET  /.well-known/oauth-protected-resource              │  │
│  │  GET  /authorize  → redirect to Adobe IMS /authorize    │  │
│  │  GET  /callback   ← Adobe IMS returns code here         │  │
│  │  POST /token      ← MCP client exchanges code for token │  │
│  │  POST /mcp        ← all MCP JSON-RPC tool calls         │  │
│  │  DELETE /mcp      ← session close                       │  │
│  │  GET  /health     ← Railway health check                │  │
│  │                                                          │  │
│  │  In-memory Maps:                                         │  │
│  │    pendingOAuthStates: ims_state → { claudeRedirect,    │  │
│  │                                     imsCodeVerifier }   │  │
│  │    authCodes:          code → { imsToken, ... }         │  │
│  │    sessions:           sessionToken → { imsToken,       │  │
│  │                                        refreshToken,    │  │
│  │                                        expiresAt }      │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────┬──────────────────────────────────────────────────┘
             │                              │
             │ HTTPS (outbound)             │ HTTPS (outbound)
             ▼                              ▼
┌─────────────────────┐        ┌────────────────────────────┐
│  Adobe IMS          │        │  AEM APIs                  │
│  ims-na1.adobe      │        │  admin.hlx.page            │
│  login.com          │        │  content.da.live           │
│                     │        │  admin.da.live             │
│  /ims/authorize/v2  │        └────────────────────────────┘
│  /ims/token/v3      │
│  /ims/userinfo/v2   │
└─────────────────────┘
```

### Component responsibilities

| Component | Responsibility | File |
|-----------|---------------|------|
| Express app (main) | Route all HTTP, CORS, health | `http.ts` |
| OAuth discovery endpoints | Tell MCP clients where to auth | `http.ts` |
| `/authorize` handler | Start PKCE dance, redirect to IMS | `http.ts` |
| `/callback` handler | Receive IMS code, exchange, create session | `http.ts` |
| `/token` handler | Give MCP client its Bearer token | `http.ts` |
| `/mcp POST` handler | Validate Bearer → look up IMS token → dispatch tool | `http.ts` |
| `handleTool()` | Execute DA/HLX API calls with IMS token | `tools.ts` |
| `resolveSessionToken()` | Bearer → IMS token with refresh | `http.ts` |
| `sessions` Map | In-memory per-user state | `http.ts` |

### What does NOT communicate with what

- The MCP client never touches Adobe IMS directly
- The MCP client never sees the IMS access token — only its own session Bearer token
- `tools.ts` never reads from disk when running in HTTP mode — the IMS token arrives
  via `imsOverride` parameter from the session lookup
- The OAuth callback (`/callback`) and the MCP endpoint (`/mcp`) share the same process
  and same `sessions` Map — this is intentional and why single-process works

---

## 4. Auth Data Flow — Every Step

### 4a. First-use: unauthenticated tool call

```
1. MCP client POSTs to POST /mcp  (no Authorization header)
   Body: { jsonrpc: "2.0", method: "tools/call", params: { name: "da_list", ... } }

2. Server: extractBearer(req) returns null
   imsToken = null
   handleTool("da_list", args, undefined) is called

3. tools.ts: daRequest() calls getImsToken(undefined)
   → no override, no env IMS_ACCESS_TOKEN, no client credentials, no stored file token
   → returns null

4. daRequest() returns { status: 401, ok: false,
     data: "Not authenticated. Run da_login first..." }

5. Server returns JSON-RPC result with isError: true
   Text: "Not authenticated. Run da_login first (provide org and site parameters)."

NOTE: The spec says server SHOULD return HTTP 401 Unauthorized when auth is required,
not a JSON-RPC error. However, MCP clients handle this differently:

BETTER APPROACH (to implement): Before handleTool(), if no Bearer token:
  return HTTP 401 with WWW-Authenticate: Bearer realm="mcp.aemxsc.com"
  MCP client then discovers /.well-known/oauth-authorization-server and starts OAuth
  This is the spec-compliant path and triggers automatic browser redirect in Claude Code
```

### 4b. OAuth browser flow (MCP client initiates after 401)

```
Step 1 — Discovery
MCP client → GET /.well-known/oauth-authorization-server
Server returns:
  {
    issuer: "https://mcp.aemxsc.com",
    authorization_endpoint: "https://mcp.aemxsc.com/authorize",
    token_endpoint: "https://mcp.aemxsc.com/token",
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"]
  }

Step 2 — PKCE generation (client-side)
MCP client generates:
  claude_code_verifier  = random 32 bytes → base64url
  claude_code_challenge = SHA256(claude_code_verifier) → base64url
  claude_state          = random nonce

Step 3 — Authorization request
MCP client → GET /authorize?
  response_type=code
  &redirect_uri=http://localhost:NNNN/callback   (Claude Code's local callback)
  &code_challenge=<claude_code_challenge>
  &code_challenge_method=S256
  &state=<claude_state>

Step 4 — Server generates IMS PKCE params (separate PKCE leg)
Server:
  ims_code_verifier  = random 32 bytes → base64url
  ims_code_challenge = SHA256(ims_code_verifier) → base64url
  ims_state          = random 16 bytes hex

Server stores in pendingOAuthStates[ims_state]:
  {
    claudeRedirectUri: "http://localhost:NNNN/callback",
    claudeCodeChallenge: claude_code_challenge,
    claudeState: claude_state,
    imsCodeVerifier: ims_code_verifier,
    createdAt: now
  }

Server → 302 redirect to:
  https://ims-na1.adobelogin.com/ims/authorize/v2?
    client_id=darkalley
    &redirect_uri=https://mcp.aemxsc.com/callback
    &response_type=code
    &scope=openid+AdobeID+additional_info.roles
    &state=<ims_state>
    &code_challenge=<ims_code_challenge>
    &code_challenge_method=S256

Step 5 — User logs in via Adobe browser page
User authenticates at ims-na1.adobelogin.com (Adobe's UI)

Step 6 — IMS callback
IMS → GET /callback?code=<ims_code>&state=<ims_state>

Server looks up pendingOAuthStates[ims_state] → pending
Server calls exchangeCodeForToken(darkalley_client_id, ims_code, ims_code_verifier,
                                   "https://mcp.aemxsc.com/callback")
IMS returns: { access_token, refresh_token, expires_in: 86400 }

Server generates our_auth_code = uuidv4()
Stores in authCodes[our_auth_code]:
  {
    imsToken: access_token,
    imsRefreshToken: refresh_token,
    imsExpiresAt: now + 86400000,
    claudeRedirectUri, claudeCodeChallenge, claudeState
  }

Server → 302 redirect to:
  http://localhost:NNNN/callback?code=<our_auth_code>&state=<claude_state>

Step 7 — Token exchange
MCP client → POST /token
  Body: { grant_type: "authorization_code",
          code: <our_auth_code>,
          code_verifier: <claude_code_verifier> }

Server: verifyPkce(claude_code_verifier, stored claudeCodeChallenge) ✓
Server generates session_token = uuidv4()
Stores in sessions[session_token]:
  {
    imsToken: access_token,
    imsRefreshToken: refresh_token,
    imsExpiresAt: now + 86400000,
    clientId: darkalley_client_id,
    createdAt: now
  }

Server returns: { access_token: session_token, token_type: "Bearer", expires_in: 86400 }

MCP client stores session_token and sends it as Bearer on all subsequent requests.
```

### 4c. Authenticated tool call

```
MCP client → POST /mcp
  Authorization: Bearer <session_token>
  Body: { jsonrpc:"2.0", method:"tools/call", params:{ name:"da_list", ... } }

Server: extractBearer(req) → session_token
resolveSessionToken(session_token):
  sessions.get(session_token) → { imsToken, imsExpiresAt, ... }
  Date.now() < imsExpiresAt - 60000? YES → return imsToken

handleTool("da_list", args, imsToken)
  → daRequest("GET", "/list/org/site", undefined, "text/html", imsToken)
  → getImsToken(imsToken) → returns imsToken (override path)
  → fetch("https://content.da.live/list/org/site",
          { headers: { Authorization: "Bearer <imsToken>" } })
  → returns DA content

Server → JSON-RPC result with DA listing
```

### 4d. Token refresh (transparent to MCP client)

```
IMS access tokens expire after 24h (expires_in: 86400).
The MCP client's session_token does NOT expire (expires_in: 86400 returned but not
actually enforced server-side per current code).

When MCP client POSTs → resolveSessionToken(session_token):
  Date.now() >= imsExpiresAt - 60000 (within 60s of expiry or expired)
  session.imsRefreshToken exists → try refresh

  POST https://ims-na1.adobelogin.com/ims/token/v3
    grant_type=refresh_token
    client_id=darkalley
    refresh_token=<session.imsRefreshToken>

  Success → update session in place:
    session.imsToken = new access_token
    session.imsRefreshToken = new refresh_token (rotating)
    session.imsExpiresAt = now + expires_in * 1000

  → return new imsToken (transparent to MCP client, same session_token)

Failure → sessions.delete(session_token)
  → resolveSessionToken returns null
  → Server returns HTTP 401 (needs new implementation, see Section 7)
  → MCP client re-initiates OAuth flow automatically
```

---

## 5. What Changes Between Localhost and Hosted

### 5a. The localhost dual-server problem goes away

The current `http.ts` uses two servers:
- Port 3000: plain HTTP for MCP endpoint (because self-signed cert causes Claude issues)
- Port 3443: HTTPS with self-signed cert for OAuth callback (because Adobe IMS requires
  HTTPS redirect URIs)

On Railway with a real domain and TLS:
- Single server on `process.env.PORT`
- HTTPS is terminated by Railway's edge, so the app runs plain HTTP internally
- The `OAUTH_CALLBACK_URI` becomes `https://mcp.aemxsc.com/callback` — a real HTTPS URL
- No self-signed cert needed, no dual-server, no trust-prompt page

The `startOAuthHttpsServer()` function and the `oauthApp` become unnecessary. All OAuth
endpoints move to the main `app`.

### 5b. Discovery endpoint URL changes

`/.well-known/oauth-authorization-server` currently returns `https://localhost:3443` as
the issuer and OAuth endpoint base. On Railway this must return `https://mcp.aemxsc.com`.

Controlled by a `PUBLIC_URL` environment variable:

```typescript
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${activePort}`;
```

### 5c. Port binding change

```typescript
// Current (localhost only):
app.listen(port, "127.0.0.1", ...)

// Railway (accepts all interfaces including IPv6):
app.listen(port, "::", ...)
// Note: "::" accepts both IPv4 and IPv6 on Railway's infra
```

### 5d. OAUTH_CALLBACK_URI

```typescript
// Current:
const OAUTH_CALLBACK_URI = `https://localhost:${OAUTH_PORT}/callback`;

// Hosted:
const OAUTH_CALLBACK_URI = `${PUBLIC_URL}/callback`;
// = "https://mcp.aemxsc.com/callback"
```

---

## 6. Session-to-OAuth Association: The Answer

The question "how to associate MCP SSE connections with OAuth sessions" has a simpler
answer than the architecture might suggest, because there are no SSE connections.

**The association mechanism is the Bearer token itself.**

```
session_token (UUID) = key in sessions Map
sessions Map = { imsToken, imsRefreshToken, imsExpiresAt }

MCP Client sends:  Authorization: Bearer <session_token>
Server extracts:   extractBearer(req) → session_token
Server resolves:   sessions.get(session_token) → { imsToken }
IMS called with:   Authorization: Bearer <imsToken>
```

The OAuth callback updates `sessions` (via `authCodes` → `sessions`) before the MCP
client ever sends a request with that session_token. The flow is sequential: OAuth dance
completes → session_token issued → client uses session_token → session lookup succeeds.

There is no race condition, no out-of-band problem. The browser OAuth flow runs to
completion before the MCP client receives the session_token.

---

## 7. Request Flow: Unauthenticated Tool Call (Spec-Compliant Fix)

The current code returns a JSON-RPC error with "Not authenticated. Run da_login first."
This does not trigger the MCP client's automatic OAuth flow. The spec-compliant behavior:

**Current (wrong for hosted):**
```
POST /mcp (no Bearer) → 200 OK with JSON-RPC isError:true + text "run da_login"
```

**Correct for hosted (triggers auto OAuth in Claude Code):**
```
POST /mcp (no Bearer) → 401 Unauthorized
  WWW-Authenticate: Bearer realm="mcp.aemxsc.com"
```

Claude Code sees 401, reads `/.well-known/oauth-authorization-server`, opens the browser
to `https://mcp.aemxsc.com/authorize`, user logs in, Claude Code gets the session_token,
retries the request automatically.

**Code change needed in `/mcp POST` handler:**
```typescript
// Before handleTool dispatch, after resolveSessionToken:
if (IMS_OAUTH_ENABLED && !imsToken && !SERVER_TO_SERVER_MODE) {
  res.status(401)
    .set("WWW-Authenticate", `Bearer realm="${PUBLIC_URL}"`)
    .json({ error: "unauthorized", error_description: "Authentication required" });
  return;
}
```

---

## 8. Token Refresh: 24h IMS Expiry

The `resolveSessionToken()` function already handles refresh correctly:

1. Called on every `/mcp POST` before dispatching to tool handlers
2. Checks `imsExpiresAt - 60_000` (60-second buffer)
3. On expiry, calls IMS refresh endpoint
4. Updates `session` object in-place (same Map entry, same session_token)
5. MCP client never sees the token rotate — its session_token stays valid

The only gap: if refresh fails (refresh token expired, IMS rejects it), the server
currently returns `null` from `resolveSessionToken()` and then calls `handleTool` with
`imsToken = undefined`. Combined with the fix in Section 7 (return 401 on null token),
this correctly triggers MCP client re-authentication.

**IMS refresh token lifetime:** Adobe IMS refresh tokens are long-lived (typically 14
days). For a team demo tool used daily, automatic re-login should be rare.

---

## 9. Railway Architecture

### Single process, single port

Railway injects `PORT` env var. The application must bind to it:

```typescript
const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, "::", () => { ... });
```

Railway handles TLS termination at its edge. The Node.js process sees plain HTTP. The
`X-Forwarded-Proto: https` header is set by Railway's proxy.

### The `oauthApp` / dual-server elimination

In hosted mode, the separate HTTPS server on port 3443 is removed. All routes collapse
into a single `app` Express instance:

```
Single Express app on process.env.PORT:
  /.well-known/oauth-authorization-server
  /.well-known/oauth-protected-resource
  /authorize
  /callback
  /token
  /mcp    (POST = tools, DELETE = session close)
  /health
```

### Environment variables on Railway

| Variable | Value | Notes |
|----------|-------|-------|
| `PORT` | auto-injected | Railway sets this; do not hardcode |
| `PUBLIC_URL` | `https://mcp.aemxsc.com` | Controls discovery + callback URIs |
| `ADOBE_IMS_CLIENT_ID` | `darkalley` | Enables IMS OAuth mode |
| `NODE_ENV` | `production` | Optional, for logging |

`ADOBE_IMS_CLIENT_ID` set without `ADOBE_IMS_CLIENT_SECRET` activates `IMS_OAUTH_ENABLED`
mode — exactly right for per-user browser OAuth.

### Health check

The `/health` endpoint already exists. Railway health check config:
- Path: `/health`
- Expected: HTTP 200 with JSON `{ status: "ok" }`
- Timeout: 300s (default) — sufficient

### railway.json

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node dist/http.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### Cloudflare DNS (mcp.aemxsc.com → Railway)

1. Railway: add custom domain `mcp.aemxsc.com` → Railway provides a CNAME target
   (e.g., `g05ns7.up.railway.app`)
2. Cloudflare: add CNAME record
   - Name: `mcp`
   - Target: `g05ns7.up.railway.app`
   - Proxy status: DNS only (orange cloud OFF) for initial setup, then test
   - SSL/TLS mode: Full (not Flexible)
3. Railway: also needs `_acme-challenge.mcp.aemxsc.com` CNAME for SSL cert issuance

---

## 10. How Adobe CS MCP (mcp.adobeaemcloud.com) Does It

Sourced from Experience League documentation (MEDIUM confidence — internal architecture
not published):

- Endpoint: `https://mcp.adobeaemcloud.com/adobe/mcp/`
- Auth: OAuth with Adobe IMS, users authenticate with Adobe ID
- Per-user: "requests to AEM MCP tools run under the authenticated user's identity"
- Permissions: "MCP tools respect the user's AEM permissions" — each tool call is
  authorized against the user's AEM permissions, not a shared service account
- Session binding: "the MCP server issues tokens that the application uses for subsequent
  tool calls" — same pattern as our implementation (server-issued Bearer wrapping IMS)
- Token issuance model: server acts as OAuth authorization server + resource server,
  generates own Bearer tokens bound to IMS sessions (matches MCP spec third-party auth)

**Implication:** Our architecture mirrors what Adobe CS MCP does. The darkalley client
plays the same role as Adobe's internal MCP OAuth client. The key difference is we use
the public `darkalley` client (no secret) rather than an internal service credential.

---

## 11. Anti-Patterns to Avoid

### Anti-Pattern 1: Returning the IMS token to the MCP client
**What:** Passing the raw Adobe IMS access token directly to Claude Code as the
Bearer token.
**Why bad:** IMS tokens are short-lived (24h), Claude Code would need to re-auth every
24h even if refresh is possible. Also exposes the IMS token outside the server.
**Instead:** Server issues its own session UUID (done correctly in current code).

### Anti-Pattern 2: Session ID in the URL path
**What:** `https://mcp.aemxsc.com/mcp/{session_id}` to tie sessions to connections.
**Why bad:** Session ID in URL appears in server logs, Cloudflare logs, browser history.
Unnecessary since Streamable HTTP uses Bearer token per-request.
**Instead:** Bearer token in Authorization header (done correctly in current code).

### Anti-Pattern 3: Blocking on SSE for token delivery
**What:** Keeping an SSE connection open between OAuth callback and MCP client.
**Why bad:** Does not apply — there are no SSE connections. The OAuth flow completes
synchronously before the MCP client receives its session_token.
**Instead:** Not applicable. Sequential OAuth dance handles this correctly.

### Anti-Pattern 4: Storing tokens in files on Railway
**What:** `TOKEN_FILE`, `HLX_SITE_TOKEN_FILE` in `~/.hlx-admin-mcp/`
**Why bad:** Railway containers are ephemeral — filesystem resets on deploy. Also, hosted
mode has multiple users; file-based tokens conflict.
**Instead:** In hosted mode (`httpMode = true`), all token paths should be bypassed.
The `imsOverride` parameter already handles this for tool calls. But `da_login` tool
still calls `ensureHlxLoginServer()` and `openBrowser()` — both localhost-only features
that will fail silently on Railway. The `da_login` and `da_logout` tools need to be
disabled or redirected in hosted HTTP mode.

### Anti-Pattern 5: Dual-server on Railway
**What:** Running two Express servers (HTTP + HTTPS) on Railway.
**Why bad:** Railway only exposes one port. The HTTPS server on 3443 would be
unreachable. Adobe IMS redirect URI must be `https://mcp.aemxsc.com/callback`, served
by the single main app.
**Instead:** Collapse to single Express app. Remove `oauthApp` and `startOAuthHttpsServer`.

---

## 12. Build Order (Dependencies)

Phase dependencies for the implementation:

```
1. FOUNDATION (no dependencies)
   ├── Collapse dual-server → single Express app
   ├── Add PUBLIC_URL env var driving discovery + callback URI
   ├── Change port binding to "::" (Railway-compatible)
   └── Disable localhost-only tools in httpMode (da_login browser flow, da_logout)

2. AUTH FLOW (depends on Foundation)
   ├── Move /authorize, /callback, /token from oauthApp → main app
   ├── Change OAUTH_CALLBACK_URI to use PUBLIC_URL
   ├── Update /.well-known/* discovery to use PUBLIC_URL
   └── Add HTTP 401 response when no Bearer token + IMS_OAUTH_ENABLED

3. RAILWAY DEPLOY (depends on Foundation + Auth Flow)
   ├── Add railway.json with start command + health check
   ├── TypeScript build step (tsc → dist/)
   ├── Set env vars: PUBLIC_URL, ADOBE_IMS_CLIENT_ID, PORT
   └── Deploy + verify /health returns 200

4. DNS (depends on Railway Deploy)
   ├── Register aemxsc.com (Cloudflare)
   ├── Add CNAME mcp → Railway CNAME
   ├── Add _acme-challenge CNAME for SSL
   └── Verify https://mcp.aemxsc.com/health

5. VALIDATION (depends on DNS)
   ├── Add MCP config to Claude Code: url = https://mcp.aemxsc.com/mcp
   ├── Trigger 401 → OAuth browser flow → login
   ├── Confirm session_token stored by Claude Code
   └── Run da_list, da_get_content, hlx_preview end-to-end
```

Must-exist before what:
- PUBLIC_URL env var must exist before auth flow works
- Auth flow must work before Railway deploy is meaningful
- Railway deploy must be live before DNS can be validated
- DNS must propagate before end-to-end MCP client test

---

## 13. Specific Code Changes Needed

### `http.ts` changes

| Location | Current | Change | Why |
|----------|---------|--------|-----|
| `OAUTH_PORT` / `oauthApp` / `startOAuthHttpsServer` | Separate HTTPS server | Remove entirely | Railway single-port |
| `OAUTH_CALLBACK_URI` | `https://localhost:${OAUTH_PORT}/callback` | `${PUBLIC_URL}/callback` | Real domain |
| `/.well-known/*` responses | Hardcoded localhost | Use `PUBLIC_URL` | Clients must get correct URLs |
| `/authorize`, `/callback`, `/token` | On `oauthApp` (HTTPS server) | Move to `app` | Single server |
| `/mcp POST` — no-auth path | Falls through to tool with null token | Return HTTP 401 + WWW-Authenticate | Trigger MCP auto-auth |
| `tryListen()` hostname | `"127.0.0.1"` | `"::"` | Railway requires IPv6 wildcard |
| `main()` | `await startOAuthHttpsServer()` | Remove | No separate HTTPS server |

### `tools.ts` changes

| Location | Current | Change | Why |
|----------|---------|--------|-----|
| `da_login` handler | Calls `ensureHlxLoginServer()` + `openBrowser()` | In `httpMode`: return login URL as text | Localhost functions fail on Railway |
| `da_logout` handler | Calls `clearTokens()` + `clearHlxSiteToken()` | In `httpMode`: return "use session management" message | Files don't exist on Railway |
| `TOKEN_FILE` / file operations | Read/write `~/.hlx-admin-mcp/` | In `httpMode`: skip all file I/O | Ephemeral container |

### New files needed

| File | Purpose |
|------|---------|
| `railway.json` | Build + deploy + health check config |
| `.env.example` | Document required env vars for Railway setup |

---

## 14. Confidence Assessment

| Area | Confidence | Source |
|------|------------|--------|
| Streamable HTTP transport mechanics | HIGH | Official MCP spec 2025-03-26 |
| Bearer token per-request auth | HIGH | Official MCP spec + existing code |
| OAuth third-party auth flow | HIGH | Official MCP spec, matches current code |
| Session-to-token binding mechanism | HIGH | Direct code analysis |
| Railway PORT / binding requirements | MEDIUM | Railway docs + community reports |
| Railway IPv6 `::` requirement | MEDIUM | Community reports, not in official docs |
| Railway SSE 5-min timeout | N/A | Not relevant — no SSE used |
| Adobe CS MCP internal architecture | MEDIUM | Experience League docs, inferred |
| IMS refresh token lifetime (14 days) | MEDIUM | Adobe IMS common behavior, not spec |
| Cloudflare CNAME + SSL Full mode | HIGH | Multiple community sources agree |

---

## Sources

- [MCP Transports Specification 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [MCP Authorization Specification 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization)
- [Using MCP with AEM as a Cloud Service](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/ai-in-aem/mcp-support/using-mcp-with-aem-as-a-cloud-service)
- [Why MCP's Move Away from SSE Simplifies Security](https://auth0.com/blog/mcp-streamable-http/)
- [Railway Node.js Deployment Guide](https://docs.railway.com/guides/deploy-node-express-api-with-auto-scaling-secrets-and-zero-downtime)
- [Railway Health Checks](https://docs.railway.com/deployments/healthchecks)
- [Railway Application Failed to Respond](https://docs.railway.com/reference/errors/application-failed-to-respond)
- [Railway Working with Domains](https://docs.railway.com/networking/domains/working-with-domains)
- [Cloudflare CNAME + Railway community discussion](https://community.cloudflare.com/t/cannot-add-cname-record-from-railway/564681)
- [MCP Authentication Implementation Guide - Stytch](https://stytch.com/blog/MCP-authentication-and-authorization-guide/)

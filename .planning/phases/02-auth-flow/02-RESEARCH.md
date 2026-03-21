# Phase 2: Simplify - Research (UPDATED 2026-03-17)

**Researched:** 2026-03-17
**Domain:** Express HTTP server simplification, env-var token auth, MCP Streamable HTTP transport, Railway deployment
**Confidence:** HIGH

> **SUPERSEDES:** The 2026-03-14 RESEARCH.md described a PKCE/OAuth implementation that was built
> in plans 02-01 through 02-03. The requirements have since changed completely. This document
> describes what must be REMOVED and REPLACED for the new simplified Phase 2 scope.

---

## Summary

Plans 02-01 through 02-03 built a full PKCE/OAuth flow: `/login`, `/callback`, session Maps,
`pendingOAuthStates`, `resolveSessionToken`, PKCE helpers in exports, and a `da_login` httpMode
branch. All of this now needs to be torn out.

Adobe released the official DA MCP server at `https://mcp.adobeaemcloud.com/adobe/mcp/da`. It
handles all Document Authoring content operations (list, get, create, update, delete, copy, move,
versions, media, fragments) with built-in Adobe IMS auth. Our server's job is now HLX Admin only:
preview, publish, bulk ops, cache purge — nothing else.

Auth simplifies to a single environment variable: `HLX_ADMIN_TOKEN` set on Railway. Every
`admin.hlx.page` call sends it as `Authorization: Bearer <token>`. No sessions, no PKCE, no OAuth
dance, no browser redirect, no in-memory Maps.

The phase has two files to touch: `http.ts` (remove the entire OAuth/session layer, collapse to a
clean MCP-only server) and `tools.ts` (remove `da_login`, `da_logout`, `da_whoami` tool definitions
and handlers; wire `adminRequest` to use `HLX_ADMIN_TOKEN` directly).

**Primary recommendation:** Two focused plans — one for `http.ts` cleanup, one for `tools.ts`
cleanup — each with a smoke test confirming the simplification is complete.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | `HLX_ADMIN_TOKEN` env var wired as Bearer for all admin.hlx.page calls | Simplify `adminRequest()` in tools.ts: remove multi-path token priority, use `process.env.HLX_ADMIN_TOKEN` directly as Bearer |
| AUTH-02 | Token refresh procedure documented (no code changes — procedural only) | IMS tokens live ~24h; HLX API keys live ~1 year; refresh = set new Railway var + redeploy or use `hlx_create_apikey` once to get a long-lived key |
| HLX-01 | `hlx_preview` tool functional | Already implemented in tools.ts — no change needed once auth is wired |
| HLX-02 | `hlx_publish` tool functional | Already implemented — no change needed |
| HLX-03 | `hlx_unpublish` tool functional | Already implemented — no change needed |
| HLX-04 | `hlx_status` tool functional | Already implemented — no change needed |
| HLX-05 | `hlx_bulk_preview` tool functional | Already implemented — no change needed |
| HLX-06 | `hlx_bulk_publish` tool functional | Already implemented — no change needed |
| HLX-07 | `hlx_cache_purge` tool functional | Already implemented — no change needed |
| HLX-08 | `hlx_job_status` tool functional | Already implemented — no change needed |
</phase_requirements>

---

## What Currently Exists (State After Plans 02-01 through 02-03)

### http.ts (499 lines) — things that must be removed

| Symbol | Lines (approx) | Remove? |
|--------|---------------|---------|
| `import { createHash, randomBytes }` | 14 | YES — only used by PKCE/session code |
| `import { v4 as uuidv4 }` | 15 | YES — only used for session IDs |
| `import { generateCodeVerifier, generateCodeChallenge, exchangeCodeForToken, getClientCredentialsToken, setHttpMode }` | 17-28 | YES — remove all OAuth imports; keep `TOOLS`, `handleTool`, `SERVER_VERSION`, `IMS_BASE`, `Args` |
| `setHttpMode(true)` | 32 | YES — httpMode concept being retired |
| `IMS_CLIENT_ID`, `IMS_CLIENT_SECRET` consts | 37-38 | YES |
| `SERVER_TO_SERVER_MODE`, `IMS_OAUTH_ENABLED` consts | 41-44 | YES |
| `PendingOAuthState` interface | 48-55 | YES |
| `AuthCode` interface | 57-65 | YES |
| `Session` interface | 67-73 | YES |
| `pendingOAuthStates` Map | 76 | YES |
| `authCodes` Map | 77 | YES |
| `sessions` Map | 78-79 | YES |
| `setInterval` cleanup | 83-92 | YES |
| `verifyPkce()` | 96-99 | YES |
| `resolveSessionToken()` | 117-157 | YES |
| `/.well-known/oauth-authorization-server` route | 183-195 | YES |
| `/.well-known/oauth-protected-resource` route | 197-204 | YES |
| `GET /login` route | 208-243 | YES |
| `GET /callback` route | 245-302 | YES |
| 401 guard block in `POST /mcp` (OAuth session check) | 307-349 | YES — replace with simple token-from-env logic |
| `imsToken` variable passing to `handleTool` | 399 | CHANGE — pass `undefined`; tools read `HLX_ADMIN_TOKEN` directly |
| `DELETE /mcp` session close | 423-431 | SIMPLIFY — keep 204 response, remove session delete |
| `sessions.size` in `/health` | 444 | YES — remove from health payload |
| `activePort` fallback logic | 449-466 | KEEP |

**What remains in http.ts after cleanup:**
- Express app setup with `trust proxy` and CORS
- `app.use("/mcp", express.json())`
- `GET /health` route (simplified — remove `sessions`, `mode` fields)
- `POST /mcp` route (no auth guard — server is unauthenticated at HTTP level; tools use env var)
- `GET /mcp` → 405 (keep — correct behavior)
- `DELETE /mcp` → 204 (keep simplified)
- `tryListen` + `main` startup

### tools.ts — things that must be removed

| Symbol | Remove? | Notes |
|--------|---------|-------|
| `da_login` tool definition | YES | Lines ~497-514 |
| `da_logout` tool definition | YES | Lines ~515-519 |
| `da_whoami` tool definition | YES | Lines ~520-524 |
| `da_login` case in `handleTool` | YES | Lines ~791-849 |
| `da_logout` case in `handleTool` | YES | Lines ~851-858 |
| `da_whoami` case in `handleTool` | YES | Lines ~859-905 |
| `httpMode` export and `setHttpMode` | YES | No longer needed |
| `TOKEN_DIR`, `TOKEN_FILE`, `HLX_SITE_TOKEN_FILE` | YES | File-based token storage no longer used |
| `loadTokens`, `saveTokens`, `clearTokens` | YES | No longer used |
| `loadHlxSiteToken`, `saveHlxSiteToken`, `clearHlxSiteToken` | YES | No longer used |
| `getClientCredentialsToken` | YES | Server-to-server flow retired |
| `getImsToken` | YES | No IMS token flow in simplified server |
| `refreshImsToken` | YES | No refresh flow |
| `openBrowser` | YES | Not needed in http mode; local mode being retired |
| `pendingAuth`, `PendingAuth`, `callbackServerStarted`, `setPendingAuth` | YES | PKCE proxy flow gone |
| `ensureHlxLoginServer` | YES | Login callback server gone |
| `_hlxLoginServerStarted`, `_pendingLoginContext`, `setPendingLoginContext` | YES | Gone |
| `CALLBACK_PORT`, `CALLBACK_URI`, `HLX_LOGIN_PORT`, `HLX_LOGIN_CALLBACK` | YES |  |
| `exchangeCodeForToken` | YES | No token exchange |
| `generateCodeVerifier`, `generateCodeChallenge` | YES | No PKCE needed |
| `HlxSiteTokenStore` interface | YES | |
| `TokenStore` interface | YES | |
| `getHlxToken` | REPLACE | Replace with direct `process.env.HLX_ADMIN_TOKEN` read |
| `adminRequest` auth headers block | SIMPLIFY | Single `Authorization: Bearer ${token}` from env |
| `daRequest` | KEEP or SIMPLIFY | Used by `da_update_content`, `da_list`, `da_get_content`; use `HLX_ADMIN_TOKEN` as the bearer |
| `import fs, os, path` | YES — if only used by token file code | Verify no other usage before removing |
| `import { createServer as createHttpServer }` | YES | Login callback server gone |
| `import { exec }` | YES | `openBrowser` gone |

**What remains in tools.ts after cleanup:**
- `ADMIN_BASE`, `DA_BASE`, `DA_ADMIN_BASE`, `IMS_BASE` constants
- `SERVER_VERSION` constant
- `adminRequest` (simplified: reads `HLX_ADMIN_TOKEN` directly)
- `daRequest` (simplified: reads `HLX_ADMIN_TOKEN` directly)
- `formatResult`
- `TOOLS` array: `da_list`, `da_get_content`, `da_update_content`, and all `hlx_*` tools
- `handleTool` with cases for the above tools only
- `Args` type

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express | ^4.18.0 | HTTP routing for /mcp and /health | Already in project; no change needed |
| @modelcontextprotocol/sdk | ^1.0.0 | MCP Tool type definition | Already in project |
| node:fetch (built-in) | Node 18+ | HTTP calls to admin.hlx.page and DA APIs | Already used in adminRequest/daRequest |

### Removed Dependencies
| Library | Was Used For | Remove? |
|---------|-------------|---------|
| uuid | Session UUID generation | YES — no more sessions |
| createHash, randomBytes (node:crypto) | PKCE generation | YES — no more PKCE |
| node:fs, node:os, node:path | Token file storage | YES — no more file tokens |
| node:http createServer | HLX login callback server | YES |
| node:child_process exec | openBrowser | YES |

**Installation changes:**
```bash
# Remove uuid from dependencies (only used for sessions)
npm uninstall uuid
```

Note: `@types/uuid` should also be removed from devDependencies.

---

## Architecture Patterns

### Simplified http.ts Structure
```
Express app
├── app.set("trust proxy", 1)
├── app.use("/mcp", express.json())
├── CORS middleware
├── GET  /health   → { status: "ok", version, uptime }
├── POST /mcp      → JSON-RPC dispatch (no auth guard)
├── GET  /mcp      → 405 Method Not Allowed
└── DELETE /mcp    → 204 No Content
```

### Simplified tools.ts Structure
```
Constants (ADMIN_BASE, DA_BASE, DA_ADMIN_BASE, SERVER_VERSION)
adminRequest(method, path, body)  → reads HLX_ADMIN_TOKEN from env
daRequest(method, path, body)     → reads HLX_ADMIN_TOKEN from env (DA uses same token for now)
TOOLS array (da_list, da_get_content, da_update_content, hlx_*)
handleTool(name, args)            → switch/case, no imsOverride param
```

### Token Strategy

**For admin.hlx.page calls (all hlx_* tools):**
```typescript
// In adminRequest() — simplified
const token = process.env.HLX_ADMIN_TOKEN;
if (token) {
  headers["Authorization"] = `Bearer ${token}`;
}
// No fallback chain, no file tokens, no IMS resolution
```

**For DA API calls (da_update_content, da_list, da_get_content):**
```typescript
// daRequest() uses same HLX_ADMIN_TOKEN for now
// DA MCP handles its own auth for the real content ops
// These DA tools are fallback/transitional only
const token = process.env.HLX_ADMIN_TOKEN;
if (!token) {
  return { status: 401, ok: false, data: "HLX_ADMIN_TOKEN env var not set" };
}
headers["Authorization"] = `Bearer ${token}`;
```

**Note on token type:** The codebase already has `hlx_create_apikey` which creates a 1-year API
key for a site. This key works as a Bearer token to `admin.hlx.page`. For the demo, the simplest
approach is:
1. Run `hlx_create_apikey` once with an IMS token to get a long-lived key
2. Set that key as `HLX_ADMIN_TOKEN` on Railway
3. It lasts 1 year — no refresh needed until well after March 24

Alternative: Use a short-lived IMS access token (typically ~24h). Requires manual refresh on
demo morning. The `hlx_create_apikey` approach is strongly preferred.

### POST /mcp Handler Pattern (After Cleanup)
```typescript
app.post("/mcp", async (req: Request, res: Response) => {
  // No auth guard — HLX_ADMIN_TOKEN is read inside each tool via adminRequest()
  // MCP clients connect without Bearer tokens

  const body = req.body as { jsonrpc: string; id?: unknown; method?: string; params?: unknown };

  if (!body || body.jsonrpc !== "2.0" || !body.method) {
    res.status(400).json(jsonrpcError(body?.id ?? null, -32600, "Invalid Request"));
    return;
  }

  // ... switch on method: initialize, ping, tools/list, tools/call ...
  // tools/call: handleTool(p.name, p.arguments ?? {})  — no imsOverride arg
});
```

### handleTool Signature Change
```typescript
// BEFORE (current):
export async function handleTool(
  name: string,
  args: Args,
  imsOverride?: string  // ← REMOVE THIS PARAM
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>

// AFTER:
export async function handleTool(
  name: string,
  args: Args
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>
```

All internal calls to `adminRequest` and `daRequest` within `handleTool` drop the `imsOverride`
argument. Those functions read `HLX_ADMIN_TOKEN` from env directly.

### Anti-Patterns to Avoid
- **Leaving imsOverride parameter on handleTool:** Even unused, it creates confusion about whether session tokens are still a concept. Remove it fully.
- **Keeping `setHttpMode(true)` call in http.ts:** The `httpMode` flag was used to gate browser-open behavior in `da_login`. With `da_login` removed, `httpMode` is meaningless. Remove it from both files.
- **Partial cleanup leaving dead exports:** Functions like `generateCodeVerifier`, `getImsToken`, `exchangeCodeForToken` may be exported but unused after cleanup. Dead exports should be removed to keep the module clean — they confuse the planner on what's available.
- **Leaving `uuid` import after removing session code:** TypeScript won't error on unused imports, but it adds unnecessary dependency weight. `npm uninstall uuid` + remove import.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token refresh | Custom refresh loop | Just use HLX API key (1-year TTL from hlx_create_apikey) | An API key outlives the demo by 11 months |
| Per-request auth | Session management | Single env var read at request time | Stateless is simpler and Railway-safe |
| OAuth flow | Custom PKCE implementation | Nothing — remove it | DA MCP handles auth for content ops |

**Key insight:** The auth complexity that was built is now entirely unnecessary. The simplification
is the feature.

---

## Common Pitfalls

### Pitfall 1: Leaving Dead Imports in tools.ts
**What goes wrong:** `import fs from "node:fs"` etc. remain after token file functions are removed. TypeScript may not error (if the import is used elsewhere) or may (if it's not). Node-specific modules like `exec` and `createServer` bloat the Railway image.
**Why it happens:** Removing a function but not auditing its imports.
**How to avoid:** After removing each batch of functions, run `npm run build` and check for unused import warnings. Remove any import that is no longer referenced.
**Warning signs:** `npm run build` completes but `tsc --noUnusedLocals` flags variables.

### Pitfall 2: Forgetting imsOverride in Tool Handler Calls
**What goes wrong:** After removing `imsOverride` from `handleTool`, the internal calls to `adminRequest("GET", ..., undefined, imsOverride)` still pass the old fourth argument. TypeScript will error.
**Why it happens:** The fourth parameter to `adminRequest` is optional — TypeScript would not catch it being passed if the signature still accepts `string | undefined`. But once the signature is tightened, all callers must be updated.
**How to avoid:** Change `adminRequest` and `daRequest` signatures first, then fix all call sites. Run `npm run build` to find every missed spot.
**Warning signs:** `npm run build` exits non-zero with "Expected X arguments, but got Y."

### Pitfall 3: Railway Env Vars Wiped on Redeploy
**What goes wrong:** Team member triggers a redeploy. Railway wipes `HLX_ADMIN_TOKEN`. Demo fails.
**Why it happens:** Railway service variables are NOT wiped on redeploy — they persist in service configuration. However, if someone redeploys from a fresh service creation or uses `railway up` with a `railway.toml` that overrides variables, they could be lost.
**How to avoid:** Set `HLX_ADMIN_TOKEN` via the Railway dashboard Variables tab, not via `railway.toml` (which would be committed to git). Dashboard variables persist across all redeployments.
**Warning signs:** POST /mcp to hlx_status returns 401 from admin.hlx.page after a redeploy.

### Pitfall 4: TOKEN Type Confusion (IMS vs API Key)
**What goes wrong:** Using a short-lived IMS access token (~24h) as `HLX_ADMIN_TOKEN`. Demo morning arrives, token expired, server returns 401.
**Why it happens:** IMS tokens expire. Railway env vars persist but the value becomes stale.
**How to avoid:** Use `hlx_create_apikey` to generate a 1-year API key and store THAT as `HLX_ADMIN_TOKEN`. The API key uses `X-Auth-Token` header format per the existing code, or Bearer format depending on the key type. Verify against admin.hlx.page behavior.
**Warning signs:** hlx_status returns 401 exactly one day after setting the token.

**Important note on token header format:** The existing `adminRequest()` has complex priority logic:
- IMS token → `Authorization: Bearer <token>`
- HLX site token (not API key) → `Authorization: Bearer <token>`
- `HLX_API_KEY` → `X-Auth-Token: <token>`
- `HLX_AUTH_TOKEN` → `Authorization: token <token>`

The new simplified code should use one format. Based on the existing `hlx_create_apikey` tool, API keys from `admin.hlx.page /config/{org}/sites/{site}/apiKeys.json` are likely Bearer tokens. Confirm this by testing `hlx_create_apikey` output and checking what the admin API actually expects.

### Pitfall 5: DA API Auth After Removing IMS Flow
**What goes wrong:** `da_update_content`, `da_list`, `da_get_content` call `daRequest()` which previously tried IMS token first, then HLX site token. After removing IMS infrastructure, if `HLX_ADMIN_TOKEN` is not accepted by `content.da.live` / `admin.da.live`, these tools break.
**Why it happens:** DA API and admin.hlx.page may accept different token types. An HLX API key might not be valid for DA.
**How to avoid:** Keep `da_update_content` as a tool but be clear in the tool description that it requires a DA-capable token. For the March 24 demo, if the HLX API key doesn't work for DA writes, DA MCP handles content writes natively — `da_update_content` becomes the fallback "atomic save+preview" tool that requires a separate `DA_TOKEN` env var.
**Recommendation:** Support both `HLX_ADMIN_TOKEN` (for admin.hlx.page) and optionally `DA_TOKEN` (for da.live). In `daRequest()`: prefer `DA_TOKEN`, fall back to `HLX_ADMIN_TOKEN`. If neither set, return a clear 401 message.
**Warning signs:** `da_update_content` returns 401 from admin.da.live while hlx_preview succeeds.

### Pitfall 6: MCP Client Config After Removing Auth
**What goes wrong:** Team members' MCP configs include `Authorization: Bearer <old-session-token>` from the PKCE era. Now the server doesn't require Bearer — their config is stale and may confuse debugging.
**Why it happens:** The PKCE era required a Bearer session token. The new server has no auth at the HTTP transport level.
**How to avoid:** Update the MCP client config snippet to not include Authorization header. The MCP config for the simplified server is just the URL: `https://mcp.aemxsc.com/mcp`.
**Warning signs:** Team member reports unexpected behavior — check if they're sending a stale Bearer header.

---

## Code Examples

### Simplified adminRequest (after cleanup)
```typescript
// Source: direct simplification of existing adminRequest() in tools.ts
export async function adminRequest(
  method: string,
  urlPath: string,
  body?: unknown
): Promise<AdminResponse> {
  const token = process.env.HLX_ADMIN_TOKEN;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": `hlx-admin-mcp/${SERVER_VERSION}`,
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(`${ADMIN_BASE}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  // ... rest of response handling unchanged
}
```

### Simplified POST /mcp handler (no auth guard)
```typescript
// Source: existing http.ts POST /mcp handler with OAuth block removed
app.post("/mcp", async (req: Request, res: Response) => {
  const body = req.body as {
    jsonrpc: string;
    id?: unknown;
    method?: string;
    params?: unknown;
  };

  if (!body || body.jsonrpc !== "2.0" || !body.method) {
    res.status(400).json(jsonrpcError(body?.id ?? null, -32600, "Invalid Request"));
    return;
  }

  const { id, method, params } = body;

  try {
    switch (method) {
      case "initialize": { /* unchanged */ break; }
      case "notifications/initialized": { res.status(200).end(); break; }
      case "ping": { res.json(jsonrpcResult(id, {})); break; }
      case "tools/list": { res.json(jsonrpcResult(id, { tools: TOOLS })); break; }
      case "tools/call": {
        const p = params as { name?: string; arguments?: Args } | undefined;
        if (!p?.name) { res.json(jsonrpcError(id, -32602, "Missing tool name")); break; }
        const result = await handleTool(p.name, p.arguments ?? {});  // no imsToken arg
        res.json(jsonrpcResult(id, result));
        break;
      }
      default: { res.json(jsonrpcError(id, -32601, `Method not found: ${method}`)); }
    }
  } catch (err) {
    // ... unchanged error handling
  }
});
```

### Simplified /health response
```typescript
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    server: "hlx-admin-mcp",
    version: SERVER_VERSION,
    uptime: process.uptime(),
  });
  // Removed: mode, sessions, port — not relevant after simplification
});
```

### MCP Client Config (two-MCP setup for Claude Code)
```json
{
  "mcpServers": {
    "da": {
      "type": "http",
      "url": "https://mcp.adobeaemcloud.com/adobe/mcp/da"
    },
    "hlx": {
      "type": "http",
      "url": "https://mcp.aemxsc.com/mcp"
    }
  }
}
```

No Authorization header needed for our server. DA MCP handles its own auth via Adobe IMS connector.

### railway.toml (no changes needed)
```toml
[build]
buildCommand = "npm ci && npm run build"

[deploy]
startCommand = "node dist/http.js"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
```

This file is already correct from Phase 1. Railway injects `PORT` automatically.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PKCE/OAuth session flow | Single env var bearer token | Phase 2 Simplify (this phase) | No browser, no redirect URIs, no session state |
| `da_login`, `da_logout`, `da_whoami` tools | Removed — DA MCP handles auth | Phase 2 Simplify | Team config needs DA MCP + HLX MCP, not login tools |
| In-memory sessions Map | No sessions | Phase 2 Simplify | Railway can redeploy without state loss risk |
| IMS token as auth mechanism | HLX API key or IMS token via env var | Phase 2 Simplify | Static token, lasts 1 year with API key |
| DA content operations in HLX MCP | DA MCP (Adobe official server) | 2026-03-16 (Adobe release) | Two-MCP setup; content ops separated from publish ops |

**Deprecated/outdated after this phase:**
- `setHttpMode` / `httpMode` flag: No longer meaningful — the HTTP server always runs, local mode is not being maintained.
- `darkalley` client ID: No longer needed — no OAuth dance.
- `/.well-known/oauth-authorization-server` endpoint: Remove.
- `CALLBACK_PORT`, `CALLBACK_URI`, `HLX_LOGIN_PORT`, `HLX_LOGIN_CALLBACK` constants: Remove.

---

## Open Questions

1. **HLX API key vs IMS token for `HLX_ADMIN_TOKEN`**
   - What we know: `hlx_create_apikey` generates a 1-year key stored at `/config/{org}/sites/{site}/apiKeys.json`. `getHlxToken()` shows it uses `X-Auth-Token` header for `HLX_API_KEY` env var. IMS Bearer token is also accepted.
   - What's unclear: Whether the API key created by `hlx_create_apikey` uses Bearer format or X-Auth-Token format. The existing code distinguishes them (`HLX_API_KEY` uses `X-Auth-Token`, `HLX_AUTH_TOKEN` uses `Authorization: token <token>`).
   - Recommendation: The simplified `adminRequest()` should use `Authorization: Bearer <token>` (standard). Test with `hlx_status` after setting token. If Bearer works with an IMS token, prefer IMS token for initial setup, then use `hlx_create_apikey` to get a 1-year key and swap it in.

2. **DA token vs HLX_ADMIN_TOKEN for da_update_content**
   - What we know: DA API (`admin.da.live`) uses Adobe IMS Bearer tokens. An HLX API key may not be valid there.
   - What's unclear: Whether the token that works for admin.hlx.page also works for admin.da.live. These are different Adobe services.
   - Recommendation: Support a separate `DA_TOKEN` env var as optional. If set, use it for DA API calls. If not set, fall back to `HLX_ADMIN_TOKEN`. This gives flexibility without forcing the user to figure out compatibility on demo day.

3. **Whether to keep da_list and da_get_content**
   - What we know: Requirements say KEEP as "fallback while DA MCP is early access only." DA MCP is confirmed available at `https://mcp.adobeaemcloud.com/adobe/mcp/da`.
   - What's unclear: Whether "early access only" means some team members can't use DA MCP yet.
   - Recommendation: Keep `da_list` and `da_get_content` for now (minimal risk, provides fallback). They can be removed in a cleanup pass once DA MCP is confirmed accessible to all team members.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bash smoke tests (existing test-phase1.sh pattern) |
| Config file | none — scripts in `tools/hlx-admin-mcp/` |
| Quick run command | `bash tools/hlx-admin-mcp/test-phase2.sh` |
| Full suite command | `bash tools/hlx-admin-mcp/test-phase2.sh && bash tools/hlx-admin-mcp/test-phase1.sh` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | `HLX_ADMIN_TOKEN` env var used as Bearer in admin.hlx.page calls | static + smoke | `grep -c 'HLX_ADMIN_TOKEN' tools/hlx-admin-mcp/src/tools.ts` → non-zero; `npm run build` exits 0 | ❌ Wave 0 (update test-phase2.sh) |
| AUTH-01 | No IMS OAuth code in http.ts (sessions Map, PKCE, /login, /callback removed) | static | `grep -c 'pendingOAuthStates\|sessions\.set\|/login\|/callback' tools/hlx-admin-mcp/src/http.ts` → 0 | ❌ Wave 0 |
| AUTH-01 | POST /mcp with valid tool call returns 200 (no auth guard blocking) | smoke | `PORT=9999 HLX_ADMIN_TOKEN=test node dist/http.js & sleep 1; curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:9999/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` → 200 | ❌ Wave 0 |
| AUTH-02 | Token refresh procedure documented | manual | Human reads documentation, confirms procedure is clear | manual-only |
| HLX-01 through HLX-08 | All hlx_* tools appear in tools/list response | smoke | `POST /mcp tools/list` → response includes hlx_preview, hlx_publish, hlx_unpublish, hlx_status, hlx_bulk_preview, hlx_bulk_publish, hlx_cache_purge, hlx_job_status | ❌ Wave 0 |
| HLX-01 through HLX-08 | da_login, da_logout, da_whoami NOT in tools/list | static + smoke | `grep -c 'da_login\|da_logout\|da_whoami' tools/hlx-admin-mcp/src/tools.ts` → 0; tools/list response excludes them | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run build` exits 0 + static grep checks
- **Per wave merge:** `bash tools/hlx-admin-mcp/test-phase2.sh`
- **Phase gate:** Full smoke suite green + manual `hlx_status` call against real admin.hlx.page before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tools/hlx-admin-mcp/test-phase2.sh` — REPLACE existing file with new checks for Phase 2 Simplify (old version tested PKCE/OAuth, now tests simplification)
- New checks needed: no OAuth code in http.ts, no da_login in tools.ts, POST /mcp returns 200 without Bearer, tools/list contains all 8 hlx_* tools

*(AUTH-02 runtime token validation and HLX-01 through HLX-08 live admin.hlx.page calls are manual-only — require valid HLX_ADMIN_TOKEN set)*

---

## Sources

### Primary (HIGH confidence)
- Direct code analysis of `tools/hlx-admin-mcp/src/http.ts` (499 lines, post-plans-02-01-to-02-03 state)
- Direct code analysis of `tools/hlx-admin-mcp/src/tools.ts` (1168 lines, post-plans-02-01-to-02-03 state)
- `.planning/REQUIREMENTS.md` (updated 2026-03-16) — AUTH-01, AUTH-02, HLX-01 through HLX-08
- `.planning/ROADMAP.md` (updated 2026-03-16) — Phase 2 Simplify goal and success criteria
- DA MCP documentation at `https://docs.da.live/about/early-access/da-mcp` — confirms DA MCP URL and tools (fetched 2026-03-17)
- Railway docs at `https://docs.railway.com/guides/variables` — confirmed env vars persist across redeployments

### Secondary (MEDIUM confidence)
- Railway PORT binding behavior — verified from multiple official Railway error docs and community sources
- DA MCP endpoint `https://mcp.adobeaemcloud.com/adobe/mcp/da` — confirmed from docs.da.live fetch

### Tertiary (LOW confidence)
- HLX API key vs IMS token header format compatibility — inferred from existing code patterns; needs runtime validation
- DA API token compatibility with `HLX_ADMIN_TOKEN` — unverified; flagged as open question

---

## Metadata

**Confidence breakdown:**
- What to remove: HIGH — code is right in front of us; symbols are clearly identified
- Token strategy: MEDIUM — HLX_ADMIN_TOKEN as Bearer is clear; DA token compatibility needs runtime test
- Railway behavior: HIGH — env vars persist; PORT binding confirmed
- DA MCP availability: HIGH — docs.da.live confirms it is live at stated URL

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable domain — simplification is a known-good pattern)

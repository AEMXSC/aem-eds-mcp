# Technology Stack

**Project:** AEM EDS Hosted MCP Server (mcp.aemxsc.com)
**Researched:** 2026-03-14
**Research Mode:** Ecosystem — hosted Node.js MCP server with per-user OAuth sessions

---

## Context: What Exists vs. What Changes

The existing server (`tools/hlx-admin-mcp/src/http.ts`) already makes several correct decisions. Research validates them and identifies what must change for hosted deployment.

**Already correct (keep as-is):**
- Express + TypeScript — no change needed
- POST /mcp JSON-RPC (Streamable HTTP transport) — this IS the right modern MCP transport
- In-memory Map for sessions — appropriate for v1 team use
- UUID-based session tokens — correct
- PKCE double-hop pattern (Claude Code PKCE → IMS PKCE) — architecturally sound

**Must change for hosted deployment:**
- Listen address: `127.0.0.1` → `0.0.0.0` (Railway requires this)
- OAuth callback: self-signed HTTPS server on :3443 → Railway's built-in HTTPS at `/callback`
- Port: hardcoded 3000 → `process.env.PORT` (Railway injects this)
- OAuth discovery endpoints: `localhost` → `https://mcp.aemxsc.com`
- Trust proxy: add `app.set('trust proxy', 1)` for Railway's reverse proxy

---

## Recommended Stack

### Core Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 22.x LTS | Runtime | Railway Railpack auto-detects; v22 has native ESM, V8 v12.4. Existing codebase uses ESM (`"type": "module"`). |
| TypeScript | ^5.0.0 | Type safety | Already in codebase. Compile to `dist/` before Railway start command. |

### MCP Transport

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @modelcontextprotocol/sdk | ^1.27.1 | MCP protocol | Current package.json has `^1.0.0` which resolves to 1.27.1 already. Streamable HTTP transport (POST /mcp) is the CURRENT spec — SSE-only transport is deprecated as of MCP spec 2025-03-26 and being removed April 2026. The existing POST /mcp implementation is already correct. |

**Critical transport clarification:** The existing server uses HTTP POST with JSON-RPC — this IS Streamable HTTP transport. It is NOT the deprecated SSE transport (which required GET /sse for a persistent event stream). The existing implementation avoids Railway's 5-minute SSE timeout entirely because each MCP call is a discrete POST → response cycle.

### Web Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| express | ^4.18.0 | HTTP server | Already in codebase. Mature, well-understood. Express 5 is in RC but not yet stable enough for a March 24 deadline — stay on 4.x. |
| cors (via manual headers) | — | CORS | Already implemented inline in http.ts. Keep as-is — no separate cors package needed. |

### Session Management

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Map<string, Session> | built-in | Per-user IMS token storage | Already implemented correctly. For v1 team use (5-10 users, single Railway instance), a `Map` is appropriate. `express-session` adds cookie complexity that conflicts with MCP's Bearer token auth model. |
| uuid | ^9.0.0 | Session ID generation | Already in codebase. `crypto.randomUUID()` from Node 22 built-ins would also work, but uuid v9 is fine. |

**Session persistence caveat:** Railway redeploys wipe in-memory state. All active sessions are invalidated on every deploy. For v1 (team of ~5 people, infrequent deploys), this is acceptable — users re-authenticate after deploy. Document this in the onboarding guide.

### OAuth

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Adobe IMS PKCE flow | — | User authentication | Already implemented. In production, Railway's HTTPS terminates TLS — no self-signed cert server needed. The `:3443` HTTPS server in `http.ts` is a localhost-only workaround that is replaced by a single `/callback` route on the main Express app. |
| node:crypto | built-in | PKCE verifier/challenge | Already used. No third-party dependency needed. |

**OAuth callback for hosted deployment:** Adobe IMS requires HTTPS redirect URIs. Railway provides HTTPS automatically via its edge proxy (`https://mcp.aemxsc.com`). The hosted callback URI becomes `https://mcp.aemxsc.com/callback` — registered in the `darkalley` OAuth client configuration. The dual-server architecture (`:3000` + `:3443`) collapses to a single Express server on Railway.

### Infrastructure

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Railway | Hobby plan (~$5/mo) | Persistent Node.js hosting | Persistent processes (not serverless) — essential for in-memory session Map. Auto-deploys from GitHub. Built-in HTTPS. 5-minute HTTP timeout does NOT affect POST /mcp pattern (each request completes in <30s). SSE persistent connections would hit this timeout, but the existing POST model is immune. |
| Cloudflare | Free + ~$10/yr domain | DNS + domain | `mcp.aemxsc.com` CNAME to Railway's `*.up.railway.app` hostname. Use "DNS Only" (grey cloud) for the subdomain — proxied (orange cloud) requires Cloudflare Advanced Certificate Manager for subdomains, which is unnecessary cost. SSL mode: Flexible or Full when DNS-only. |

### Build Tooling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| tsc | ^5.0.0 | TypeScript compilation | Build command: `tsc`. Output to `dist/`. Start command: `node dist/http.js`. |
| tsx | ^4.0.0 | Dev-mode execution | Already in devDependencies. Not used in production Railway deployment — Railway runs compiled JS. |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Hosting | Railway | Fly.io, Render, Heroku | Railway: 5-min deploy, persistent processes, $5/mo, GitHub auto-deploy, best Railway MCP community precedent. Fly.io is viable but more config. Render has longer cold starts. |
| Hosting | Railway | Cloudflare Workers | Workers are serverless/stateless — incompatible with in-memory session Map without KV storage. Would require Redis or KV for sessions. Wrong fit for v1. |
| Session store | In-memory Map | express-session + MemoryStore | express-session MemoryStore is "purposely not for production" per its own docs (memory leaks). The existing custom Map with TTL cleanup is actually more correct. |
| Session store | In-memory Map | Redis (ioredis) | Correct v2 choice. Adds Railway Redis plugin (~$10/mo) and operational complexity. Out of scope for March 24 deadline. |
| MCP transport | POST /mcp (existing) | SSE GET /sse | SSE deprecated April 2026, hits Railway 5-min timeout for long-lived connections, requires persistent connection management. The existing POST pattern is correct. |
| OAuth server | Single Express app | Dual-server (:3000 + :3443) | The dual-server pattern is only needed for localhost self-signed cert workaround. On Railway, HTTPS is handled by the platform — collapse to single app. |
| TypeScript runtime | tsc compile + node | tsx in production | tsx adds 50-200ms startup overhead per import, not appropriate for production. |
| TypeScript runtime | tsc compile + node | ts-node | Similar overhead issue, plus ts-node is effectively deprecated in favor of tsx/esbuild approaches. |

---

## Railway-Specific Configuration

### railway.toml (place at repo root or tools/hlx-admin-mcp/)

```toml
[build]
buildCommand = "npm ci && npm run build"

[deploy]
startCommand = "node dist/http.js"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
```

Note: Railway's Config as Code does NOT follow the Root Directory setting — the `railway.toml` path must be absolute from repo root or set manually in the Railway dashboard. For a monorepo like this, set **Root Directory** to `tools/hlx-admin-mcp` in Railway service settings, and place `railway.toml` in that directory.

### Environment Variables (set in Railway dashboard → Variables tab)

| Variable | Value | Notes |
|----------|-------|-------|
| `PORT` | (auto-injected by Railway) | Do NOT set this manually. Railway injects it. Server must bind `0.0.0.0:${PORT}`. |
| `ADOBE_IMS_CLIENT_ID` | `darkalley` | The OAuth client ID with DA API access |
| `NODE_ENV` | `production` | Enables production logging behavior |
| `HLX_MCP_BASE_URL` | `https://mcp.aemxsc.com` | Used to construct OAuth discovery and callback URLs |

Use Railway's "Sealed Variables" for `ADOBE_IMS_CLIENT_ID` — once sealed, value is not visible via UI or API.

### Critical Code Changes for Railway

**1. Bind to 0.0.0.0, not 127.0.0.1**

```typescript
// WRONG (current localhost binding)
srv = app.listen(port, "127.0.0.1", ...)

// CORRECT for Railway
const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, "0.0.0.0", () => { ... });
```

**2. Trust Railway's reverse proxy**

```typescript
// Add immediately after app = express()
app.set("trust proxy", 1);
// This makes req.secure === true and req.protocol === "https"
// Required for OAuth redirects to use correct scheme
```

**3. OAuth discovery — use BASE_URL env var, not localhost**

```typescript
const BASE_URL = process.env.HLX_MCP_BASE_URL ?? `http://localhost:${PORT}`;

app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/authorize`,
    token_endpoint: `${BASE_URL}/token`,
    // ...
  });
});
```

**4. Collapse dual-server to single server**

The `/authorize`, `/callback`, and `/token` routes move from the `:3443` HTTPS Express app to the main app. Railway provides HTTPS at the edge — no self-signed cert needed. The `selfsigned` npm package and `createHttpsServer` imports can be removed from `http.ts`.

**5. OAuth callback URI**

```typescript
const OAUTH_CALLBACK_URI = process.env.HLX_MCP_BASE_URL
  ? `${process.env.HLX_MCP_BASE_URL}/callback`
  : `http://localhost:${PORT}/callback`;
```

This URI must be registered in the `darkalley` OAuth client's allowed redirect URIs in Adobe Developer Console.

---

## Cloudflare DNS Configuration

```
Type:    CNAME
Name:    mcp
Target:  <railway-provided-hostname>.up.railway.app
Proxy:   DNS Only (grey cloud)
```

Why "DNS Only": Railway issues its own TLS certificate for the domain. If Cloudflare proxying (orange cloud) is enabled on a subdomain, Cloudflare requires Advanced Certificate Manager (~$10/mo) to issue a cert for `mcp.aemxsc.com`. DNS Only avoids this cost — Railway handles TLS directly.

SSL propagation: Certificate issuance on Railway takes up to 1 hour after DNS is configured.

---

## Railway Timeout Behavior

**5-minute hard timeout applies to:** Long-lived HTTP connections (SSE streams, WebSockets on HTTP transport, requests that don't respond within 5 minutes).

**Does NOT affect:** The existing POST /mcp pattern. Each MCP tool call is a POST request that completes with a JSON response in <30 seconds. The Railway timeout is irrelevant to this pattern.

**Would have affected:** An SSE transport (`GET /sse` → persistent event stream). This is why the existing POST architecture is the right choice for Railway.

**Practical implication:** No keepalive tuning, no heartbeat logic, no reconnection handling needed in the MCP endpoint. Health check endpoint (`GET /health`) returning 200 OK in <1s is sufficient.

---

## Installation

```bash
# In tools/hlx-admin-mcp/

# Update MCP SDK to current
npm install @modelcontextprotocol/sdk@latest

# Remove localhost-only dependency (no longer needed for hosted)
npm uninstall selfsigned

# No new runtime dependencies needed for Railway deployment
# All session management uses built-in Map + uuid (already present)
```

---

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| `selfsigned` npm package | Only needed for localhost self-signed cert. Railway provides real HTTPS. Remove it. |
| `express-session` | Designed for cookie-based sessions. Conflicts with MCP Bearer token auth. The existing Map pattern is cleaner. |
| Redis / `ioredis` | Correct v2 choice, wrong for v1 March 24 deadline. In-memory Map + documented "re-auth on redeploy" is acceptable for 5-person team use. |
| SSE transport (`GET /sse` persistent stream) | Deprecated in MCP spec 2025-03-26, being removed April 2026, and hits Railway's 5-minute timeout. The existing POST /mcp is correct. |
| Serverless hosts (Cloudflare Workers, Vercel, AWS Lambda) | Stateless — incompatible with in-memory session Map. Would require KV/Redis store. |
| `tsx` in production | Development tool only. Railway runs `node dist/http.js` after `tsc` compilation. |
| Dual-port architecture (`:3000` + `:3443`) | Localhost workaround for HTTPS requirement. Unnecessary on Railway where HTTPS is platform-provided. |

---

## Sources

- [MCP Transports Specification 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — Streamable HTTP is the canonical transport; SSE deprecated
- [SSE Transport Deprecation — Migration to Streamable HTTP](https://changelog.keboola.com/sse-transport-deprecation-migration-to-streamable-http/) — April 2026 removal date
- [@modelcontextprotocol/sdk on npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — v1.27.1 current
- [Railway Express Deploy Guide](https://docs.railway.com/guides/express) — PORT binding, build/start commands
- [Railway Health Checks](https://docs.railway.com/deployments/healthchecks) — `/health` endpoint configuration
- [Railway Variables](https://docs.railway.com/variables) — Sealed variables, auto-injected PORT
- [Railway Config as Code](https://docs.railway.com/reference/config-as-code) — railway.toml structure
- [Railway Monorepo Guide](https://docs.railway.com/guides/monorepo) — Root Directory setting for subdirectory services
- [Railway 5-minute timeout thread](https://station.railway.com/questions/any-workarounds-for-the-5-min-request-ti-b055adde) — Confirms timeout, recommends WebSockets as workaround (not needed here)
- [Railway SSE timeout](https://station.railway.com/questions/are-there-limits-on-total-transfer-size-3c991de1) — SSE connections affected by 5-min limit
- [Railway Cloudflare CNAME](https://docs.railway.com/networking/domains/working-with-domains) — Domain configuration
- [Cloudflare + Railway subdomain](https://community.cloudflare.com/t/cannot-add-cname-record-from-railway/564681) — DNS Only vs proxied behavior
- [Express trust proxy](https://expressjs.com/en/guide/behind-proxies.html) — Required for Railway's reverse proxy
- [Adobe IMS HTTPS redirect URI requirement](https://experienceleague.adobe.com/en/docs/workfront/using/adobe-workfront-api/api-notes/oauth-app-pkce-flow) — Confirms HTTPS required for OAuth callbacks
- [MCP Issue Hosting on Railway](https://station.railway.com/questions/issue-hosting-mcp-server-on-railway-ac9a7c36) — Community precedent
- [Build StreamableHTTP MCP Servers Guide](https://mcpcat.io/guides/building-streamablehttp-mcp-server/) — Stateful session Map pattern with StreamableHTTPServerTransport

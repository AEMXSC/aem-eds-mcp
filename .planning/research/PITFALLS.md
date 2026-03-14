# Domain Pitfalls

**Domain:** Hosted Node.js MCP server — Railway + Adobe IMS OAuth + Cloudflare
**Researched:** 2026-03-14
**Deadline:** March 24, 2026 (9 days)

---

## Critical Pitfalls

Mistakes that cause deploy failures, auth breaks, or hard rewrites before the demo.

---

### Pitfall 1: Server binds to 127.0.0.1 — Railway cannot reach it

**What goes wrong:**
The current `http.ts` binds the MCP server with `app.listen(port, "127.0.0.1", ...)` (line 541) and the OAuth HTTPS server with `httpsServer.listen(OAUTH_PORT, "127.0.0.1", ...)` (line 565). Railway's internal network proxy routes traffic to the container's external network interface, not loopback. A server bound to `127.0.0.1` is invisible to Railway's proxy and the app appears dead on arrival.

**Why it happens:**
The localhost binding made sense for local development (security: prevent external access). On Railway, the container runs in isolation — external == Railway's internal network, not the internet — so `0.0.0.0` is required.

**Consequences:**
Railway health checks fail immediately. Deployment shows "Application failed to respond." The service never becomes reachable. This is the single most likely reason the first Railway deploy fails.

**Warning signs:**
- Railway dashboard shows repeated health check failures
- `/health` endpoint returns no response when accessed via Railway URL
- Build succeeds but service status shows "unhealthy" or "crashed"

**Prevention:**
Change both listen calls:
```
app.listen(process.env.PORT || 3000, "0.0.0.0", ...)
```
Use `process.env.PORT` — Railway injects this dynamically. The current code uses `HLX_MCP_PORT` with a fallback; that fallback port may conflict or be blocked. Always read `PORT` as primary.

**Phase:** Phase 1 (initial Railway deploy) — day 1 blocker.

---

### Pitfall 2: The OAuth HTTPS server architecture does not translate to Railway

**What goes wrong:**
The current dual-server design runs an HTTPS server on port 3443 (self-signed cert, user must visit once to accept) for the OAuth callback, and an HTTP server on port 3000 for MCP. On Railway:
1. Railway exposes exactly one HTTP port per service via the public URL.
2. There is no browser to accept a self-signed cert warning on the server side.
3. `OAUTH_CALLBACK_URI` is hardcoded to `https://localhost:3443/callback` — Adobe IMS will reject any redirect to `localhost` from a hosted server.
4. Adobe IMS's allow list for the `darkalley` client contains specific registered redirect URIs. `https://mcp.aemxsc.com/callback` must be registered, or Adobe IMS will return `redirect_uri_mismatch`.

**Why it happens:**
The localhost dual-server was a workaround for a local constraint (Adobe requires HTTPS redirect URIs, localhost only has HTTP). In a hosted context, Railway terminates TLS for you — the app receives plain HTTP internally, Railway presents HTTPS externally. No self-signed cert needed.

**Consequences:**
The entire OAuth flow breaks. Users who click the login link get an Adobe IMS error page showing redirect URI mismatch. Auth is dead. The demo fails.

**Warning signs:**
- Adobe IMS returns error `redirect_uri_mismatch` or `invalid_redirect_uri` in the browser
- OAuth callback never fires; session is never created
- `OAUTH_CALLBACK_URI` in logs still contains `localhost`

**Prevention:**
1. Collapse to a single-port server on Railway. Let Railway handle TLS termination.
2. Set `OAUTH_CALLBACK_URI` via environment variable: `https://mcp.aemxsc.com/callback`
3. Mount the OAuth callback route (`/callback`, `/authorize`, `/token`) on the main Express app — no second HTTPS server needed.
4. Verify with the Adobe team or in Developer Console that `https://mcp.aemxsc.com/callback` is in the registered redirect URI patterns for the `darkalley` client_id. If not, this requires an Adobe-side change that could take days.

**Phase:** Phase 1 (architecture refactor before Railway deploy). Must be resolved before any auth testing.

---

### Pitfall 3: Adobe IMS redirect URI for `darkalley` client not registered for mcp.aemxsc.com

**What goes wrong:**
Adobe IMS validates the `redirect_uri` parameter against an allow list registered in Adobe Developer Console for the specific client_id (`darkalley`). The current code was written for `https://localhost:3443/callback`. Even if you fix the server architecture, IMS will reject `https://mcp.aemxsc.com/callback` unless it is explicitly registered.

**Why it happens:**
The `darkalley` client was set up for local development. The hosted redirect URI is a new entry that must be added by whoever owns the Developer Console project for `darkalley`. This may require Adobe internal approval or coordination with a team that has console access.

**Consequences:**
OAuth flow is broken in production even if all server code is correct. This is a third-party dependency — if the Adobe team cannot add the URI before March 22, the demo date slips or the demo must use a workaround (demo from localhost, not from mcp.aemxsc.com).

**Warning signs:**
- Testing OAuth against the hosted URL returns `redirect_uri_mismatch` from IMS
- Adobe IMS redirects to the error page rather than the callback

**Prevention:**
Identify who has Developer Console access for the `darkalley` OAuth client. Verify the current redirect URI allow list. Request `https://mcp.aemxsc.com/callback` (and optionally `https://mcp.aemxsc.com/*` as a pattern) be added. Do this on day 1 — allow list changes can take processing time and back-and-forth.

**Deadline risk:** HIGH. Must be confirmed by day 2-3 of the 9-day window.

**Phase:** Phase 1 prerequisite (external dependency).

---

### Pitfall 4: Adobe IMS refresh token unavailable without `offline_access` scope

**What goes wrong:**
The current server stores `imsRefreshToken` and uses it to extend sessions beyond 24 hours without re-login (`resolveSessionToken` refresh logic, lines 142-167). A refresh token is only returned by Adobe IMS when `offline_access` is included in the OAuth scope request (line 292 currently requests `openid AdobeID additional_info.roles`). If `offline_access` is not in the scope and/or not supported for the `darkalley`/`aem.frontend.all` context, `imsRefreshToken` will always be undefined and sessions will silently expire after 24 hours.

**Why it happens:**
Not all Adobe API scopes support `offline_access`. The code assumes refresh tokens are available but does not assert or warn when they are absent.

**Consequences:**
Users who authenticate in the morning will find all tools broken by the next morning. The code silently deletes the session and returns null (line 171), which in the MCP tool flow likely returns an "unauthenticated" error with no clear message to re-login.

**Warning signs:**
- `imsRefreshToken` is `undefined` in every session created
- Session expires exactly at the access token's `expires_in` boundary (24 hours)
- After 24 hours, MCP tools return auth errors and there is no automatic re-login prompt

**Prevention:**
1. Add `offline_access` to the IMS scope string and test whether the `darkalley` client returns a refresh token.
2. If `offline_access` is not supported, remove the misleading refresh logic and instead return a clear "session expired, please re-login" tool response when `resolveSessionToken` returns null.
3. The health endpoint already exposes `sessions.size` — also log session creation time to make expiry observable.

**Phase:** Phase 2 (auth validation/testing).

---

### Pitfall 5: Cloudflare proxy breaks SSE / long-lived HTTP streams (100-second timeout + buffering)

**What goes wrong:**
When Cloudflare is in proxy mode (orange cloud), it imposes two problems for long-lived connections:
1. Buffering: Cloudflare buffers `text/event-stream` responses and does not flush events to the client in real time, breaking streaming behavior.
2. 100-second timeout: Cloudflare times out connections that do not send a response within approximately 100 seconds, terminating the stream.

This affects both the MCP SSE transport (if implemented) and any streaming responses from tools.

**Why it happens:**
Cloudflare's proxy is designed for short HTTP request/response cycles. SSE and long-lived connections require special configuration. The `X-Accel-Buffering: no` response header can disable buffering at the nginx/proxy layer, but Cloudflare's proxy may still impose timeouts on its side.

**Consequences:**
MCP client connections drop after 100 seconds. Tool calls that take longer than 100 seconds (e.g., long content operations) return mid-stream errors. The demo breaks on any long operation.

**Warning signs:**
- SSE connections reliably drop at ~100 seconds
- Tool responses for longer operations arrive truncated or trigger connection reset errors in Claude Code
- Works fine when Cloudflare is set to DNS-only (grey cloud)

**Prevention:**
1. For the MCP transport (currently HTTP POST, not SSE): POST requests complete synchronously, so the 100-second limit applies only if a tool call takes over 100 seconds. Keep tool calls fast.
2. Add `X-Accel-Buffering: no` response header to all MCP and OAuth endpoints.
3. Set Cloudflare DNS record for `mcp.aemxsc.com` to DNS-only (grey cloud / "DNS Only") initially. This bypasses Cloudflare proxy entirely. SSL is handled by Railway (Let's Encrypt). Only enable proxy mode if WAF/DDoS features are needed, and only after testing.
4. If proxy mode is required: create a Cloudflare Cache Rule to bypass cache for `mcp.aemxsc.com/*`.

**Note on Railway SSL cert issuance:** Railway uses Let's Encrypt ACME challenges to provision SSL certs. If Cloudflare is in proxy mode during domain setup, Railway's ACME validation will fail. Set to DNS-only first, let Railway provision the cert, then optionally switch to proxied.

**Phase:** Phase 1 (DNS setup), Phase 2 (if SSE transport is added).

---

### Pitfall 6: In-memory session Map is wiped on every Railway redeploy

**What goes wrong:**
All sessions, pending OAuth states, and auth codes are stored in Node.js `Map` objects in process memory. Railway redeploys the container on every git push, every environment variable change, and when Railway performs maintenance restarts. All authenticated sessions are lost on redeploy. Users must re-authenticate immediately after any deployment.

**Why it happens:**
This is expected behavior for ephemeral containers. Railway has no persistent memory — only persistent volumes (disk). The PROJECT.md explicitly accepts this as a v1 trade-off, but the risk is that a mid-demo redeploy or Railway automatic restart wipes all sessions.

**Consequences:**
During a live demo, a Railway automatic container restart (e.g., OOM, Railway maintenance) forces every participant to re-authenticate mid-session. MCP tool calls return auth errors with no user-facing explanation.

**Warning signs:**
- All users suddenly experience auth failures at the same time
- Railway dashboard shows a recent container restart event
- `/health` response shows `sessions: 0` when users expect active sessions

**Prevention:**
1. Do not push new code or change env vars during the March 24 demo. Freeze the deployment 24 hours before.
2. Ensure the Railway service plan does not auto-restart on idle (use a health check that pings `/health` every 5 minutes to keep the container warm).
3. Ensure the `da_login` tool response clearly instructs users to re-login — the current "click login link" UX must still work after session loss.
4. For v2: migrate to a persisted store (Railway PostgreSQL volume or Redis).

**Deadline risk:** MEDIUM. The restart risk is manageable if deployment is frozen before the demo.

**Phase:** Phase 1 (acknowledged), Phase 3 (v2 mitigation with Redis).

---

### Pitfall 7: MCP SSE transport deprecated — current spec requires Streamable HTTP

**What goes wrong:**
The MCP specification deprecated SSE transport in version 2025-03-26 in favor of Streamable HTTP. A third-party source (Keboola, MEDIUM confidence) states SSE connections "will no longer be accepted after April 1, 2026" — 8 days after the March 24 demo. The current codebase explicitly returns 405 on GET `/mcp` (line 504) — it is already HTTP POST JSON-RPC, not SSE. However, the PROJECT.md refers to the server as "SSE transport," which may cause confusion about which transport to implement.

**Why it matters:**
If the team plans to add true SSE (GET `/mcp` streaming), that transport is deprecated and client support is winding down. Claude Code as of early 2026 supports both SSE and Streamable HTTP but may drop SSE in a future release. Building new features on the deprecated transport means a near-term rewrite.

**Warning signs:**
- Project documentation says "SSE" but the code serves HTTP POST
- Adding SSE GET endpoint before verifying client support timeline
- Claude Code MCP config uses `type: "sse"` URL format

**Prevention:**
1. Do not add a true SSE GET streaming endpoint. The current HTTP POST pattern IS the correct baseline for Streamable HTTP migration.
2. Implement GET `/mcp` to support Streamable HTTP per the 2025-03-26 spec (a GET returns an SSE stream only when the server wants to push; otherwise the transport is stateless HTTP POST). The TypeScript MCP SDK v1.10+ handles this automatically.
3. Clarify in docs and config: the transport is "Streamable HTTP" (or "HTTP POST"), not "legacy SSE."

**Confidence:** The April 1 date is MEDIUM confidence (third-party changelog). The spec deprecation is HIGH confidence. Claude Code SSE support removal timeline is LOW confidence.

**Phase:** Phase 1 (transport naming/clarification), Phase 2 (Streamable HTTP compliance check).

---

### Pitfall 8: Claude Code caches MCP session ID and does not auto-recover after server restart

**What goes wrong:**
Claude Code caches the `Mcp-Session-Id` at connection time. When the Railway container restarts (or is redeployed), the server loses all sessions. Claude Code continues sending the cached session ID — the server returns 404 — but Claude Code does not automatically reinitialize. MCP tools appear available but every call silently fails or returns errors. The fix requires a full Claude Code restart.

This is a known bug in Claude Code (GitHub issues #27142, #30224, #10525 — opened and active through early 2026).

**Why it happens:**
The MCP spec says clients MUST reinitialize when they receive 404 for a session ID. Claude Code does not implement this recovery. This is a client bug, not a server bug — but the server must be designed to minimize triggering it.

**Warning signs:**
- After a Railway redeploy, all MCP tool calls return errors or are silent
- Claude Code still shows the server as "connected" with tools listed
- Manually running `/mcp` reconnect command in Claude Code restores function

**Prevention:**
1. Return 404 (with a clear JSON body) when a session ID is unknown — this is the spec-correct signal to reinitialize.
2. Implement a heartbeat: the client (Claude Code) will detect stream closure from a server heartbeat timeout and attempt reconnect faster than it would detect a dead session from tool call failures.
3. Brief all demo participants: if tools stop working, type `/mcp` to reconnect, or restart Claude Code.
4. Freeze Railway deployment before the demo to avoid triggering the restart.

**Phase:** Phase 1 (defensive server response codes), Phase 2 (heartbeat implementation).

---

## Moderate Pitfalls

---

### Pitfall 9: Cloudflare SSL mode "Flexible" causes infinite redirect loop

**What goes wrong:**
If Cloudflare SSL/TLS mode is set to "Flexible" (the default for new zones), Cloudflare sends unencrypted HTTP to Railway. Railway redirects HTTP to HTTPS. Cloudflare receives the redirect, makes another HTTP request, gets redirected again — infinite loop. The site shows an ERR_TOO_MANY_REDIRECTS error.

**Prevention:**
Set Cloudflare SSL/TLS mode to "Full" or "Full (Strict)" before pointing the domain at Railway. Do not use "Flexible."

**Phase:** Phase 1 (DNS/Cloudflare setup).

---

### Pitfall 10: Railway SSL cert stuck in "Validating Challenges" when Cloudflare proxy is on

**What goes wrong:**
Railway uses Let's Encrypt ACME HTTP-01 challenge to provision SSL certs. When Cloudflare is in proxy mode (orange cloud), Let's Encrypt cannot reach Railway's origin to verify the challenge. The cert stays in "Validating" state indefinitely.

**Prevention:**
When initially adding the custom domain in Railway:
1. Set Cloudflare CNAME to DNS-only (grey cloud).
2. Wait for Railway to provision the cert (usually 1-5 minutes).
3. Optionally switch to proxied mode after cert is issued.

**Phase:** Phase 1 (DNS/Cloudflare setup).

---

### Pitfall 11: CAA DNS records block Let's Encrypt cert issuance

**What goes wrong:**
If the aemxsc.com domain has CAA (Certificate Authority Authorization) DNS records that do not include Let's Encrypt, Railway cannot issue SSL certs for `mcp.aemxsc.com`.

**Prevention:**
Check for CAA records when setting up DNS. If present, add `0 issue "letsencrypt.org"`. If the domain is newly registered through Cloudflare Registrar, there are no CAA records by default — this is a low-risk pitfall for a fresh domain.

**Phase:** Phase 1 (DNS setup).

---

### Pitfall 12: Railway PORT environment variable not read — app fails to start

**What goes wrong:**
The current code reads `process.env.HLX_MCP_PORT ?? "3000"`. Railway injects `PORT` (not `HLX_MCP_PORT`) as the port the container must listen on. If the app starts on 3000 but Railway expects it on PORT (e.g., 8080), the health check fails and the deployment is marked unhealthy.

**Prevention:**
Change port resolution to: `parseInt(process.env.PORT ?? process.env.HLX_MCP_PORT ?? "3000", 10)`. Read Railway's `PORT` first, fall back to `HLX_MCP_PORT` for local overrides.

**Phase:** Phase 1 (first Railway deploy).

---

### Pitfall 13: Railway cleanup interval (`setInterval`) keeps container alive but leaks memory

**What goes wrong:**
The 10-minute cleanup `setInterval` (lines 98-107) prevents Node.js process from exiting cleanly. On Railway, the `setInterval` also means the container will never idle-exit, which is fine for availability but means any memory leak accumulates indefinitely. Railway has automatic RAM-threshold restarts, but a restart wipes all sessions (see Pitfall 6).

**Prevention:**
Use `setInterval(...).unref()` so the interval does not block graceful shutdown. Monitor Railway memory metrics. If sessions grow unboundedly (sessions Map never shrinks), the cleanup interval correctly handles `pendingOAuthStates` and `authCodes` but does NOT clean up expired sessions — sessions have no TTL cleanup. Add session TTL cleanup (e.g., sessions older than 25 hours) to the interval.

**Phase:** Phase 2 (production hardening).

---

### Pitfall 14: `darkalley` OAuth client scope `aem.frontend.all` may not grant write access to all orgs

**What goes wrong:**
The `darkalley` client_id and `aem.frontend.all` scope grant DA API access for the `aemxsc` org. If a demo participant's org/site is not in the allowed scope for this client, DA write operations will return 403. The client was designed for the XAEMXSC team's use — it is not a multi-tenant OAuth client.

**Why it matters for the demo:**
PROJECT.md states the target org/site is `aemxsc/xscteamsite`. As long as the demo is scoped to this org, this is not a blocker. Expanding to customer orgs requires a different client or a customer-registered OAuth app.

**Prevention:**
Scope all demo content to `aemxsc/xscteamsite`. Document explicitly in the onboarding guide that this server is single-org in v1. Do not promise customer-org access during the demo without verifying with Adobe that `darkalley` scope covers it.

**Phase:** Phase 2 (demo planning).

---

## Minor Pitfalls

---

### Pitfall 15: CORS wildcard `Access-Control-Allow-Origin: *` blocks credential-bearing requests

**What goes wrong:**
The current CORS middleware sets `Access-Control-Allow-Origin: *`. Browsers block credential-bearing requests (with `Authorization` header or cookies) to wildcard CORS origins. MCP clients (Claude Code, Cursor) are not browsers, so this is not an immediate blocker — but if any web-based MCP client is added in the future, CORS will silently reject auth'd requests.

**Prevention:**
For MCP API endpoints, replace `*` with the specific expected origins (e.g., `https://claude.ai`, known MCP client origins). For the OAuth endpoints, restrict CORS to known redirect origins.

**Phase:** Phase 3 (production hardening / Experience League handoff).

---

### Pitfall 16: Health check endpoint exposes internal session count

**What goes wrong:**
The `/health` endpoint returns `sessions: sessions.size` (line 528). For a team-internal tool this is fine. For a public-facing endpoint at `mcp.aemxsc.com/health`, this leaks information about how many users are currently authenticated.

**Prevention:**
Remove `sessions` count from the public health response, or add authentication to the health endpoint. Keep it as a Railway internal health check only (Railway can reach it without it being publicly indexed).

**Phase:** Phase 3 (Experience League handoff hardening).

---

### Pitfall 17: Missing graceful shutdown — Railway SIGTERM drops in-flight requests

**What goes wrong:**
Railway sends SIGTERM before stopping a container (e.g., during redeploy). The current code has no SIGTERM handler. Node.js exits immediately, dropping any in-flight DA API calls or OAuth token exchanges mid-flight.

**Prevention:**
Add a SIGTERM handler that stops accepting new connections and waits up to 5 seconds for in-flight requests to complete before calling `process.exit(0)`. This is especially important for DA write operations that could leave content in a partial state.

**Phase:** Phase 2 (production hardening).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| First Railway deploy | 127.0.0.1 binding + PORT env var | Change to 0.0.0.0 + process.env.PORT before deploy |
| OAuth architecture | Dual-server HTTPS design doesn't work hosted | Collapse to single-port, use Railway TLS termination |
| Adobe IMS redirect URI | `darkalley` allow list doesn't include hosted URL | Verify and update Developer Console on day 1 |
| Cloudflare DNS setup | Proxy mode blocks Railway cert issuance | Start DNS-only, add cert, then optionally proxy |
| Cloudflare SSL mode | Flexible mode causes redirect loop | Set to Full before pointing DNS |
| Auth testing | Refresh tokens may be absent | Test `offline_access` scope; add re-login prompts |
| Demo day stability | Railway restart wipes all sessions | Freeze deploy 24h before; test reconnect UX |
| Transport naming | "SSE" in docs but code is HTTP POST | Clarify transport is Streamable HTTP compatible |
| MCP reconnection | Claude Code doesn't auto-recover from 404 sessions | Brief participants on `/mcp` reconnect command |
| Long-running tools | Cloudflare 100s timeout if proxied | Keep DNS-only or ensure tools complete in <90s |

---

## March 24 Deadline Risk Register

| Risk | Severity | Probability | Days to Resolve | Action |
|------|----------|-------------|-----------------|--------|
| darkalley redirect URI not registered for mcp.aemxsc.com | CRITICAL | HIGH | 2-5 (Adobe dependency) | Contact Adobe team day 1 |
| 127.0.0.1 binding breaks Railway deploy | CRITICAL | CERTAIN | 0.5 (code fix) | Fix before first push |
| Dual-server OAuth arch incompatible with Railway | CRITICAL | CERTAIN | 1-2 (code refactor) | Refactor to single-port |
| Railway restart during demo wipes sessions | HIGH | LOW | 0 (operational) | Freeze deploy day before |
| Cloudflare proxy breaks SSE/streaming | HIGH | MEDIUM | 0.5 (config) | Use DNS-only mode |
| Refresh tokens absent — 24h re-login required | MEDIUM | MEDIUM | 1 (test + fix) | Verify offline_access scope |
| MCP session ID caching bug in Claude Code | MEDIUM | HIGH | 0 (client bug) | Brief participants |

---

## Sources

- [Railway: Application Failed to Respond](https://docs.railway.com/reference/errors/application-failed-to-respond) — 0.0.0.0 + PORT binding requirement — HIGH confidence
- [Railway: Working with Domains](https://docs.railway.com/networking/domains/working-with-domains) — custom domain setup — HIGH confidence
- [Railway: Healthchecks](https://docs.railway.com/deployments/healthchecks) — 300s default timeout — HIGH confidence
- [Cloudflare Community: SSE interrupted at ~100s](https://community.cloudflare.com/t/server-side-events-sse-is-interrupted-in-approx-100s/424548) — Cloudflare proxy SSE timeout — MEDIUM confidence
- [Cloudflare Community: SSL Error Custom Domain Railway](https://station.railway.com/questions/ssl-certificate-error-on-custom-domain-f541bae6) — cert validation with proxy — MEDIUM confidence
- [Cloudflare: SSL Troubleshooting Railway](https://docs.railway.com/networking/troubleshooting/ssl) — Full vs Flexible mode — HIGH confidence
- [Railway Help Station: proxy_buffering off](https://station.railway.com/questions/proxy-buffering-off-d4b18fc6) — X-Accel-Buffering header — MEDIUM confidence
- [Railway Help Station: HTTP/2 connection drops after 60s](https://station.railway.com/questions/http-2-connection-drops-after-60s-despit-ea1019eb) — connection timeout — MEDIUM confidence
- [Adobe: User Authentication — redirect URI patterns](https://developer.adobe.com/developer-console/docs/guides/authentication/UserAuthentication/implementation) — redirect URI allow list — HIGH confidence
- [Adobe IMS: refresh token requires offline_access](https://experienceleaguecommunities.adobe.com/t5/adobe-developer-questions/not-getting-refresh-token-after-login/td-p/599762) — refresh token availability — MEDIUM confidence
- [MCP Transports Spec 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — SSE deprecated, Streamable HTTP current — HIGH confidence
- [Claude Code Issue #27142: MCP client does not reinitialize after session invalidation](https://github.com/anthropics/claude-code/issues/27142) — session caching bug — HIGH confidence
- [Claude Code Issue #30224: Auto-reconnect SSE MCP after restart](https://github.com/anthropics/claude-code/issues/30224) — reconnect behavior — HIGH confidence
- [Keboola: SSE Transport Deprecation — April 1 2026](https://changelog.keboola.com/sse-transport-deprecation-migration-to-streamable-http/) — April 1 cutoff — MEDIUM confidence (third-party, not Anthropic official)
- [Railway: in-memory data lost on redeploy](https://station.railway.com/questions/would-i-lose-data-if-i-restart-the-conta-5270630a) — ephemeral container storage — HIGH confidence
- [DEV Community: SSE not production ready](https://dev.to/miketalbot/server-sent-events-are-still-not-production-ready-after-a-decade-a-lesson-for-me-a-warning-for-you-2gie) — general SSE proxy pitfalls — MEDIUM confidence

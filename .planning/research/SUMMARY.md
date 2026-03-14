# Project Research Summary

**Project:** AEM EDS Hosted MCP Server (mcp.aemxsc.com)
**Domain:** Hosted Node.js MCP server — Railway deployment + Adobe IMS OAuth + per-user sessions
**Researched:** 2026-03-14
**Confidence:** HIGH (stack/architecture) / MEDIUM (Adobe IMS behavior, AEM CS MCP internals)
**Deadline:** March 24, 2026 — 9 days

---

## Executive Summary

This project upgrades a working localhost MCP server to a hosted, multi-user service at `https://mcp.aemxsc.com`. The hard work is already done: 16 AEM EDS tools exist, the PKCE OAuth flow with Adobe IMS is implemented, and the MCP transport is already Streamable HTTP (not the deprecated SSE pattern). What remains is a targeted refactor to make the server work in a hosted context — specifically collapsing a dual-server architecture into a single Express app that Railway can manage, fixing port binding from `127.0.0.1` to `0.0.0.0`, and updating OAuth callback URIs from localhost to the production domain. The architecture is simpler than the PROJECT.md framing implies: because the existing code uses HTTP POST JSON-RPC (not long-lived SSE connections), there is no session-to-connection binding problem. The Bearer token on every MCP request is the association mechanism.

The recommended approach is a linear sequence of four dependency-gated phases: Foundation (code refactor for Railway compatibility), Auth Flow (OAuth discovery and callback on a single server), Deploy (Railway + Cloudflare DNS), and Validation (end-to-end MCP client test). The March 24 deadline is achievable in 9 days with this scope, but it has one external dependency that is a hard deadline risk: the `darkalley` OAuth client's registered redirect URIs must include `https://mcp.aemxsc.com/callback` in Adobe Developer Console. This requires Adobe team action and should be initiated on day 1 — it cannot be unblocked by code changes alone.

The key risk to the demo itself is not technical: Railway redeploys wipe all in-memory sessions, and Claude Code has a known bug where it does not automatically reinitialize after a session is invalidated. The mitigation is operational — freeze the Railway deployment 24 hours before the demo and brief all participants on the `/mcp` reconnect command. The v1 architecture (in-memory Map, `darkalley` client, single Railway process) is explicitly the right choice for a 10-person team demo; Redis and custom OAuth clients are v2 concerns for Adobe Engineering's Experience League productization.

---

## Key Findings

### Recommended Stack

The existing stack is correct and requires no new dependencies for the hosted deployment. Node.js 22 LTS on Railway is auto-detected by Railpack; TypeScript compiles to `dist/` with `tsc`; Express 4.x stays on the stable branch (Express 5 is still RC). The only dependency to remove is `selfsigned` — the self-signed cert package used for the localhost HTTPS workaround is unnecessary once Railway provides TLS termination.

The in-memory `Map<string, Session>` is appropriate for v1. Redis would be the v2 upgrade but adds operational complexity incompatible with the March 24 timeline. In-memory Map on Railway means sessions are wiped on every redeploy — this is documented and accepted for v1.

**Core technologies:**
- **Node.js 22 LTS + TypeScript**: Runtime and type safety — already in codebase, Railway auto-detects
- **Express 4.x**: HTTP server — already implemented, stable, no upgrade needed
- **@modelcontextprotocol/sdk ^1.27.1**: MCP protocol — Streamable HTTP transport already used; SSE deprecated April 2026
- **Railway Hobby ($5/mo)**: Hosting — persistent process required for in-memory session Map; serverless (Cloudflare Workers, Vercel) is incompatible
- **Cloudflare DNS (DNS-only mode)**: Custom domain `mcp.aemxsc.com` → Railway CNAME; DNS-only avoids proxy complications with Railway TLS cert issuance
- **Adobe IMS PKCE (darkalley client)**: Per-user OAuth — already implemented; `darkalley` is the only client with DA API access

**What to remove:**
- `selfsigned` npm package — only needed for localhost self-signed cert; Railway provides real TLS
- Dual-server architecture (`:3000` + `:3443`) — Railway exposes one port; collapse to single Express app

**See:** `.planning/research/STACK.md` for full railway.toml, env var table, and code change snippets.

---

### Expected Features

The MVP for March 24 is a tight, well-defined list. Nothing ambiguous is in scope.

**Must have (table stakes) — required for March 24:**
- Single-URL MCP config (`https://mcp.aemxsc.com/mcp`) — users add one URL and it works
- Login link on first tool call — unauthenticated call returns human-readable text with auth URL, not a raw HTTP error
- Browser-based Adobe IMS auth — OAuth PKCE popup, same as da.live login; zero new credential friction
- Server-side session storage — IMS token lives on the server; MCP client holds only a UUID Bearer token
- Per-user isolated sessions — simultaneous team members do not share tokens
- All 16 existing tools functional via server-side session
- `GET /health` endpoint — required by Railway for deployment gating
- HTTPS everywhere — Railway provides TLS; Cloudflare handles custom domain
- Custom domain `mcp.aemxsc.com` resolving to Railway deployment
- CORS headers on MCP and auth endpoints — MCP clients are cross-origin
- HTTP 401 + `WWW-Authenticate` on unauthenticated MCP request — triggers automatic OAuth in Claude Code
- Human-readable auth error in tool response — fallback for clients that do not auto-handle 401
- README / one-page setup guide — required for March 24 team training

**Should have (differentiators — low effort, high demo value):**
- `da_whoami` tool shows authenticated user (name/email from IMS) — builds trust in live demo
- `da_logout` clears server-side session — lets presenter hand laptop to customer
- Active session count in `/health` response — useful demo reassurance
- Structured console logs with session IDs — enables live debugging during demo
- Root endpoint (`/`) returning server info JSON — discoverable, professional

**Defer to post-March 24 (v2+):**
- Token refresh without re-login — 24h expiry acceptable for demo; re-login is a known limitation
- Redis / persistent session store — correct v2 choice; out of scope for deadline
- Full RFC 9728 `/.well-known/oauth-protected-resource` metadata — current MCP clients do not require it
- Rate limiting per user — DA API is the natural throttle for ~10 users
- Admin UI / dashboard for session management
- Multi-org selection per session
- Custom OAuth app in Developer Console — `darkalley` covers v1 use cases

**See:** `.planning/research/FEATURES.md` for full feature table, error message guidance, and AEM CS MCP pattern comparison.

---

### Architecture Approach

The architecture question "how do OAuth sessions connect to MCP calls?" has a simpler answer than expected: the existing code already uses Streamable HTTP (HTTP POST JSON-RPC), not long-lived SSE connections. Every MCP tool call is a discrete `POST /mcp` with `Authorization: Bearer <session_token>`. The server looks up the session in the in-memory Map on every request. There is no persistent connection to maintain and no session-to-connection binding problem to solve. The OAuth flow completes synchronously before the MCP client receives its session token, so there is no race condition.

The primary structural change is collapsing the dual-server architecture. The current localhost code runs two Express apps — HTTP on `:3000` for MCP, HTTPS on `:3443` (self-signed cert) for OAuth callback — because Adobe IMS requires HTTPS redirect URIs and localhost cannot provide a real cert. On Railway, TLS is terminated at the edge proxy. A single Express app on `process.env.PORT` serves all routes, and `https://mcp.aemxsc.com/callback` is a real HTTPS URL that Adobe IMS will accept.

**Major components and responsibilities:**
1. **Express app (single process on Railway)**: Routes all HTTP — MCP calls, OAuth dance, health check, CORS
2. **`/.well-known/oauth-authorization-server`**: Discovery endpoint — tells MCP clients where to authenticate; must use `PUBLIC_URL` env var, not localhost
3. **`/authorize` → `/callback` → `/token` flow**: PKCE double-hop — server generates IMS PKCE params independently of the client's PKCE params; IMS code exchanges for IMS token; server issues its own session UUID Bearer token to the MCP client
4. **`sessions` Map**: In-memory per-user state keyed by session UUID — stores IMS token, refresh token, expiry; shared between OAuth callback and MCP handler because they run in the same process
5. **`/mcp POST` handler**: Bearer token validation → session lookup → IMS token resolution (with refresh) → tool dispatch
6. **`tools.ts` tool handlers**: DA and HLX API calls using the IMS token from session lookup (never from file or env in httpMode)

**Auth data flow summary:**
- MCP client sends `POST /mcp` with no Bearer → server returns `HTTP 401 + WWW-Authenticate` → client discovers auth endpoint → PKCE dance → user logs in at Adobe IMS → IMS callback hits `/callback` → server exchanges for IMS token → stores in `sessions` Map → returns session UUID to client → client sends Bearer on all subsequent `POST /mcp` calls → server resolves Bearer → IMS token → DA/HLX API calls

**See:** `.planning/research/ARCHITECTURE.md` for the full ASCII component diagram, step-by-step auth flow with code, and the specific `http.ts` / `tools.ts` change table.

---

### Critical Pitfalls

Research identified 3 CERTAIN blockers (will break the first Railway deploy), 1 CRITICAL external dependency, and operational risks for demo day.

1. **Server bound to `127.0.0.1` — Railway cannot reach it** (CERTAIN, day-1 blocker): The current code binds with `app.listen(port, "127.0.0.1", ...)`. Railway's internal proxy routes to the container's external interface, not loopback. Fix: change to `"0.0.0.0"` (or `"::"` for IPv6) and read `process.env.PORT` as the primary port variable (not `HLX_MCP_PORT`). Without this fix, the first deploy will fail with "Application failed to respond" and never serve traffic.

2. **Dual-server OAuth architecture is incompatible with Railway** (CERTAIN, architectural blocker): The separate HTTPS server on `:3443` cannot work on Railway — only one port is exposed, and there is no browser to accept a self-signed cert warning on the server side. The `OAUTH_CALLBACK_URI` hardcoded to `https://localhost:3443/callback` will cause an IMS `redirect_uri_mismatch` error on every login attempt. Fix: collapse to single Express app, move all OAuth routes to main app, set `OAUTH_CALLBACK_URI` via `PUBLIC_URL` env var.

3. **`darkalley` redirect URI not registered for `mcp.aemxsc.com`** (CRITICAL EXTERNAL DEPENDENCY, deadline risk): Adobe IMS validates the `redirect_uri` against a registered allow list for the `darkalley` client. Even with all server code correct, IMS will reject `https://mcp.aemxsc.com/callback` unless it is explicitly added to the Developer Console project by someone with console access. This cannot be fixed by code changes. Resolution requires 2-5 days including back-and-forth with the Adobe team. Must be initiated on day 1 of the 9-day window.

4. **Cloudflare proxy mode blocks Railway TLS cert issuance** (CERTAIN if proxied, easy to avoid): Railway uses Let's Encrypt ACME HTTP-01 validation to provision SSL certs. Cloudflare in proxy mode (orange cloud) intercepts this validation. The cert stays in "Validating" indefinitely. Fix: set Cloudflare CNAME to DNS-only (grey cloud) before adding the domain in Railway. Also set Cloudflare SSL/TLS mode to "Full" (not "Flexible") — Flexible causes an infinite redirect loop between Cloudflare and Railway.

5. **Railway redeploy wipes all sessions + Claude Code does not auto-recover** (HIGH, demo-day risk): Any Railway container restart (redeploy, Railway maintenance, OOM) wipes the in-memory session Map. All authenticated users must re-login. Compounding this, Claude Code has a known bug (GitHub issues #27142, #30224) where it does not automatically reinitialize after a session is invalidated — it continues sending the stale session ID and silently fails. Fix: freeze the Railway deployment 24 hours before the demo. Brief all demo participants on the `/mcp` reconnect command (type it in Claude Code to force reconnection).

**See:** `.planning/research/PITFALLS.md` for the full 17-pitfall register, the deadline risk register table, and phase-specific warning matrix.

---

## Implications for Roadmap

The research reveals a clear, linear dependency chain. Each phase is gated on the previous one. Parallelism is possible only within phases.

### Phase 1: Foundation — Code Refactor for Railway Compatibility

**Rationale:** Three CERTAIN code bugs will prevent any Railway deployment from working. They must be fixed before touching Railway at all. The dual-server architecture refactor is a prerequisite for the auth flow changes.

**Delivers:** A codebase that can be deployed to Railway without structural errors. Not yet fully functional (auth flow uses placeholder URLs) but buildable and startable.

**Addresses:**
- Bind to `0.0.0.0` + `process.env.PORT` (Pitfall 1 + 12)
- Collapse dual-server to single Express app; remove `selfsigned` dependency (Pitfall 2)
- Add `app.set("trust proxy", 1)` for Railway reverse proxy
- Disable localhost-only `da_login` browser flow and `da_logout` file operations in `httpMode` (Architecture anti-pattern 4)
- Add `railway.json` with build command, start command, and health check config
- Add graceful SIGTERM handler (Pitfall 17)

**Avoids:** Pitfalls 1, 2, 12, 17

**Research flag:** Standard patterns — no additional research needed. The required code changes are precisely specified in ARCHITECTURE.md section 13 and STACK.md.

---

### Phase 2: Auth Flow — OAuth Discovery, Callback, and Session Wiring

**Rationale:** Depends on Phase 1 (single-server architecture must exist before OAuth routes can be moved). This phase makes authentication functional end-to-end on the hosted server.

**Delivers:** A fully working OAuth PKCE flow at `https://mcp.aemxsc.com` — users click a login link, authenticate with Adobe IMS, and receive a server-managed session token that is used transparently on all subsequent tool calls.

**Addresses:**
- Move `/authorize`, `/callback`, `/token` from `oauthApp` to main `app`
- Update `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` to use `PUBLIC_URL` env var
- Set `OAUTH_CALLBACK_URI` to `${PUBLIC_URL}/callback`
- Add HTTP 401 + `WWW-Authenticate` response on unauthenticated `POST /mcp` (triggers Claude Code's automatic OAuth flow)
- Verify `offline_access` scope with `darkalley` client — if refresh tokens are unavailable, implement clear "session expired, re-login" tool response (Pitfall 4)
- Add session TTL cleanup to the existing 10-minute `setInterval` (Pitfall 13)

**External dependency:** Adobe IMS `darkalley` redirect URI registration must be confirmed before this phase can be end-to-end tested. Initiate this on day 1.

**Avoids:** Pitfalls 2, 3, 4, 7, 13

**Research flag:** Needs validation on `offline_access` scope behavior with the `darkalley` client. Cannot be resolved from documentation alone — requires a test IMS call. If refresh tokens are absent, session expiry UX must be handled explicitly.

---

### Phase 3: Deploy and DNS — Railway + Cloudflare

**Rationale:** Depends on Phase 2 (auth flow must be complete before deployment is meaningful). DNS propagation and Railway TLS cert issuance add lead time that cannot be compressed.

**Delivers:** `https://mcp.aemxsc.com` live and serving the MCP server with HTTPS, custom domain, and Railway health checks passing.

**Addresses:**
- Create Railway service from `tools/hlx-admin-mcp/` as root directory
- Set Railway environment variables: `PUBLIC_URL`, `ADOBE_IMS_CLIENT_ID`, `NODE_ENV`
- Deploy and confirm `/health` returns HTTP 200
- Register `mcp.aemxsc.com` in Railway custom domains → get Railway CNAME target
- Add Cloudflare CNAME (DNS-only mode), set SSL/TLS to "Full" (Pitfall 9)
- Wait for Railway TLS cert issuance (1-5 minutes after DNS-only CNAME propagates) (Pitfall 10)
- Check for CAA records blocking Let's Encrypt (Pitfall 11)
- Verify `https://mcp.aemxsc.com/health` returns 200

**Avoids:** Pitfalls 5, 9, 10, 11

**Research flag:** Standard patterns — Railway and Cloudflare configuration steps are well-documented in STACK.md and ARCHITECTURE.md.

---

### Phase 4: Validation — End-to-End MCP Client Test

**Rationale:** Depends on Phase 3 (domain must resolve before MCP client test is meaningful). This phase confirms the full stack works from an MCP client's perspective.

**Delivers:** Confirmed working MCP server — Claude Code can connect, OAuth triggers automatically on first tool call, all 16 tools function via server-side session, demo is ready.

**Addresses:**
- Add MCP config to Claude Code: `{ "url": "https://mcp.aemxsc.com/mcp" }`
- Trigger `tools/list` → confirm 401 → OAuth browser flow → login with Adobe ID → confirm session token stored
- Test `da_whoami` shows authenticated user
- Test `da_list` returns content from `aemxsc/xscteamsite`
- Test `da_get_content`, `da_update_content`, `hlx_preview`, `hlx_publish` end-to-end
- Test `da_logout` clears session correctly
- Freeze Railway deployment 24 hours before March 24 (Pitfall 6)
- Write and distribute one-page onboarding README (mandatory for team training)
- Brief all demo participants on `/mcp` reconnect command (Pitfall 8)

**Avoids:** Pitfalls 6, 8

**Research flag:** Standard patterns — the validation steps are known. One unknown: whether Claude Code's OAuth auto-discovery flow triggers correctly from `WWW-Authenticate`. If it does not, the fallback is returning the login URL as human-readable tool response text (already supported in the features design).

---

### Phase Ordering Rationale

- Phase 1 before Phase 2: The single-server architecture refactor must exist before OAuth routes can be wired correctly. Testing auth before the server architecture is unified would produce misleading failures.
- Phase 2 before Phase 3: Deploying a server with localhost OAuth callback URIs produces an `redirect_uri_mismatch` error from Adobe IMS. Auth must be correct in code before deployment is meaningful.
- Phase 3 before Phase 4: End-to-end MCP client validation requires a live domain with a real TLS cert. DNS propagation and cert issuance have non-zero lead time.
- External dependency (Adobe IMS redirect URI) runs in parallel with Phases 1-2: Initiate Adobe Developer Console update on day 1. It is a prerequisite for Phase 4 but not for Phases 1-3 (which can be developed and tested against localhost before the hosted domain is validated).

---

### Research Flags

**Needs deeper validation during execution:**
- **Phase 2 — `offline_access` scope with `darkalley`**: Whether Adobe IMS returns a refresh token for this client and scope cannot be determined from documentation alone. Test early in Phase 2. If refresh tokens are absent, session expiry handling must be made explicit (clear "re-login" message).
- **Phase 2 — Adobe IMS redirect URI registration**: This is an external dependency with an unknown approval timeline. Confirm on day 1 whether `darkalley` Developer Console access is available and how long adding a URI takes.
- **Phase 4 — Claude Code OAuth auto-discovery**: Whether Claude Code's 2026 build automatically handles the `WWW-Authenticate: Bearer` → discovery → browser redirect flow. If it does not, the fallback (human-readable login URL in tool response text) must be the primary UX path.

**Standard patterns (skip additional research):**
- **Phase 1 — Code refactor**: All required changes are precisely specified in ARCHITECTURE.md section 13 and STACK.md. No research needed.
- **Phase 3 — Railway + Cloudflare DNS**: Fully documented in STACK.md and ARCHITECTURE.md. Configuration steps are deterministic.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All core technologies are already in the codebase. Railway config requirements are from official Railway docs. The "what to remove" (selfsigned, dual-server) is certain. |
| Features | HIGH (table stakes) / MEDIUM (differentiators) | Table stakes list is derived from the working AEM CS MCP reference and MCP spec. Differentiator value judgments are based on demo experience patterns, not measured data. |
| Architecture | HIGH | The transport clarification (Streamable HTTP vs SSE) is spec-verified against MCP 2025-03-26. The PKCE double-hop auth flow is verified against the existing codebase. Session-to-Bearer-token association is trivially correct. |
| Pitfalls | HIGH (code pitfalls) / MEDIUM (Adobe IMS behavior) | The 127.0.0.1 and dual-server pitfalls are certain based on Railway docs. Cloudflare SSL mode behavior is well-documented. The `darkalley` redirect URI registration risk is inferred from Adobe IMS standard behavior — the actual current allow list is unknown. IMS refresh token availability with `offline_access` is MEDIUM (community source, not Adobe official docs). |

**Overall confidence:** HIGH for the code changes and deployment mechanics. MEDIUM for Adobe IMS behavior specifics that require runtime verification.

### Gaps to Address

- **`darkalley` OAuth client allow list**: Unknown whether `https://mcp.aemxsc.com/callback` is already registered or needs to be added. Unknown who has Developer Console access. Must be verified on day 1 — this is the only gap that can slip the March 24 deadline.
- **IMS `offline_access` scope behavior**: Unknown whether the `darkalley` client with `aem.frontend.all` scope returns a refresh token. If it does not, the 24h re-login requirement becomes explicit and must be clearly communicated in the onboarding doc.
- **Claude Code OAuth auto-discovery behavior**: The `WWW-Authenticate` → auto-browser-launch flow in Claude Code 2026 is not independently verified. The fallback (human-readable login URL in tool response) is already in scope and should be treated as the primary path until auto-discovery is confirmed working.
- **AEM CS MCP internal architecture**: The comparison to `mcp.adobeaemcloud.com` is based on Experience League docs, not direct endpoint inspection. The architectural parallels are reasonable inferences.

---

## Sources

### Primary (HIGH confidence)
- [MCP Transports Specification 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — Streamable HTTP canonical transport; SSE deprecated
- [MCP Authorization Specification 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization) — OAuth third-party auth flow; WWW-Authenticate behavior
- [Railway: Application Failed to Respond](https://docs.railway.com/reference/errors/application-failed-to-respond) — 0.0.0.0 + PORT binding requirement
- [Railway: Health Checks](https://docs.railway.com/deployments/healthchecks) — /health endpoint requirements
- [Railway: Working with Domains](https://docs.railway.com/networking/domains/working-with-domains) — custom domain + CNAME setup
- [Railway: Config as Code](https://docs.railway.com/reference/config-as-code) — railway.toml / railway.json structure
- [Express: Behind Proxies](https://expressjs.com/en/guide/behind-proxies.html) — trust proxy requirement for Railway
- [Adobe Developer Console: redirect URI patterns](https://developer.adobe.com/developer-console/docs/guides/authentication/UserAuthentication/implementation) — redirect URI allow list behavior
- [Cloudflare: SSL Troubleshooting Railway](https://docs.railway.com/networking/troubleshooting/ssl) — Full vs Flexible SSL mode
- [Claude Code Issue #27142](https://github.com/anthropics/claude-code/issues/27142) — MCP session ID caching bug

### Secondary (MEDIUM confidence)
- [Using MCP with AEM as a Cloud Service — Experience League](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/ai-in-aem/mcp-support/using-mcp-with-aem-as-a-cloud-service) — AEM CS MCP architecture patterns
- [Adobe IMS: refresh token requires offline_access](https://experienceleaguecommunities.adobe.com/t5/adobe-developer-questions/not-getting-refresh-token-after-login/td-p/599762) — IMS refresh token availability
- [Cloudflare Community: SSE interrupted at ~100s](https://community.cloudflare.com/t/server-side-events-sse-is-interrupted-in-approx-100s/424548) — proxy timeout behavior
- [Build StreamableHTTP MCP Servers Guide](https://mcpcat.io/guides/building-streamablehttp-mcp-server/) — session Map pattern with StreamableHTTPServerTransport
- [MCP Authentication Patterns — Stytch](https://stytch.com/blog/MCP-authentication-and-authorization-guide/) — OAuth proxy pattern

### Tertiary (LOW confidence)
- [Keboola: SSE Transport Deprecation — April 1 2026](https://changelog.keboola.com/sse-transport-deprecation-migration-to-streamable-http/) — April 1 cutoff date (third-party, not Anthropic official; spec deprecation is HIGH confidence)
- [MCP Authentication Patterns — Security Boulevard](https://securityboulevard.com/2026/03/mcp-authentication-and-authorization-patterns/) — single source, March 2026

---

*Research completed: 2026-03-14*
*Ready for roadmap: yes*

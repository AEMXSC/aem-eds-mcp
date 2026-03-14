# Requirements: AEM EDS Hosted MCP Server

**Defined:** 2026-03-14
**Core Value:** Any team member or customer can start authoring AEM EDS content with Claude in under 5 minutes — just add one URL to their MCP config and click a login link.

---

## v1 Requirements (March 24 target)

### Hosting

- [ ] **HOST-01**: Server runs persistently at `https://mcp.aemxsc.com` (Railway deployment)
- [x] **HOST-02**: Server binds to `0.0.0.0` + `process.env.PORT` (Railway compatible)
- [x] **HOST-03**: Single HTTP port — no dual-server architecture (Railway only exposes one port)
- [x] **HOST-04**: `GET /health` returns HTTP 200 (Railway health check)
- [x] **HOST-05**: `railway.toml` config with start command and health check path

### DNS & Domain

- [ ] **DNS-01**: `aemxsc.com` domain registered on Cloudflare
- [ ] **DNS-02**: `www.aemxsc.com` CNAME → `main--xscteamsite--aemxsc.aem.page`
- [ ] **DNS-03**: `mcp.aemxsc.com` CNAME → Railway hostname (DNS-only mode, not proxied)
- [ ] **DNS-04**: Railway TLS certificate issued for `mcp.aemxsc.com`

### Authentication

- [ ] **AUTH-01**: Unauthenticated tool calls return a human-readable login URL in the response (not a raw error)
- [ ] **AUTH-02**: `GET /login?session=<id>` initiates Adobe IMS PKCE OAuth flow
- [ ] **AUTH-03**: `GET /callback` receives OAuth code, exchanges for token, stores in server-side session
- [ ] **AUTH-04**: Session tokens stored in-memory Map (keyed by session UUID)
- [ ] **AUTH-05**: `PUBLIC_URL` env var used for all OAuth callback/redirect URIs (no hardcoded localhost)
- [ ] **AUTH-06**: `darkalley` client_id PKCE flow registered at `https://mcp.aemxsc.com/callback`

> **External dependency:** AUTH-06 requires Adobe team to add `https://mcp.aemxsc.com/callback` to darkalley's allowed redirect URIs in Adobe Developer Console. Must be initiated on day 1.

### DA Content Tools

- [ ] **DA-01**: `da_list` — lists files/folders at `content.da.live/{org}/{site}/{path}`
- [ ] **DA-02**: `da_get_content` — reads content from `content.da.live/{org}/{site}/{path}`
- [ ] **DA-03**: `da_update_content` — writes content to `admin.da.live/source/{org}/{site}/{path}` (multipart FormData)
- [ ] **DA-04**: `da_whoami` — returns authenticated user info from IMS
- [ ] **DA-05**: `da_login` — returns login URL (not browser open) when in hosted mode
- [ ] **DA-06**: `da_logout` — clears session token

### HLX Admin Tools

- [ ] **HLX-01**: `hlx_preview` — triggers preview via `admin.hlx.page`
- [ ] **HLX-02**: `hlx_publish` — triggers publish via `admin.hlx.page`
- [ ] **HLX-03**: `hlx_unpublish` — unpublishes a page
- [ ] **HLX-04**: `hlx_status` — gets preview/publish/live status
- [ ] **HLX-05**: `hlx_bulk_preview` — bulk preview multiple paths
- [ ] **HLX-06**: `hlx_bulk_publish` — bulk publish multiple paths
- [ ] **HLX-07**: `hlx_cache_purge` — purges CDN cache
- [ ] **HLX-08**: `hlx_job_status` — polls async bulk job status

### Onboarding

- [ ] **OB-01**: README with one-page setup: add MCP config URL + click login link
- [ ] **OB-02**: MCP config snippet for Claude Code, Cursor, and VS Code documented
- [ ] **OB-03**: Known issue documented: re-login required after Railway redeploy (in-memory sessions)

---

## v2 Requirements (post-March 24)

### Auth Polish
- **AUTH-V2-01**: Token auto-refresh without re-login (requires darkalley refresh token support)
- **AUTH-V2-02**: Graceful session expiry message with re-login link
- **AUTH-V2-03**: `/.well-known/oauth-protected-resource` metadata endpoint (MCP spec RFC 9728)

### Observability
- **OBS-01**: Structured request logging (org/site/tool per call)
- **OBS-02**: Railway metrics dashboard configuration

### Multi-site
- **MULTI-01**: Per-session org/site configuration (not hardcoded)

---

## Out of Scope (v1)

| Feature | Reason |
|---------|--------|
| Redis session store | In-memory is fine for 5-10 users; Redis adds infra complexity |
| Custom Developer Console OAuth app | Requires Adobe team registration; darkalley works for v1 |
| Rate limiting | Not needed for internal team use |
| Admin UI / dashboard | No time; not needed for March 24 demo |
| DA API key / service account auth | Does not exist — DA API only accepts user IMS JWT tokens |
| Adobe infrastructure hosting | Phase 3 / Engineering handoff |
| MCP SSE transport | Deprecated spec; existing POST/Streamable HTTP is correct |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HOST-02 | Phase 1: Foundation | Complete |
| HOST-03 | Phase 1: Foundation | Complete |
| HOST-04 | Phase 1: Foundation | Complete |
| HOST-05 | Phase 1: Foundation | Complete |
| AUTH-01 | Phase 2: Auth Flow | Pending |
| AUTH-02 | Phase 2: Auth Flow | Pending |
| AUTH-03 | Phase 2: Auth Flow | Pending |
| AUTH-04 | Phase 2: Auth Flow | Pending |
| AUTH-05 | Phase 2: Auth Flow | Pending |
| AUTH-06 | Phase 2: Auth Flow | Pending |
| DA-05 | Phase 2: Auth Flow | Pending |
| HOST-01 | Phase 3: Deploy & DNS | Pending |
| DNS-01 | Phase 3: Deploy & DNS | Pending |
| DNS-02 | Phase 3: Deploy & DNS | Pending |
| DNS-03 | Phase 3: Deploy & DNS | Pending |
| DNS-04 | Phase 3: Deploy & DNS | Pending |
| DA-01 | Phase 4: Validate & Ship | Pending |
| DA-02 | Phase 4: Validate & Ship | Pending |
| DA-03 | Phase 4: Validate & Ship | Pending |
| DA-04 | Phase 4: Validate & Ship | Pending |
| DA-06 | Phase 4: Validate & Ship | Pending |
| HLX-01 | Phase 4: Validate & Ship | Pending |
| HLX-02 | Phase 4: Validate & Ship | Pending |
| HLX-03 | Phase 4: Validate & Ship | Pending |
| HLX-04 | Phase 4: Validate & Ship | Pending |
| HLX-05 | Phase 4: Validate & Ship | Pending |
| HLX-06 | Phase 4: Validate & Ship | Pending |
| HLX-07 | Phase 4: Validate & Ship | Pending |
| HLX-08 | Phase 4: Validate & Ship | Pending |
| OB-01 | Phase 4: Validate & Ship | Pending |
| OB-02 | Phase 4: Validate & Ship | Pending |
| OB-03 | Phase 4: Validate & Ship | Pending |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-14 — traceability updated after roadmap creation*

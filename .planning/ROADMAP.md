# Roadmap: AEM EDS Hosted MCP Server (mcp.aemxsc.com)

## Overview

The existing `tools/hlx-admin-mcp/` codebase is a working MCP server with 16 AEM EDS tools and Adobe IMS PKCE auth — but it only runs on localhost. This roadmap takes it hosted in four phases: fix the three Railway-blocking code bugs, wire the auth flow for a single-server hosted environment, deploy to Railway with a Cloudflare custom domain, then validate end-to-end from a real MCP client and ship onboarding docs before the March 24 demo.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Fix the three code blockers that prevent any Railway deployment from working (completed 2026-03-14)
- [ ] **Phase 2: Auth Flow** - Wire OAuth PKCE for a single hosted server with server-side sessions
- [ ] **Phase 3: Deploy & DNS** - Create Railway service, configure Cloudflare DNS, verify mcp.aemxsc.com live
- [ ] **Phase 4: Validate & Ship** - End-to-end MCP client test, freeze deployment, distribute onboarding doc

## Phase Details

### Phase 1: Foundation
**Goal**: The codebase can be deployed to Railway without structural errors — port binding, architecture, and health check are all Railway-compatible
**Depends on**: Nothing (first phase)
**Requirements**: HOST-02, HOST-03, HOST-04, HOST-05
**Success Criteria** (what must be TRUE):
  1. Server starts successfully when `PORT` env var is set (not `HLX_MCP_PORT`) and binds to `0.0.0.0`
  2. There is one Express app on one port — no separate HTTPS server on `:3443`, no `selfsigned` dependency
  3. `GET /health` returns HTTP 200 with a JSON body
  4. `railway.toml` exists with build command, start command, and `/health` health check path
**Plans**: 3 plans

Plans:
- [ ] 01-01-PLAN.md — Remove dual-server from http.ts, fix port binding and bind address (HOST-02, HOST-03)
- [ ] 01-02-PLAN.md — Create railway.toml and test-phase1.sh smoke test script (HOST-05)
- [ ] 01-03-PLAN.md — Uninstall selfsigned package and run full phase test suite (HOST-02, HOST-03, HOST-04)

### Phase 2: Auth Flow
**Goal**: Users can authenticate via Adobe IMS PKCE from the hosted server — unauthenticated calls return a clickable login URL, authenticated calls resolve tokens from server-side sessions
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, DA-05
**Success Criteria** (what must be TRUE):
  1. An unauthenticated `POST /mcp` returns HTTP 401 with `WWW-Authenticate` header AND a human-readable login URL in the response body — not a raw error
  2. Visiting `GET /login?session=<id>` in a browser initiates the Adobe IMS PKCE flow
  3. Completing the IMS login redirects to `/callback`, exchanges the code for an IMS token, and stores it in the in-memory session Map under the session UUID
  4. All OAuth callback and discovery endpoints use `PUBLIC_URL` env var — no hardcoded `localhost` anywhere in the auth path
  5. `da_login` tool returns a login URL string (not a browser open call) when running in hosted mode
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md — Create test-phase2.sh smoke test script (AUTH-01, AUTH-02, AUTH-05, DA-05)
- [ ] 02-02-PLAN.md — Add /login, /callback routes and 401 guard in http.ts; fix PUBLIC_URL (AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06)
- [ ] 02-03-PLAN.md — Add httpMode branch to da_login in tools.ts (DA-05)

### Phase 3: Deploy & DNS
**Goal**: `https://mcp.aemxsc.com` is live, serving the MCP server over HTTPS with Railway health checks passing and TLS cert issued
**Depends on**: Phase 2
**Requirements**: HOST-01, DNS-01, DNS-02, DNS-03, DNS-04
**Success Criteria** (what must be TRUE):
  1. `https://mcp.aemxsc.com/health` returns HTTP 200 from a browser or curl
  2. `mcp.aemxsc.com` CNAME points to the Railway hostname in Cloudflare DNS-only mode (grey cloud, not proxied)
  3. Railway TLS certificate for `mcp.aemxsc.com` is in "Active" state (not "Validating")
  4. `aemxsc.com` is registered on Cloudflare and `www.aemxsc.com` CNAME resolves correctly
**Plans**: TBD

### Phase 4: Validate & Ship
**Goal**: A real MCP client (Claude Code) connects to `https://mcp.aemxsc.com/mcp`, completes the OAuth flow, and all 16 tools work against live AEM EDS content — demo is frozen and team is onboarded
**Depends on**: Phase 3
**Requirements**: DA-01, DA-02, DA-03, DA-04, DA-06, HLX-01, HLX-02, HLX-03, HLX-04, HLX-05, HLX-06, HLX-07, HLX-08, OB-01, OB-02, OB-03
**Success Criteria** (what must be TRUE):
  1. Claude Code connects to `https://mcp.aemxsc.com/mcp`, triggers OAuth automatically or via the login link, and `da_whoami` returns the authenticated user's name and email
  2. `da_list`, `da_get_content`, and `da_update_content` succeed against `aemxsc/xscteamsite` content using the server-side session token
  3. `hlx_preview` and `hlx_publish` successfully trigger via `admin.hlx.page` for a test path
  4. The onboarding README includes the MCP config URL, a config snippet for Claude Code / Cursor / VS Code, and a note about re-login after Railway redeploys
  5. Railway deployment is frozen at least 24 hours before March 24 and all demo participants know the `/mcp` reconnect command
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete   | 2026-03-14 |
| 2. Auth Flow | 1/3 | In Progress|  |
| 3. Deploy & DNS | 0/TBD | Not started | - |
| 4. Validate & Ship | 0/TBD | Not started | - |

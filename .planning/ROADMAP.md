# Roadmap: AEM EDS Hosted MCP Server (mcp.aemxsc.com)

## Overview

The existing `tools/hlx-admin-mcp/` codebase is a working MCP server with HLX admin tools — but it only runs on localhost. This roadmap takes it hosted in four phases.

**Scope update (2026-03-16):** Adobe released the official DA MCP server at `https://mcp.adobeaemcloud.com/adobe/mcp/da` — it handles all DA content operations (read, write, create, delete, move, copy) with automatic Adobe IMS auth. Our server scope is now **HLX Admin only**: preview, publish, bulk ops, and cache purge. Auth is simplified to a single shared IMS token stored as a Railway env var. No PKCE, no darkalley, no Chrome extension needed.

**The two-MCP setup for demo:**
- `https://mcp.adobeaemcloud.com/adobe/mcp/da` — Adobe DA MCP (content)
- `https://mcp.aemxsc.com/mcp` — Our HLX MCP (preview + publish)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Fix the three code blockers that prevent any Railway deployment from working (completed 2026-03-14)
- [ ] **Phase 2: Simplify** - Strip DA tools + PKCE auth, wire shared HLX_ADMIN_TOKEN env var, keep HLX admin tools only
- [ ] **Phase 3: Deploy & DNS** - Create Railway service, configure Cloudflare DNS, verify mcp.aemxsc.com live
- [ ] **Phase 4: Validate & Ship** - End-to-end two-MCP test with DA MCP + HLX MCP, freeze deployment, distribute onboarding doc

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

### Phase 2: Simplify
**Goal**: Strip the server down to HLX Admin only — remove DA tools, remove PKCE/session auth, wire a single `HLX_ADMIN_TOKEN` env var for all admin.hlx.page calls
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, HLX-01 through HLX-08
**Success Criteria** (what must be TRUE):
  1. Server exposes only HLX admin tools — no DA tools, no login/callback routes
  2. All `admin.hlx.page` calls use `HLX_ADMIN_TOKEN` env var as Bearer token
  3. `POST /mcp` with a valid tool call (`hlx_status`) returns a successful result
  4. Server starts cleanly with only `PORT` and `HLX_ADMIN_TOKEN` env vars set
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — Strip tools.ts: remove DA auth tools, IMS/PKCE/file-token infrastructure, wire HLX_ADMIN_TOKEN into adminRequest/daRequest (AUTH-01, HLX-01 through HLX-08)
- [ ] 02-02-PLAN.md — Strip http.ts: remove OAuth/session layer, rewrite test-phase2.sh, uninstall uuid (AUTH-01, AUTH-02)

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
**Goal**: Two-MCP setup works end-to-end — DA MCP handles content, HLX MCP handles preview/publish, demo is frozen and team is onboarded
**Depends on**: Phase 3
**Requirements**: HLX-01, HLX-02, HLX-03, HLX-04, HLX-05, HLX-06, HLX-07, HLX-08, OB-01, OB-02, OB-03
**Success Criteria** (what must be TRUE):
  1. Claude Code configured with both DA MCP + HLX MCP — all tools visible
  2. `hlx_preview` and `hlx_publish` succeed against `aemxsc/xscteamsite` test path
  3. Full demo flow works: DA MCP updates content → HLX MCP previews → HLX MCP publishes → live URL confirmed
  4. Onboarding doc covers both MCP URLs with config snippets for Claude Code, Cursor, VS Code, Claude.ai
  5. Railway deployment frozen 24h before March 24, `HLX_ADMIN_TOKEN` refreshed morning of demo
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-03-14 |
| 2. Simplify | 0/2 | Not started | - |
| 3. Deploy & DNS | 0/TBD | Not started | - |
| 4. Validate & Ship | 0/TBD | Not started | - |

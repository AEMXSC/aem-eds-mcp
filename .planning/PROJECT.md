# AEM EDS Hosted MCP Server (mcp.aemxsc.com)

## What This Is

A hosted MCP server at `https://mcp.aemxsc.com/sse` that gives LLMs (Claude Code, Cursor, VS Code) the ability to read and write AEM Edge Delivery Services content via Document Authoring (DA) and trigger preview/publish via the HLX Admin API — without any local server setup, DevTools, or manual token extraction. Built by the Adobe AEM XSC pre-sales team as a demo and enablement tool, designed for handoff to Adobe Engineering for Experience League productization.

## Core Value

Any team member or customer can start authoring AEM EDS content with Claude in under 5 minutes — just add one URL to their MCP config and click a login link.

## Requirements

### Validated

- ✓ DA content reads work via `content.da.live` — existing
- ✓ DA content writes work via `admin.da.live/source/{org}/{site}/{path}` — existing
- ✓ HLX preview/publish work via `admin.hlx.page` — existing
- ✓ Browser-based Adobe IMS OAuth (PKCE) flow implemented — existing
- ✓ 16 MCP tools implemented (da_login, da_list, da_get_content, da_update_content, hlx_preview, hlx_publish, etc.) — existing

### Active

- [ ] Server runs hosted at mcp.aemxsc.com (Railway) — not just localhost
- [ ] Auth uses server-side sessions — no token extraction, no CLI required
- [ ] First-use auth prompt: login link returned as tool response
- [ ] aemxsc.com domain registered and DNS configured (Cloudflare)
- [ ] mcp.aemxsc.com CNAME points to Railway deployment
- [ ] Token refresh handled automatically (no re-login within 24h)
- [ ] Health check endpoint for Railway uptime monitoring
- [ ] Team onboarding doc: one-page setup guide

### Out of Scope

- Redis session store — in-memory is fine for v1 team use
- Multi-org support per session — each session targets one org/site
- Custom OAuth app (Developer Console) — using `darkalley` client for now
- Mobile client support — desktop MCP clients only
- Adobe infrastructure hosting — Railway for v1, Adobe Engineering handles this for Experience League

## Context

- **Existing codebase:** `tools/hlx-admin-mcp/` — Node.js MCP server with HTTP SSE transport, currently runs only on localhost
- **Auth blocker solved:** DA API requires `darkalley` OAuth client with `aem.frontend.all` scope — not `aio-cli-console-auth`
- **DA endpoints confirmed:** Read = `content.da.live/{org}/{site}/{path}`, Write = `admin.da.live/source/{org}/{site}/{path}` with multipart FormData
- **Target org/site:** `aemxsc` / `xscteamsite` (main site), expandable to any org/site
- **Parallel project:** Official AEM CS MCP at `https://mcp.adobeaemcloud.com/adobe/mcp/` — this is the EDS equivalent
- **Adobe Engineering handoff:** After March 24 demo, project transfers to Adobe for Experience League documentation

## Constraints

- **Timeline:** March 24, 2026 — team training demo. ~9 days.
- **Tech stack:** Node.js (existing), TypeScript (existing), Railway for hosting
- **Auth:** Must use `darkalley` client_id — only client with DA API access
- **Session storage:** In-memory Map (v1) — no Redis/DB dependency
- **Domain:** aemxsc.com via Cloudflare — needs registration + DNS setup
- **Budget:** Cloudflare (~$10/yr domain) + Railway (~$5/mo) — user confirmed OK

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hosted endpoint vs local server | Matches AEM CS MCP model, zero-install for customers | — Pending |
| Railway for hosting | Persistent Node.js, 5-min deploy, $5/mo, SSE-compatible | — Pending |
| Cloudflare for DNS | Free, fast propagation, easy CNAME management | — Pending |
| darkalley client_id | Only OAuth client with DA API access, already in codebase | — Pending |
| In-memory sessions for v1 | Simplest path to March 24 deadline, Redis in v2 | — Pending |
| Server-side sessions | Eliminates all token extraction — core UX requirement | — Pending |

---
*Last updated: 2026-03-14 after initialization*

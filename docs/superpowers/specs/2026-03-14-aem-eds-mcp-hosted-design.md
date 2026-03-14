# AEM EDS Hosted MCP Server — Design Spec
**Date:** 2026-03-14
**Author:** Courtney Remekie (AEM XSC Pre-Sales)
**Target launch:** March 24, 2026
**Handoff:** Adobe Engineering → Experience League

---

## Problem

The AEM XSC pre-sales team needs an MCP server for AEM Edge Delivery Services (EDS) + Document Authoring (DA) that:
- Can be demoed to customers without DevTools or manual token extraction
- Can be distributed to team members with zero local setup
- Mirrors the experience of the official AEM CS MCP at `https://mcp.adobeaemcloud.com/adobe/mcp/`
- Can be handed to Adobe Engineering to productize for Experience League

---

## Solution

A hosted MCP server at **`https://mcp.aemxsc.com/sse`** running on Railway, with Cloudflare handling DNS for `aemxsc.com`.

Team members and customers add one URL to their Claude Code / Cursor / VS Code config. Authentication happens via a one-time browser sign-in (Adobe IMS). No CLI, no token extraction, no local server to run.

---

## Architecture

```
Claude Code / Cursor / VS Code
         │
         │  HTTP SSE (MCP transport)
         ▼
https://mcp.aemxsc.com/sse      ← Railway (Node.js persistent server)
         │
         ├─── content.da.live   (DA content reads)
         ├─── admin.da.live     (DA content writes)
         └─── admin.hlx.page    (EDS preview / publish / cache)
```

### Infrastructure
| Component | Service | Cost |
|-----------|---------|------|
| Domain + DNS | Cloudflare | ~$10/yr |
| MCP server | Railway | ~$5/mo |
| Source code | GitHub (public) | Free |

---

## Authentication Flow

### Per-user, server-side sessions — no token extraction required

1. User adds `https://mcp.aemxsc.com/sse` to their MCP config (one time, permanent)
2. First tool call → server responds with login prompt: *"Not authenticated. Open https://mcp.aemxsc.com/login?session=<id> to sign in."*
3. User clicks the link → Adobe IMS browser popup (same UX as logging into da.live)
4. OAuth callback received by server → token stored in server-side session store
5. All subsequent MCP calls use the stored token transparently
6. Token refreshes automatically (IMS tokens valid 24h, refresh on expiry)

### OAuth details
- **Client ID:** `darkalley` (da.live's registered OAuth client — required for DA API access)
- **Scope:** `aem.frontend.all`
- **Flow:** Authorization Code + PKCE (already implemented in current codebase)
- **Session storage:** In-memory map keyed by session ID (v1); Redis for v2/production

### Multi-user support
Each MCP connection gets a session ID. Multiple team members can be connected simultaneously with independent tokens.

---

## Tools Exposed

| Category | Tool | Description |
|----------|------|-------------|
| Auth | `da_login` | Initiate browser sign-in |
| Auth | `da_logout` | Clear session token |
| Auth | `da_whoami` | Show authenticated user |
| Content | `da_list` | List files/folders in DA org/site |
| Content | `da_get_content` | Read content from DA |
| Content | `da_update_content` | Write/update content in DA |
| EDS Admin | `hlx_status` | Get preview/publish status of a page |
| EDS Admin | `hlx_preview` | Preview a page |
| EDS Admin | `hlx_publish` | Publish a page |
| EDS Admin | `hlx_unpublish` | Unpublish a page |
| EDS Admin | `hlx_delete_preview` | Delete preview |
| Bulk Ops | `hlx_bulk_preview` | Bulk preview multiple pages |
| Bulk Ops | `hlx_bulk_publish` | Bulk publish multiple pages |
| Jobs | `hlx_job_status` | Check async job status |
| Cache | `hlx_cache_purge` | Purge CDN cache |
| Config | `hlx_profile` | Get HLX site profile |

---

## MCP Client Config (what users copy-paste)

### Claude Code (`~/.claude/config.json` or via `claude mcp add`)
```json
{
  "mcpServers": {
    "aem-eds": {
      "url": "https://mcp.aemxsc.com/sse"
    }
  }
}
```

### Cursor / VS Code
```json
{
  "mcp": {
    "servers": {
      "aem-eds": {
        "url": "https://mcp.aemxsc.com/sse"
      }
    }
  }
}
```

---

## DNS Setup (Cloudflare)

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| CNAME | `www` | `main--xscteamsite--aemxsc.aem.page` | AEM site |
| CNAME | `@` | `main--xscteamsite--aemxsc.aem.page` | AEM site root |
| CNAME | `mcp` | `<railway-deployment>.up.railway.app` | MCP server |

---

## Codebase Changes Required

Starting from `tools/hlx-admin-mcp/` (current local server):

### 1. Auth — server-side sessions
- Add session store (Map keyed by session ID)
- Add `/login?session=<id>` OAuth entry point
- Add `/callback` OAuth redirect handler (already partially exists)
- Store token in session after callback
- Look up token from session on each tool call
- Remove requirement for `da_login` tool call to get started

### 2. HTTP server hardening
- Add health check endpoint `GET /health`
- Add CORS headers for cross-origin MCP clients
- Graceful shutdown handling
- Environment-based config (`PORT`, `BASE_URL`, `SESSION_SECRET`)

### 3. Deployment config
- `Dockerfile` or `railway.json` for Railway deployment
- `railway.json` with start command
- Environment variables documented in `README`

### 4. Domain config
- `BASE_URL=https://mcp.aemxsc.com` used in OAuth callbacks

---

## Phased Delivery

### Phase 1 — Core hosted server (March 22 target, 2 days buffer before March 24)
- Server-side session auth
- All 16 tools working
- Railway deployment
- Cloudflare DNS + custom domain
- README with onboarding instructions

### Phase 2 — Polish (post-March 24, before Adobe handoff)
- Token refresh without re-login
- Multi-site config (org/site selectable per session)
- Better error messages ("you need to log in" vs raw 401)
- Logging for demo visibility

### Phase 3 — Adobe Engineering handoff
- Move from `darkalley` client ID to team-owned Adobe Developer Console OAuth app
- Redis session store for scalability
- Adobe infrastructure deployment
- Experience League documentation

---

## Success Criteria

- [ ] Team member can start using AEM EDS tools in 5 minutes (add URL + click login link)
- [ ] Customer can be onboarded during a live demo with no DevTools
- [ ] Server handles 10+ simultaneous users
- [ ] DA read/write working: `da_get_content` and `da_update_content`
- [ ] EDS preview/publish working: `hlx_preview`, `hlx_publish`
- [ ] aemxsc.com resolves to AEM site
- [ ] mcp.aemxsc.com resolves to MCP server

---

## Open Questions (resolved)

| Question | Decision |
|----------|----------|
| Hosted vs local? | Hosted — matches AEM CS MCP model |
| Auth approach? | One-time browser sign-in per person |
| OAuth client? | `darkalley` (existing, proven) |
| Hosting? | Railway (persistent Node.js) |
| Domain/DNS? | Cloudflare |
| Source? | GitHub public repo |

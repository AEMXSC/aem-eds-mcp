# Feature Landscape

**Domain:** Hosted MCP server for AEM Edge Delivery Services content authoring
**Researched:** 2026-03-14
**Deadline:** March 24, 2026 (9 days)

---

## Context

This is a subsequent milestone. A working local MCP server with 16 tools already exists.
The milestone adds hosted deployment + server-side OAuth sessions. Features are evaluated
against the March 24 team training demo deadline and the reference implementation at
`https://mcp.adobeaemcloud.com/adobe/mcp/` (AEM CS MCP).

Target users, in priority order:
1. Adobe AEM XSC pre-sales team (~10 people, internal, March 24 demo)
2. AEM customers (external, demo/evaluation)
3. Adobe Engineering (future productization for Experience League)

---

## Table Stakes

Features users cannot do without. Missing any of these means the hosted server is not usable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single-URL MCP config | Users expect "add one URL, it works" — matches AEM CS MCP model | Low | `https://mcp.aemxsc.com/sse` added to Claude/Cursor config |
| Login link on first tool call | Non-technical users cannot extract tokens or run CLI flows. First unauthenticated tool call must return a clickable URL | Low | "Not authenticated. Open https://mcp.aemxsc.com/login?session=<id> to sign in." |
| Browser-based Adobe IMS auth | All users have Adobe IDs already. OAuth popup is the same as logging into da.live — zero new credential friction | Med | PKCE + `darkalley` client + `aem.frontend.all` scope — already implemented locally |
| Server-side session storage | Token must live on the server, not extracted by user. Once signed in, all tool calls use stored token transparently | Med | In-memory Map keyed by session ID is sufficient for v1/10 users |
| Per-user isolated sessions | Multiple team members connected simultaneously must not share tokens | Low | Each SSE connection gets its own session ID |
| All 16 existing tools functional | Users expect the existing local tool surface to work identically on the hosted server | Low | No new tools needed for v1; this is a transport/auth upgrade |
| `GET /health` endpoint | Railway requires a health check to gate deployments. Without it, blue-green deployments may cut off active sessions | Low | Returns `{"status":"ok","uptime":<seconds>}` with HTTP 200 |
| HTTPS everywhere | MCP spec requires HTTPS for HTTP-based transports. OAuth callbacks require HTTPS redirect URIs | Low | Railway provides TLS termination; Cloudflare handles custom domain |
| Custom domain resolving | `mcp.aemxsc.com` must resolve to the Railway deployment. Without this, users have an ugly `.up.railway.app` URL they cannot share | Low | CNAME in Cloudflare pointing to Railway deployment |
| CORS headers | Claude Code, Cursor, and VS Code clients make cross-origin SSE connections. Without CORS the connection is blocked | Low | `Access-Control-Allow-Origin: *` on SSE and auth endpoints |
| Unauthenticated 401 with guidance | MCP spec (RFC 9728) requires `WWW-Authenticate` header on 401 responses pointing to resource metadata. Clients use this to auto-discover the auth flow | Med | `WWW-Authenticate: Bearer resource_metadata="https://mcp.aemxsc.com/.well-known/oauth-protected-resource"` |
| Human-readable auth error in tool response | MCP clients (especially Claude Code) display tool response text to the user. The login link must appear as readable text, not a raw JSON error code | Low | Return MCP text response, not HTTP 401, when tool is called unauthenticated |
| README / one-page setup guide | Pre-sales team needs a copy-paste onboarding doc for the March 24 demo. Customers demoed live need to follow along | Low | Config snippet for Claude Code + Cursor/VS Code; three steps: add URL, click link, done |

---

## Differentiators

Features that go beyond table stakes and create competitive advantage for pre-sales demos
or make the handoff to Adobe Engineering smoother. None of these are required for March 24
but they materially improve the story.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `da_whoami` tool shows authenticated user | During a live demo, confirming "you are signed in as user@adobe.com" builds trust instantly and proves the auth flow worked | Low | Already exists as a tool; needs to read from server-side session |
| Token refresh without re-login | IMS access tokens expire after 24h. Without refresh, users must click a login link every day. For a demo tool this is acceptable; for a product tool this is a blocker | Med | Refresh token stored alongside access token in session; refresh attempted before 401 is returned to caller |
| Graceful session expiry message | When a token expires and cannot be refreshed, instead of a silent failure or cryptic error, return "Your session has expired. Re-authenticate at https://mcp.aemxsc.com/login?session=<id>" | Low | Small improvement in error handling layer |
| `da_logout` clears session | Lets a demo presenter hand a laptop to a customer without the customer inheriting the presenter's session. Also useful for switching Adobe orgs | Low | Already exists as a tool; needs to clear server-side session entry |
| Structured tool descriptions with scope hints | Tool descriptions that explain what AEM org/site they target ("Lists content in the `aemxsc/xscteamsite` DA org") help Claude give better suggestions and help non-technical users understand what each tool does | Low | Metadata update only, no API changes |
| Deployment environment variables documented | Clear `README` section listing `PORT`, `BASE_URL`, `SESSION_SECRET`, `CLIENT_ID` with defaults lets Adobe Engineering deploy to their own infrastructure without guessing | Low | Directly supports Adobe handoff |
| `/` root endpoint returns server info JSON | Discoverable endpoint returning `{"name":"AEM EDS MCP","version":"x.y.z","tools":16,"auth":"required"}` helps clients and Adobe Engineering verify the deployment without connecting an MCP client | Low | Cosmetic but professional |
| Request logging with session IDs | Structured log lines (`[session-abc123] tool:da_get_content org:aemxsc site:xscteamsite`) make it easy to show the pre-sales team what is happening during a demo and debug issues live | Low | `console.log` with session context is sufficient for v1 |

---

## Anti-Features

Things to deliberately NOT build for v1. Each is either a scope risk to the March 24
deadline or a premature optimization that the project has already decided against.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Redis / persistent session store | Adds infrastructure dependency, deployment complexity, and cost. In-memory is fine for ~10 concurrent users | Use in-memory Map; document Redis as v2 upgrade path |
| Multi-org selection UI | Letting users pick which DA org/site to target per-session adds a configuration step that blocks first-time use. The default `aemxsc/xscteamsite` covers 100% of March 24 use cases | Hardcode default org/site; pass org/site as tool parameters for flexibility |
| Custom OAuth app (Developer Console) | Requires Adobe Developer Console registration and approval, which is not available before March 24. `darkalley` client works and is already proven | Use `darkalley` for v1; Adobe Engineering replaces it in v3 |
| Mobile client support | No pre-sales team member is running Claude Code on mobile. SSE transport is desktop-IDE-only | Explicitly document desktop-only scope |
| Admin UI / dashboard | A web UI for managing sessions, viewing active users, or revoking tokens would be useful for production but is pure scope risk before March 24 | Use server logs and Railway metrics dashboard for v1 observability |
| Rate limiting per user | With ~10 users, rate limiting adds implementation complexity with no real benefit. The DA API itself is the natural throttle | Skip for v1; add in v2 if Adobe Engineering requires it |
| Webhook / event callbacks | Push notifications when content changes are published would be compelling but require a separate architecture (webhooks, polling, pub/sub) unrelated to the current MCP model | Not in scope for any phase of this project |
| Multi-MCP-server federation | Aggregating multiple MCP servers (EDS + AEM CS + SharePoint) into one endpoint is a future architecture question | Single focused server; composition is the client's responsibility |
| Full MCP spec OAuth server metadata | Implementing `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` to full RFC 9728/RFC 8414 spec is correct for production but beyond what current MCP clients (Claude Code, Cursor) require today | Return human-readable login link in tool response; add RFC 9728 metadata endpoint in v2 if clients start using it |

---

## Feature Dependencies

```
Custom domain (mcp.aemxsc.com)
  → OAuth callback URL is valid
  → Login link in tool response works
  → HTTPS required for OAuth redirect_uri

Server-side session store
  → Per-user isolated sessions
  → da_whoami reads correct user
  → da_logout clears correct session
  → Token refresh works without re-login

Health check endpoint
  → Railway deployment gating works
  → Blue-green deploy does not drop active SSE sessions

CORS headers
  → Claude Code / Cursor / VS Code can connect
  → All 16 tools functional on hosted server
```

---

## MVP Recommendation (March 24)

Prioritize in this order:

1. **Railway deployment + custom domain** — Without a stable URL nothing else matters
2. **Server-side session auth with login link** — The entire UX premise depends on this
3. **Health check endpoint** — Required for stable Railway deploys
4. **CORS headers** — Required for any MCP client to connect
5. **Human-readable unauthenticated tool response** — Users must see the login link, not a raw error
6. **All 16 tools wired to server-side session** — The existing tool surface must work
7. **README / onboarding doc** — Required for March 24 team training

Defer to post-March 24:
- Token refresh (24h expiry is acceptable for a demo; re-login is a known limitation)
- Full RFC 9728 `/.well-known/oauth-protected-resource` metadata (current MCP clients do not require it)
- Request logging improvements (basic logging is sufficient for the demo)

---

## Reference: AEM CS MCP Pattern

The official AEM CS MCP at `https://mcp.adobeaemcloud.com/adobe/mcp/` establishes these patterns that this server should match:

| Pattern | AEM CS MCP | This Server |
|---------|-----------|-------------|
| Single config URL | Yes — one URL per capability tier | Yes — one URL, all EDS tools |
| Adobe IMS auth | Yes — OAuth with Adobe ID | Yes — same IMS via `darkalley` client |
| Permissions respected | Yes — tools respect AEM user roles | Yes — DA API enforces org/site access |
| Tool discovery via prompt | Yes — "list all available tools" | Yes — MCP tool list is auto-discoverable |
| Multiple capability tiers | Yes — `/content`, `/content-readonly`, `/cloudmanager` | No — single endpoint, all tools (v1 scope) |

Confidence: MEDIUM (AEM CS MCP patterns sourced from Experience League docs, not live endpoint inspection)

---

## Configuration Users Need Per Session

Based on research into hosted MCP multi-tenant patterns and the existing tool design:

| Config Item | Where Provided | Default | Required? |
|-------------|---------------|---------|----------|
| MCP server URL | MCP client config file (one-time setup) | `https://mcp.aemxsc.com/sse` | Yes |
| Adobe IMS login | Browser popup on first use (one-time per 24h) | — | Yes |
| DA org | Tool parameter (e.g., `org: "aemxsc"`) | `aemxsc` | No — default works for team use |
| DA site | Tool parameter (e.g., `site: "xscteamsite"`) | `xscteamsite` | No — default works for team use |

Non-technical users need to provide zero configuration beyond adding the URL and clicking login.
Technical users (Adobe Engineering, customers with their own DA orgs) can override org/site per tool call.

---

## Error Message Guidance

The MCP spec (RFC 9728) and production MCP patterns establish these expected behaviors:

| Situation | What to Return | Why |
|-----------|---------------|-----|
| Tool called, no session exists yet | MCP text response: "Not authenticated. Open [login URL] to sign in with your Adobe ID." | Users see this in Claude/Cursor as readable text; a raw 401 is invisible |
| HTTP request to SSE endpoint, no token | HTTP 401 with `WWW-Authenticate: Bearer resource_metadata="..."` | Spec-compliant; enables future MCP client auto-discovery |
| Tool called, token expired, refresh fails | MCP text response: "Session expired. Re-authenticate at [login URL]" | Same UX as first-time login |
| Tool called, DA API returns 403 | MCP text response: "Permission denied. Your Adobe account does not have access to [org]/[site]" | Surfaces the real problem without exposing raw HTTP error |
| OAuth callback receives invalid state | HTTP 400 with HTML error page: "Authentication failed. Please try again." | Covers CSRF/redirect attack cases |

---

## Monitoring / Health Features Expected for Hosted Service

For the March 24 v1 scope (Railway + ~10 users):

| Feature | Implementation | Priority |
|---------|---------------|----------|
| `GET /health` returning HTTP 200 | Required by Railway for deployment gating | Must-have |
| Railway built-in metrics | CPU, memory, request count visible in Railway dashboard — zero implementation cost | Free |
| Structured console logs with session IDs | `[session-abc] tool:da_get_content status:200 ms:143` — visible in Railway log stream | Low effort, high demo value |
| Uptime monitoring (external) | openstatus.dev or similar pings `/health` every 60s; free tier available | Nice-to-have, not March 24 |
| Active session count in health response | `{"status":"ok","sessions":3}` — useful for demo reassurance | Low effort |

Full observability (OpenTelemetry, Prometheus, Sentry) is appropriate for Adobe Engineering v3 productization, not v1.

---

## Sources

- [Using MCP with AEM as a Cloud Service — Experience League](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/ai-in-aem/mcp-support/using-mcp-with-aem-as-a-cloud-service) — MEDIUM confidence (official Adobe docs, endpoint not directly inspected)
- [MCP Authorization Specification — modelcontextprotocol.io](https://modelcontextprotocol.io/specification/draft/basic/authorization) — HIGH confidence (official spec)
- [Railway Health Checks Documentation](https://docs.railway.com/deployments/healthchecks) — HIGH confidence (official Railway docs)
- [OAuth for MCP — Stytch](https://stytch.com/blog/MCP-authentication-and-authorization-guide/) — MEDIUM confidence (verified against spec)
- [MCP Authentication Patterns — Security Boulevard](https://securityboulevard.com/2026/03/mcp-authentication-and-authorization-patterns/) — LOW confidence (single source, March 2026)
- [MCP Error Handling Best Practices — MCPcat](https://mcpcat.io/guides/error-handling-custom-mcp-servers/) — MEDIUM confidence (community guide, consistent with spec)
- [MCP Gateways for Production 2026 — Maxim](https://www.getmaxim.ai/articles/best-mcp-gateways-for-production-systems-in-2026/) — LOW confidence (vendor content)
- [Building Health Check Endpoints for MCP Servers — MCPcat](https://mcpcat.io/guides/building-health-check-endpoint-mcp-server/) — MEDIUM confidence (community guide, consistent with Railway docs)

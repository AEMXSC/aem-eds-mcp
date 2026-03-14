---
phase: 01-foundation
plan: "01"
subsystem: infra
tags: [express, railway, typescript, oauth, mcp]

# Dependency graph
requires: []
provides:
  - Single Express server bound to 0.0.0.0:${PORT} ready for Railway deployment
  - process.env.PORT as primary port source
  - trust proxy setting for Railway TLS termination
  - Removed dual-server (oauthApp + HTTPS) architecture
  - Single tryListen call replacing port scan loop
affects: [02, 03, 04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Railway binding: app.listen(port, '0.0.0.0') + app.set('trust proxy', 1)"
    - "Port resolution: process.env.PORT ?? process.env.HLX_MCP_PORT ?? '3000'"

key-files:
  created: []
  modified:
    - tools/hlx-admin-mcp/src/http.ts

key-decisions:
  - "Removed oauthApp entirely — OAuth endpoints will be refactored to live on main app in Phase 2"
  - "/.well-known routes use http://localhost:3000 placeholder — Phase 2 will replace with PUBLIC_URL"
  - "Port scan loop removed — Railway assigns a single PORT, scanning is unnecessary and misleading"

patterns-established:
  - "Railway bind pattern: 0.0.0.0 + trust proxy 1"
  - "PORT env var takes precedence over HLX_MCP_PORT for Railway compatibility"

requirements-completed: [HOST-02, HOST-03]

# Metrics
duration: 3min
completed: 2026-03-14
---

# Phase 1 Plan 01: Railway Port Binding and Single-Server Architecture Summary

**Collapsed dual-server Express architecture to a single app bound to 0.0.0.0:${PORT} with Railway trust-proxy enabled**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T19:21:32Z
- **Completed:** 2026-03-14T19:24:15Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Removed createHttpsServer, selfsigned imports, OAUTH_PORT, and OAUTH_CALLBACK_URI constants
- Deleted entire oauthApp express instance (190+ lines of dual-server routing)
- Deleted startOAuthHttpsServer() function
- Fixed BASE_PORT to read process.env.PORT first (Railway compatibility)
- Changed bind address from 127.0.0.1 to 0.0.0.0 in tryListen
- Added app.set("trust proxy", 1) after const app = express()
- Replaced port scan for-loop with single tryListen(BASE_PORT) call
- TypeScript build passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove dual-server imports and constants** - `58abd49` (chore)
2. **Task 2: Remove oauthApp server block and fix /.well-known routes** - `c1de0ef` (feat)
3. **Task 3: Fix bind address, add trust proxy, replace port scan loop, verify build** - `4d45b8b` (feat)

## Files Created/Modified
- `tools/hlx-admin-mcp/src/http.ts` - Collapsed from dual-server to single Express app; Railway-compatible port binding, trust proxy, and PORT env var

## Decisions Made
- Removed oauthApp entirely rather than moving routes — Phase 2 will re-implement OAuth endpoints on the main app with PUBLIC_URL support
- The /.well-known discovery routes use "http://localhost:3000" as a compile-safe placeholder; Phase 2 replaces this with process.env.PUBLIC_URL
- Port scan loop removed because Railway assigns a single PORT — scanning is unnecessary and could cause confusion in logs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- http.ts is Railway-deployable: binds 0.0.0.0, reads PORT, trust proxy enabled
- OAuth endpoints have been removed — Phase 2 must re-add /authorize, /callback, /token on the main app using PUBLIC_URL
- The /.well-known placeholder comments explicitly mark the Phase 2 replacement point

---
*Phase: 01-foundation*
*Completed: 2026-03-14*

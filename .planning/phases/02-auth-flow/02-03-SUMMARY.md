---
phase: 02-auth-flow
plan: "03"
subsystem: auth
tags: [typescript, adobe-ims, mcp, oauth, http-mode]

# Dependency graph
requires:
  - phase: 02-auth-flow
    provides: "httpMode flag and setHttpMode() exported from tools.ts; 401 auth guard in http.ts (plan 02-02)"
  - phase: 02-auth-flow
    provides: "http.ts infrastructure with session-based OAuth flow (plan 02-01)"
provides:
  - "da_login httpMode branch — returns login URL guidance text in hosted mode instead of opening browser"
  - "Local stdio mode unchanged — openBrowser() still called when httpMode is false"
affects: [02-auth-flow, phase-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "if (httpMode) early-return pattern — all tools that need different hosted vs local behavior use this guard"
    - "PUBLIC_URL env var resolution for hosted mode URL construction"

key-files:
  created: []
  modified:
    - tools/hlx-admin-mcp/src/tools.ts

key-decisions:
  - "da_login httpMode branch returns URL guidance text pointing user to the 401 response login_url — avoids duplicating URL construction logic that already lives in http.ts"
  - "publicUrl in da_login uses process.env.PUBLIC_URL ?? http://localhost:3000 — same pattern as http.ts"

patterns-established:
  - "if (httpMode) early-return: place immediately after input validation, before local-mode logic"

requirements-completed: [DA-05]

# Metrics
duration: 1min
completed: "2026-03-14"
---

# Phase 2 Plan 03: da_login httpMode Branch Summary

**da_login returns login URL guidance text in hosted mode instead of calling openBrowser(), preserving full local/stdio behavior unchanged**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-14T22:46:40Z
- **Completed:** 2026-03-14T22:47:40Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `if (httpMode)` early-return branch to `da_login` case in `handleTool` switch — returns a text response with login URL guidance instead of calling `openBrowser()`
- Local/stdio mode fully preserved below the branch: `ensureHlxLoginServer()`, `_pendingLoginContext`, and `openBrowser()` all called exactly as before
- TypeScript compiled without errors (`npm run build` exits 0)
- Phase 2 smoke suite: 6/6 PASS (AUTH-01 x3, AUTH-02 x2, AUTH-05 x1)
- Phase 1 regression suite: 10/10 PASS — no regressions introduced

## Task Commits

Each task was committed atomically:

1. **Task 1: Add httpMode branch to da_login case in tools.ts** - `a052c30` (feat)
2. **Task 2: Run full Phase 2 test suite and verify no regressions** - no files changed (verification only)

## Files Created/Modified

- `tools/hlx-admin-mcp/src/tools.ts` - Added 20-line `if (httpMode)` early-return block inside `da_login` case

## Decisions Made

- The httpMode branch directs users to "check the 401 response body for the full login URL" rather than constructing a URL itself — this avoids duplicating the `sessionId` generation logic that already lives in `http.ts`. The 401 response already contains the `login_url` field (plan 02-02 work).
- `publicUrl` in the guidance text uses `process.env.PUBLIC_URL ?? "http://localhost:3000"` matching the same pattern used across http.ts route handlers.

## Deviations from Plan

None - plan executed exactly as written. The edit was surgical: only the `if (httpMode)` branch was added; all surrounding code remained unchanged.

## Issues Encountered

None. The build succeeded on first attempt and both test suites passed without any failures.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 2 (auth-flow) is now complete:
- Plan 02-01: OAuth session infrastructure and IMS redirect routes
- Plan 02-02: 401 auth guard for all /mcp requests
- Plan 02-03: da_login httpMode branch (this plan)

Phase 3 readiness:
- All three Phase 2 requirements (AUTH-01, AUTH-02, DA-05) are implemented and smoke-tested
- Critical external dependency remains: `darkalley` OAuth client redirect URI (`https://mcp.aemxsc.com/callback`) must be added to Adobe Developer Console before end-to-end auth can be tested with real tokens
- Railway deployment configuration (Phase 3) can now proceed since auth flow is complete

---
*Phase: 02-auth-flow*
*Completed: 2026-03-14*

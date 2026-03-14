---
phase: 02-auth-flow
plan: 01
subsystem: testing
tags: [bash, smoke-test, auth, curl, phase2]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: dist/http.js build artifact and PORT=9999 server pattern from test-phase1.sh

provides:
  - tools/hlx-admin-mcp/test-phase2.sh — Wave 0 smoke test harness for Phase 2
  - AUTH-01 checks: HTTP 401, login_url body field, WWW-Authenticate header
  - AUTH-02 checks: HTTP 302, Location pointing to ims-na1.adobelogin.com
  - AUTH-05 static grep check: localhost:3000 absent from src/http.ts
  - DA-05 skip comment with manual test instructions

affects:
  - 02-02 (auth implementation — these tests are the Red target)
  - 02-03 (da_login httpMode — AUTH-01 guard validates indirectly)
  - gsd:verify-work phase 2 (full suite must be green before UAT)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 TDD: create failing smoke tests before implementation plans (explicit Red phase)"
    - "ADOBE_IMS_CLIENT_ID env var activates IMS_OAUTH_ENABLED auth guard on server"
    - "AUTH-05 static check uses grep -rn to catch hardcoded URLs before server start"

key-files:
  created:
    - tools/hlx-admin-mcp/test-phase2.sh
  modified: []

key-decisions:
  - "DA-05 automated check skipped — da_login httpMode requires live IMS Bearer token; documented as manual-only in script comment"
  - "ADOBE_IMS_CLIENT_ID=test-client used to activate auth guard in smoke tests — server checks for this env var to enable OAuth enforcement"
  - "AUTH-01 WWW-Authenticate header tested via curl -sI (HEAD-like) rather than -o flag to avoid body parsing complexity"

patterns-established:
  - "Phase test harness pattern: static checks first (no server needed), then smoke checks (PORT=9999 server), cleanup trap, PASS/FAIL counters"
  - "Confirmed FAIL baseline: script exits 1 with 6 failures against unmodified codebase (0 PASS, 6 FAIL)"

requirements-completed:
  - AUTH-01
  - AUTH-02
  - AUTH-05
  - DA-05

# Metrics
duration: 1min
completed: 2026-03-14
---

# Phase 2 Plan 01: test-phase2.sh Wave 0 Smoke Test Harness Summary

**Bash smoke test harness validating AUTH-01 (401+login_url+WWW-Authenticate), AUTH-02 (302 to Adobe IMS), and AUTH-05 (no localhost:3000) — confirmed failing against unmodified codebase establishing Red phase**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-14T20:21:56Z
- **Completed:** 2026-03-14T20:23:16Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- Created test-phase2.sh following exact test-phase1.sh structure (PASS/FAIL counters, cleanup trap, PORT=9999, sleep 2)
- Script correctly fails against unmodified codebase: 0 passed, 6 failed — Red phase confirmed
- AUTH-05 static check catches 2 hardcoded localhost:3000 occurrences in src/http.ts before server even starts
- AUTH-01/AUTH-02 smoke checks fail because routes/auth guard do not exist yet — verifying tests are real, not stubs
- DA-05 documented as manual-only with clear skip comment and instructions for post-auth manual verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Create test-phase2.sh smoke test script** - `b8187a3` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `tools/hlx-admin-mcp/test-phase2.sh` — Phase 2 smoke test harness: AUTH-01, AUTH-02, AUTH-05 automated checks + DA-05 manual skip

## Decisions Made

- DA-05 automated check skipped — da_login httpMode requires a live IMS Bearer token which cannot be synthesized in CI. Documented as manual-only with test instructions in the script comment.
- ADOBE_IMS_CLIENT_ID=test-client used when starting the server to activate IMS_OAUTH_ENABLED mode (the auth guard only activates when this env var is set).
- AUTH-05 static check placed before server start so it runs even if the server fails to start — fast feedback on the most critical static regression.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required for this plan.

## Next Phase Readiness

- test-phase2.sh is the verification gate for all subsequent Phase 2 implementation plans
- Every task in 02-02 and 02-03 must run `bash tools/hlx-admin-mcp/test-phase2.sh` after commit
- Full suite (test-phase2.sh + test-phase1.sh) must be green before `/gsd:verify-work phase 2`
- Phase 2 Wave 1 (02-02) can proceed immediately — auth guard and /login route implementation

## Self-Check: PASSED

- tools/hlx-admin-mcp/test-phase2.sh: FOUND
- .planning/phases/02-auth-flow/02-01-SUMMARY.md: FOUND
- Commit b8187a3: FOUND

---
*Phase: 02-auth-flow*
*Completed: 2026-03-14*

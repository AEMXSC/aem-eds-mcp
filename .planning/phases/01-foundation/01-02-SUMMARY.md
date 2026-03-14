---
phase: 01-foundation
plan: "02"
subsystem: infra
tags: [railway, toml, deployment, health-check, smoke-test, shell]

# Dependency graph
requires: []
provides:
  - Railway Config as Code file (railway.toml) at tools/hlx-admin-mcp/
  - Automated Phase 1 smoke test script covering HOST-02 through HOST-05
affects: [01-03, phase-3-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns: [Railway TOML Config as Code, bash smoke test with pass/fail counters]

key-files:
  created:
    - tools/hlx-admin-mcp/railway.toml
    - tools/hlx-admin-mcp/test-phase1.sh
  modified: []

key-decisions:
  - "railway.toml placed inside tools/hlx-admin-mcp/ (not repo root) — Railway Root Directory must be set to tools/hlx-admin-mcp/ in dashboard (Phase 3 task)"
  - "test-phase1.sh uses PORT=9999 for smoke checks to avoid conflict with any running server on 3000"
  - "restartPolicyType set to on_failure — restarts on crash, not on clean exit"
  - "healthcheckTimeout set to 30s — conservative; Express starts in under 1 second"

patterns-established:
  - "Railway deployment: toml file co-located with service source code, not repo root"
  - "Smoke tests: standalone bash script with pass/fail counters and EXIT trap for server cleanup"

requirements-completed: [HOST-05]

# Metrics
duration: 2min
completed: "2026-03-14"
---

# Phase 1 Plan 02: Railway Config + Phase 1 Test Script Summary

**railway.toml with build/start/health-check config and 10-check bash smoke test covering HOST-02 through HOST-05**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-14T19:26:25Z
- **Completed:** 2026-03-14T19:27:28Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `tools/hlx-admin-mcp/railway.toml` with exact Railway Config as Code spec: buildCommand, startCommand, healthcheckPath, healthcheckTimeout, and restartPolicyType
- Created `tools/hlx-admin-mcp/test-phase1.sh` with 10 automated checks covering HOST-02 (bind address), HOST-03 (selfsigned removal, no port 3443), HOST-04 (/health 200 response), HOST-05 (railway.toml fields)
- Script uses PORT=9999 for smoke checks, includes cleanup trap, and exits non-zero on any failure

## Task Commits

Each task was committed atomically:

1. **Task 1: Create railway.toml** - `0f7b690` (chore)
2. **Task 2: Create test-phase1.sh smoke test script** - `0c99e29` (chore)

## Files Created/Modified
- `tools/hlx-admin-mcp/railway.toml` - Railway Config as Code: build, deploy, health check, restart policy
- `tools/hlx-admin-mcp/test-phase1.sh` - Bash smoke test: 5 static checks + 5 runtime checks, PORT=9999

## Decisions Made
- `railway.toml` placed inside `tools/hlx-admin-mcp/` matching the Railway Root Directory that will be set in Phase 3 (not repo root). This is intentional and documented in the plan.
- `PORT=9999` chosen for smoke tests to avoid any conflict with a running dev server on 3000.
- `restartPolicyType = "on_failure"` — Railway only restarts on non-zero exit; clean `process.exit(0)` will not trigger a loop.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Both files created cleanly. All four overall verification checks passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `railway.toml` is ready; Railway dashboard Root Directory config happens in Phase 3
- `test-phase1.sh` is ready to run after Plan 01-03 completes the `selfsigned` removal (HOST-03 static check will fail until then — expected)
- Phase 1 plans: 01-01 done (port binding), 01-02 done (railway config + test script), 01-03 remaining (selfsigned removal)

---
*Phase: 01-foundation*
*Completed: 2026-03-14*

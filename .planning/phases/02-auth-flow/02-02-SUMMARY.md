---
phase: 02-auth-flow
plan: "02"
subsystem: auth
tags: [adobe-ims, pkce, oauth2, express, session-management, bearer-token]

# Dependency graph
requires:
  - phase: 02-01
    provides: Consolidated single-Express server with IMS_OAUTH_ENABLED flag, sessions Map, pendingOAuthStates Map, resolveSessionToken helper
provides:
  - GET /login route: generates PKCE verifier, creates pendingOAuthState keyed by random imsState hex, redirects 302 to Adobe IMS /ims/authorize/v2
  - GET /callback route: exchanges IMS authorization code for access token, stores session in sessions Map, returns success HTML
  - 401 guard on POST /mcp: unauthenticated requests get 401 + WWW-Authenticate + JSON body with login_url
  - PUBLIC_URL substitution: all well-known handlers use process.env.PUBLIC_URL instead of hardcoded localhost:3000
  - Simplified PendingOAuthState interface: sessionId, imsCodeVerifier, createdAt only
affects:
  - Phase 3 deployment (Railway needs PUBLIC_URL env var set)
  - Phase 4 testing (AUTH-03, AUTH-04 manual live IMS verification)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pendingOAuthStates keyed by imsState (random hex), not sessionId — prevents session fixation"
    - "Bearer session token = UUID passed as ?session=<uuid> query param through IMS leg"
    - "publicUrl pattern: process.env.PUBLIC_URL ?? http://localhost:${activePort} used in all URL-generating handlers"
    - "401 with fresh sessionId per unauthenticated request — never reuse incoming token as UUID"

key-files:
  created: []
  modified:
    - tools/hlx-admin-mcp/src/http.ts

key-decisions:
  - "pendingOAuthStates keyed by IMS state param (random hex), not session UUID — session UUID travels as PKCE verifier payload"
  - "401 responses generate a fresh sessionId (uuidv4) per request — never derive from incoming Authorization header"
  - "redirectUri passed explicitly to exchangeCodeForToken — no fallback to CALLBACK_URI constant"
  - "IMS scopes include offline_access for refresh token support"

patterns-established:
  - "publicUrl resolution: const publicUrl = process.env.PUBLIC_URL ?? `http://localhost:${activePort}` — single pattern across all route handlers"
  - "Auth route logging: process.stderr.write for all auth events with session/state prefix slices for privacy"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06]

# Metrics
duration: 8min
completed: 2026-03-14
---

# Phase 2 Plan 02: Auth Flow Implementation Summary

**Adobe IMS PKCE auth flow wired into Express: /login + /callback routes, 401 guard on POST /mcp, and PUBLIC_URL substitution replacing all localhost:3000 hardcodes**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-14T20:25:47Z
- **Completed:** 2026-03-14T20:33:40Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Replaced complex 5-field `PendingOAuthState` with simplified 3-field version (sessionId, imsCodeVerifier, createdAt) matching Phase 2 architecture
- Replaced all 4 hardcoded `localhost:3000` occurrences in well-known handlers with `process.env.PUBLIC_URL ?? http://localhost:${activePort}` pattern
- Added `GET /login` route that initiates PKCE flow: generates code verifier/challenge, stores pending state keyed by random imsState hex, redirects 302 to Adobe IMS authorize endpoint
- Added `GET /callback` route that completes PKCE flow: validates state, exchanges code for token via `exchangeCodeForToken`, stores session in sessions Map, returns success HTML page
- Added 401 guard on `POST /mcp` when `IMS_OAUTH_ENABLED`: missing Bearer token returns 401 + WWW-Authenticate header + JSON `login_url`; invalid/expired token also returns 401 with fresh login URL

## Task Commits

Each task was committed atomically:

1. **Task 1: Simplify PendingOAuthState and fix PUBLIC_URL in well-known handlers** - `e0770f9` (feat)
2. **Task 2: Add /login route, /callback route, and 401 guard on POST /mcp** - `7874fee` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `tools/hlx-admin-mcp/src/http.ts` - Complete auth flow: simplified PendingOAuthState, PUBLIC_URL substitution, /login route, /callback route, 401 guard on POST /mcp

## Decisions Made

- `pendingOAuthStates` keyed by IMS state param (random hex), not session UUID — session UUID travels as a field inside the pending state value, preventing session fixation attacks
- 401 responses generate a fresh `uuidv4()` sessionId per request — never derive session ID from the incoming Bearer value
- `redirectUri` passed explicitly to `exchangeCodeForToken` — no fallback to any CALLBACK_URI constant
- IMS scope string includes `offline_access` to request refresh tokens (supports refresh in `resolveSessionToken`)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required in this plan. Phase 3 will configure `PUBLIC_URL` environment variable on Railway.

## Test Results

**test-phase2.sh:** 6/6 PASS
- AUTH-01: unauthenticated POST /mcp returns 401 (PASS)
- AUTH-01: 401 response body contains login_url field (PASS)
- AUTH-01: 401 response includes WWW-Authenticate header (PASS)
- AUTH-02: GET /login?session=<id> returns 302 redirect (PASS)
- AUTH-02: /login redirect points to Adobe IMS (ims-na1.adobelogin.com) (PASS)
- AUTH-05: no hardcoded localhost:3000 in http.ts (PASS)

**test-phase1.sh:** 10/10 PASS (no regressions)

AUTH-03 (live callback token exchange), AUTH-04 (session token resolves IMS token), AUTH-06 (refresh token flow) remain manual-only as documented in VALIDATION.md — require live IMS Bearer token.

## Next Phase Readiness

- Complete auth flow is wired and tested against static + smoke checks
- Phase 3 (deployment) needs: `PUBLIC_URL` env var set on Railway to the deployed domain, `ADOBE_IMS_CLIENT_ID` set to the darkalley client ID
- Adobe Developer Console redirect URI `https://mcp.aemxsc.com/callback` must be registered before live end-to-end testing (external dependency — initiate on day 1)

## Self-Check: PASSED

- FOUND: tools/hlx-admin-mcp/src/http.ts
- FOUND: commit e0770f9 (Task 1)
- FOUND: commit 7874fee (Task 2)

---
*Phase: 02-auth-flow*
*Completed: 2026-03-14*

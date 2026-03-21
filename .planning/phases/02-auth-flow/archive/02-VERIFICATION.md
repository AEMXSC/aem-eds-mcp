---
phase: 02-auth-flow
verified: 2026-03-20T00:00:00Z
status: gaps_found
score: 4/9 must-haves verified
re_verification:
  previous_status: human_needed
  previous_score: 6/7
  gaps_closed: []
  gaps_remaining:
    - "AUTH-03 live IMS roundtrip (runtime verification) — still unverifiable without live Adobe IMS session"
    - "AUTH-04 POST /mcp with valid Bearer returns 200 (runtime) — requires AUTH-03 completion"
    - "AUTH-06 Adobe Developer Console redirect URI registration — external action, unverifiable from codebase"
    - "DA-05 da_login httpMode runtime behavior — requires live authenticated session to reach tool case"
  regressions: []
gaps:
  - truth: "ROADMAP Phase 2 goal matches executed work"
    status: failed
    reason: "ROADMAP.md was updated after plan execution to redefine Phase 2 as 'Strip DA tools + wire HLX_ADMIN_TOKEN' — directly opposite of what was built (PKCE auth added, DA tools kept). The current ROADMAP success criteria contradict the implemented code."
    artifacts:
      - path: ".planning/ROADMAP.md"
        issue: "Phase 2 goal now reads 'Strip DA tools + PKCE auth, wire a single HLX_ADMIN_TOKEN env var, keep HLX admin tools only' — the plans did the opposite (added PKCE auth, kept DA tools)"
    missing:
      - "ROADMAP.md Phase 2 goal must be reconciled with executed plans — either revert ROADMAP to match completed work, or the work needs to be redone to match the updated ROADMAP"
  - truth: "REQUIREMENTS.md Phase 2 requirement IDs match plan-claimed requirement IDs"
    status: failed
    reason: "AUTH-01 in REQUIREMENTS.md is now defined as 'HLX_ADMIN_TOKEN env var on Railway'. AUTH-02 is 'Token refresh procedure documented'. AUTH-03 through AUTH-06 and DA-05 are listed in the traceability table as Complete but have NO definition in the requirements body — they were deleted when REQUIREMENTS.md was simplified."
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "Requirements body defines AUTH-01 as HLX_ADMIN_TOKEN and AUTH-02 as token refresh procedure. Plans implemented a completely different AUTH-01 (PKCE 401 guard) and AUTH-02 (/login route). AUTH-03 to AUTH-06 and DA-05 appear only in traceability table with no body definitions."
    missing:
      - "REQUIREMENTS.md needs reconciliation: either restore PKCE requirement definitions (AUTH-01 through AUTH-06, DA-05) to the body, or update the traceability table to remove orphaned IDs"
  - truth: "AUTH-01 (REQUIREMENTS.md definition) — HLX_ADMIN_TOKEN env var wired for all admin.hlx.page calls"
    status: failed
    reason: "The current REQUIREMENTS.md defines AUTH-01 as 'HLX_ADMIN_TOKEN env var on Railway — IMS token used for all admin.hlx.page calls'. The code uses HLX_API_KEY and HLX_AUTH_TOKEN env vars (not HLX_ADMIN_TOKEN). The single-token simplified approach from the updated ROADMAP is not implemented."
    artifacts:
      - path: "tools/hlx-admin-mcp/src/tools.ts"
        issue: "adminRequest() checks HLX_API_KEY and HLX_AUTH_TOKEN env vars — not HLX_ADMIN_TOKEN. The simplified architecture from the updated ROADMAP/REQUIREMENTS is not present."
    missing:
      - "Either rename env var references to HLX_ADMIN_TOKEN to match REQUIREMENTS.md, or update REQUIREMENTS.md to reflect HLX_API_KEY/HLX_AUTH_TOKEN"
  - truth: "AUTH-02 (REQUIREMENTS.md definition) — Token refresh procedure documented for demo day"
    status: failed
    reason: "Current REQUIREMENTS.md defines AUTH-02 as 'Token refresh procedure documented for demo day (morning of March 24)'. No such documentation exists in the repository."
    artifacts: []
    missing:
      - "Create token refresh procedure documentation (README section or dedicated doc) for the March 24 demo day"
  - truth: "HLX-01 through HLX-08 tools satisfy Phase 2 ROADMAP success criteria"
    status: failed
    reason: "ROADMAP traceability assigns HLX-01 through HLX-08 to Phase 4, not Phase 2. Current ROADMAP Phase 2 success criterion #1 states 'Server exposes only HLX admin tools — no DA tools, no login/callback routes.' The server currently still has /login, /callback routes and DA tools. Phase 2 per the current ROADMAP is not met."
    artifacts:
      - path: "tools/hlx-admin-mcp/src/http.ts"
        issue: "GET /login (line 208) and GET /callback (line 245) routes exist. Current ROADMAP Phase 2 success criterion explicitly says 'no login/callback routes'."
      - path: "tools/hlx-admin-mcp/src/tools.ts"
        issue: "DA tools (da_login, da_logout, da_whoami, da_read, da_write, etc.) still present. Current ROADMAP Phase 2 success criterion says 'no DA tools'."
    missing:
      - "If updated ROADMAP is authoritative: remove /login and /callback routes, remove DA tools, wire HLX_ADMIN_TOKEN"
      - "If original plans are authoritative: revert ROADMAP.md Phase 2 goal to the PKCE auth definition that was actually executed"
human_verification:
  - test: "Full PKCE roundtrip — AUTH-03 + AUTH-04"
    expected: "POST /mcp unauthenticated returns 401 with login_url. Open login_url in browser. Complete Adobe IMS login. POST /mcp with Authorization: Bearer <session-uuid> returns HTTP 200 with tools array."
    why_human: "Requires live Adobe IMS authorization code from a real browser login. Cannot be synthesized programmatically."
  - test: "Adobe Developer Console redirect URI registration — AUTH-06"
    expected: "https://mcp.aemxsc.com/callback is listed as an allowed redirect URI under the darkalley client_id. Live PKCE flow completes without redirect_uri_mismatch error."
    why_human: "External administrative action in Adobe Developer Console. No code in the repository can register this URI."
  - test: "da_login httpMode runtime behavior — DA-05"
    expected: "With a valid Bearer session token, calling da_login via POST /mcp returns text containing the login URL pattern. Response must NOT contain 'Browser opened'. No browser launches on the server."
    why_human: "The 401 guard intercepts unauthenticated requests before da_login is called. Only a live authenticated session bypasses the guard and reaches the tool handler."
---

# Phase 2: Auth Flow Re-Verification Report

**Phase Goal (as stated by user / original plans):** Wire the complete Adobe IMS PKCE auth flow — /login redirect, /callback token exchange, 401 gate on POST /mcp, PUBLIC_URL for redirect URIs, and da_login httpMode branch returning a URL string instead of opening a browser.

**Phase Goal (current ROADMAP.md):** Strip the server down to HLX Admin only — remove DA tools, remove PKCE/session auth, wire a single HLX_ADMIN_TOKEN env var for all admin.hlx.page calls.

**Verified:** 2026-03-20T00:00:00Z
**Status:** gaps_found
**Re-verification:** Yes — previous verification (2026-03-14) had status human_needed

---

## CRITICAL: ROADMAP / Implementation Divergence

The ROADMAP.md was updated after Phase 2 plans were written and executed. The current ROADMAP defines a completely different Phase 2 scope than what the plans implemented:

| Dimension | Original Plans Executed | Current ROADMAP Phase 2 |
|-----------|------------------------|-------------------------|
| Auth approach | PKCE OAuth (add /login, /callback, 401 guard) | Remove PKCE, wire single HLX_ADMIN_TOKEN env var |
| DA tools | Kept (da_login, da_logout, da_whoami, etc.) | Remove all DA tools |
| Login routes | Added GET /login, GET /callback | Explicitly not present ("no login/callback routes") |
| Token storage | In-memory sessions Map per PKCE flow | Single env var HLX_ADMIN_TOKEN |

**This is a requirements/roadmap reconciliation problem, not just a code verification problem.** The requirement IDs the user asked to verify (AUTH-01, AUTH-02, HLX-01 through HLX-08) map to the current ROADMAP scope, which was not what was implemented.

---

## Goal Achievement (Against Original PKCE Goal from Plans)

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Unauthenticated POST /mcp returns 401 with WWW-Authenticate header and login_url in JSON body | VERIFIED | http.ts lines 316-331: guard present, returns 401 + setHeader WWW-Authenticate + json with login_url field |
| 2 | GET /login?session=id redirects (302) to Adobe IMS PKCE authorize URL | VERIFIED | http.ts lines 208-243: /login route generates PKCE verifier/challenge, calls res.redirect() to ims-na1.adobelogin.com |
| 3 | GET /callback exchanges code for IMS token and stores session | VERIFIED (code) | http.ts lines 245-302: complete callback implementation with exchangeCodeForToken(), sessions.set(). Runtime requires live IMS — human needed |
| 4 | No hardcoded localhost:3000 in http.ts — PUBLIC_URL used throughout | VERIFIED | grep confirms zero localhost:3000 occurrences in src/http.ts. All URL-generating locations use process.env.PUBLIC_URL pattern |
| 5 | da_login returns URL guidance (not browser open) when httpMode is true | VERIFIED (code) | tools.ts lines 803-820: if (httpMode) early-return before openBrowser(). Local mode unchanged at line 834 |
| 6 | AUTH-03 live IMS roundtrip: /callback stores session, GET /health shows sessions: 1 | HUMAN NEEDED | Requires live Adobe IMS auth code — cannot synthesize |
| 7 | AUTH-04 POST /mcp with valid Bearer returns 200 | HUMAN NEEDED | Requires real session UUID from AUTH-03 flow |
| 8 | AUTH-06 darkalley redirect URI registered in Adobe Developer Console | HUMAN NEEDED | External administrative action — no code can verify |
| 9 | ROADMAP Phase 2 success criteria met (current ROADMAP definition) | FAILED | Current ROADMAP requires DA tools removed, /login /callback removed, HLX_ADMIN_TOKEN wired — none of these are true |

**Score:** 4 automated verified, 3 human-needed, 2 failed — 4/9 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tools/hlx-admin-mcp/test-phase2.sh` | Phase 2 smoke test harness | VERIFIED | Exists, executable. AUTH-01 x3, AUTH-02 x2, AUTH-05 x1 checks. DA-05 intentionally skipped with comment. |
| `tools/hlx-admin-mcp/src/http.ts` | Complete PKCE auth flow | VERIFIED | 499 lines. /login (line 208), /callback (line 245), 401 guard (line 316), PUBLIC_URL throughout. |
| `tools/hlx-admin-mcp/src/tools.ts` | da_login httpMode branch | VERIFIED | if (httpMode) at line 804, returns text before openBrowser(). Local mode at line 834 intact. |
| `tools/hlx-admin-mcp/dist/http.js` | Built JavaScript | VERIFIED | TypeScript compiled successfully (confirmed by test suite passing). |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| POST /mcp handler | sessions Map | extractBearer + resolveSessionToken | VERIFIED | http.ts line 318: extractBearer(req), line 334: resolveSessionToken(). 401 returned if no Bearer or invalid session. |
| GET /login route | pendingOAuthStates Map | pendingOAuthStates.set(imsState, { sessionId, imsCodeVerifier, createdAt }) | VERIFIED | http.ts line 226-230: keyed by random imsState hex (not sessionId — correct, prevents session fixation). |
| GET /callback route | sessions Map | sessions.set(pending.sessionId, { imsToken, ... }) | VERIFIED | http.ts lines 279-285: stores token after successful exchangeCodeForToken() call. |
| /.well-known handlers | process.env.PUBLIC_URL | const publicUrl = process.env.PUBLIC_URL ?? http://localhost:${activePort} | VERIFIED | http.ts lines 184, 198: both well-known handlers use pattern. Lines 223, 268, 322, 338: all auth routes also use it. |
| da_login case | httpMode flag | if (httpMode) { return URL guidance } else { openBrowser() } | VERIFIED | tools.ts lines 804-820: httpMode branch. Lines 822-848: local mode. |
| HLX tools (hlx_preview etc.) | adminRequest | imsOverride parameter from http.ts session resolution | VERIFIED | http.ts line 399: handleTool(p.name, p.arguments, imsToken). All HLX cases call adminRequest with imsOverride. |

---

## Requirements Coverage

### Requirement IDs from Plans (original PKCE scope)

| Requirement | Source Plan | Description (as implemented) | Status | Evidence |
|-------------|------------|-------------------------------|--------|----------|
| AUTH-01 | 02-01, 02-02 | Unauthenticated POST /mcp returns 401 + login_url + WWW-Authenticate | SATISFIED (code) | http.ts 316-331. test-phase2.sh 3/3 PASS. |
| AUTH-02 | 02-01, 02-02 | GET /login?session=id initiates PKCE flow, 302 to IMS | SATISFIED (code) | http.ts 208-243. test-phase2.sh 2/2 PASS. |
| AUTH-03 | 02-02 | /callback exchanges code for IMS token, stores session | SATISFIED (code) / HUMAN NEEDED (runtime) | http.ts 245-302. Live IMS required for runtime. |
| AUTH-04 | 02-02 | Sessions stored in Map keyed by UUID, resolved by Bearer | SATISFIED (code) / HUMAN NEEDED (runtime) | sessions Map verified. resolveSessionToken verified. |
| AUTH-05 | 02-01, 02-02 | PUBLIC_URL replaces all localhost:3000 in http.ts | SATISFIED | Zero localhost:3000 in src/http.ts confirmed. |
| AUTH-06 | 02-02 | Redirect URI registered in Adobe Developer Console | HUMAN NEEDED | External action. Code ready. Registration unverifiable. |
| DA-05 | 02-01, 02-03 | da_login returns URL (not openBrowser) in httpMode | SATISFIED (code) / HUMAN NEEDED (runtime) | tools.ts 804-820. Runtime needs live session. |

### Requirement IDs from User Request (current REQUIREMENTS.md + ROADMAP)

| Requirement | REQUIREMENTS.md Definition | Phase Assignment | Status | Notes |
|-------------|---------------------------|------------------|--------|-------|
| AUTH-01 | HLX_ADMIN_TOKEN env var on Railway — IMS token for all admin.hlx.page calls | Phase 2 | NOT SATISFIED | Code uses HLX_API_KEY and HLX_AUTH_TOKEN, not HLX_ADMIN_TOKEN. Simplified single-token approach from updated ROADMAP not implemented. |
| AUTH-02 | Token refresh procedure documented for demo day | Phase 2 | NOT SATISFIED | No documentation of token refresh procedure found in repository. |
| HLX-01 | hlx_preview — triggers preview via admin.hlx.page | Phase 4 | IMPLEMENTED EARLY | Tool exists and is wired in tools.ts (line 1000). Assigned to Phase 4 in traceability table — exists but Phase 2 does not claim this requirement. |
| HLX-02 | hlx_publish — triggers publish via admin.hlx.page | Phase 4 | IMPLEMENTED EARLY | Tool exists (line 1016). Phase 4 requirement. |
| HLX-03 | hlx_unpublish — unpublishes a page | Phase 4 | IMPLEMENTED EARLY | Tool exists (line 1032). Phase 4 requirement. |
| HLX-04 | hlx_status — gets preview/publish/live status | Phase 4 | IMPLEMENTED EARLY | Tool exists (line 995). Phase 4 requirement. |
| HLX-05 | hlx_bulk_preview — bulk preview multiple paths | Phase 4 | IMPLEMENTED EARLY | Tool exists (line 1054). Phase 4 requirement. |
| HLX-06 | hlx_bulk_publish — bulk publish multiple paths | Phase 4 | IMPLEMENTED EARLY | Tool exists (line 1073). Phase 4 requirement. |
| HLX-07 | hlx_cache_purge — purges CDN cache | Phase 4 | IMPLEMENTED EARLY | Tool exists (line 1102). Phase 4 requirement. |
| HLX-08 | hlx_job_status — polls async bulk job status | Phase 4 | IMPLEMENTED EARLY | Tool exists (line 1092). Phase 4 requirement. |

### Orphaned Requirement IDs

AUTH-03, AUTH-04, AUTH-05, AUTH-06, and DA-05 appear in the REQUIREMENTS.md traceability table (marked "Complete") but have **no definition** in the requirements body. These requirement IDs were removed from the body when REQUIREMENTS.md was simplified but were not cleaned from the traceability table. They are orphaned.

Note: HLX-01 through HLX-08 are assigned to Phase 4 in REQUIREMENTS.md traceability, not Phase 2. The user's prompt asking to verify these against Phase 2 does not match the traceability table. The tools are implemented but Phase 2 does not formally claim them.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tools/hlx-admin-mcp/src/http.ts` | 484, 486 | `http://localhost:${activePort}` in stderr startup log only | Info | Startup log messages only — not OAuth URLs. No impact on deployed behavior. |
| `tools/hlx-admin-mcp/src/tools.ts` | 805 | `process.env.PUBLIC_URL ?? "http://localhost:3000"` fallback in httpMode branch | Info | DA-05 informational text only — not an OAuth redirect URI. AUTH-05 targeted http.ts specifically. Low impact. |
| `.planning/ROADMAP.md` | Phase 2 | Phase 2 goal contradicts executed implementation | Blocker | ROADMAP redefines Phase 2 after execution. Current Phase 2 success criteria cannot be passed by the existing codebase. This blocks Phase 3 (which depends on Phase 2). |
| `.planning/REQUIREMENTS.md` | Lines 28-31 | AUTH-01 and AUTH-02 defined as simplified token requirements but traceability table claims AUTH-01 through AUTH-06 and DA-05 are Complete | Warning | Traceability table and requirements body are inconsistent. Creates confusion about what Phase 2 actually delivered. |

---

## Human Verification Required

### 1. Full PKCE Roundtrip (AUTH-03 + AUTH-04)

**Test:** Start the server with `PORT=9999 ADOBE_IMS_CLIENT_ID=darkalley node dist/http.js`. Make an unauthenticated POST /mcp to get a 401 with a login_url. Open the login_url in a browser. Complete Adobe IMS login. After the /callback success page, POST /mcp with `Authorization: Bearer <session-uuid-shown-on-page>`.

**Expected:** HTTP 200 with `{"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}`. GET /health should show `sessions: 1`.

**Why human:** Requires live Adobe IMS authorization — cannot be synthesized.

### 2. Adobe Developer Console redirect URI registration (AUTH-06)

**Test:** Log into Adobe Developer Console. Navigate to the darkalley OAuth app settings. Verify that `https://mcp.aemxsc.com/callback` is listed as an allowed redirect URI.

**Expected:** URI is present. If not, add it and confirm live roundtrip succeeds without `redirect_uri_mismatch` error.

**Why human:** External administrative action. No code can register or verify this.

### 3. da_login httpMode runtime behavior (DA-05)

**Test:** After completing test 1 (live session established), POST /mcp with `Authorization: Bearer <session-uuid>` and body `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"da_login","arguments":{"org":"testorg","site":"testsite"}}}`.

**Expected:** Response text contains login URL pattern guidance. Response must NOT contain "Browser opened". No browser launches on the server machine.

**Why human:** The 401 guard intercepts unauthenticated requests before da_login is called. Only a live authenticated session can reach the tool handler.

---

## Gaps Summary

**Root cause: ROADMAP.md was updated after Phase 2 plans were executed**, creating a fundamental mismatch between what was built and what the ROADMAP now says Phase 2 should deliver. This is the primary gap.

**Secondary gaps:**
- REQUIREMENTS.md body was simplified to remove PKCE requirement definitions (AUTH-03 through AUTH-06, DA-05) but the traceability table still lists them as Complete. This is an inconsistency that misrepresents what requirements exist.
- The current AUTH-01 requirement (HLX_ADMIN_TOKEN env var) and AUTH-02 requirement (token refresh doc) from REQUIREMENTS.md are NOT implemented.
- HLX-01 through HLX-08 tools exist in code but are formally Phase 4 requirements — Phase 2 does not claim them.

**What needs to happen before Phase 3 can proceed:**

Option A (recommended if PKCE is still the intended approach): Revert ROADMAP.md Phase 2 goal to match what was executed. Update REQUIREMENTS.md to restore AUTH-01 through AUTH-06 and DA-05 definitions. Mark Phase 2 as complete.

Option B (if the simplified HLX_ADMIN_TOKEN approach is now intended): The Phase 2 work must be redone — remove /login, /callback routes, remove DA tools, rename HLX_API_KEY to HLX_ADMIN_TOKEN, create token refresh doc, and update requirements.

The three human-needed items (AUTH-03 live roundtrip, AUTH-06 DevConsole registration, DA-05 runtime) remain open regardless of which option is chosen, if PKCE is kept.

---

_Verified: 2026-03-20T00:00:00Z_
_Verifier: Claude (gsd-verifier)_

---
phase: 2
slug: auth-flow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bash smoke tests (test-phase1.sh pattern) |
| **Config file** | none — scripts live in `tools/hlx-admin-mcp/` |
| **Quick run command** | `bash tools/hlx-admin-mcp/test-phase2.sh` |
| **Full suite command** | `bash tools/hlx-admin-mcp/test-phase2.sh && bash tools/hlx-admin-mcp/test-phase1.sh` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bash tools/hlx-admin-mcp/test-phase2.sh`
- **After every plan wave:** Run `bash tools/hlx-admin-mcp/test-phase2.sh && bash tools/hlx-admin-mcp/test-phase1.sh`
- **Before `/gsd:verify-work`:** Full suite must be green + manual IMS flow verified
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 0 | AUTH-01, AUTH-02, AUTH-05, DA-05 | smoke | `bash tools/hlx-admin-mcp/test-phase2.sh` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | AUTH-01 | smoke | `bash tools/hlx-admin-mcp/test-phase2.sh` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 1 | AUTH-02 | smoke | `bash tools/hlx-admin-mcp/test-phase2.sh` | ❌ W0 | ⬜ pending |
| 2-02-03 | 02 | 1 | AUTH-03 | manual | Manual IMS roundtrip — check /health sessions count | n/a | ⬜ pending |
| 2-02-04 | 02 | 1 | AUTH-04 | manual | POST /mcp with injected Bearer token — verify 200 | n/a | ⬜ pending |
| 2-02-05 | 02 | 1 | AUTH-05 | static | `grep -r 'localhost:3000' tools/hlx-admin-mcp/src/` returns empty | ❌ W0 | ⬜ pending |
| 2-02-06 | 02 | 1 | AUTH-06 | manual | Adobe Developer Console — verify redirect URI registration | n/a | ⬜ pending |
| 2-03-01 | 03 | 1 | DA-05 | smoke | `bash tools/hlx-admin-mcp/test-phase2.sh` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tools/hlx-admin-mcp/test-phase2.sh` — smoke tests for AUTH-01, AUTH-02, AUTH-05, DA-05 (static grep + HTTP checks against running server on PORT=9999)

*AUTH-03 (live IMS callback), AUTH-04 (Bearer inject), AUTH-06 (Adobe Developer Console) are manual-only — documented above.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| /callback exchanges code for IMS token | AUTH-03 | Requires live Adobe IMS roundtrip with real client_id and registered redirect URI | 1. Start server locally, 2. Visit /login?session=test-uuid, 3. Complete IMS login, 4. Check /health response for sessions Map count > 0 |
| POST /mcp with valid Bearer returns 200 | AUTH-04 | Requires a real IMS token from AUTH-03 flow | After AUTH-03 manual test, use the session UUID as Bearer: `curl -H "Authorization: Bearer <session-uuid>" -X POST localhost:9999/mcp ...` |
| Redirect URI registered in Adobe Developer Console | AUTH-06 | External to codebase; requires Adobe DevConsole access | Verify `https://mcp.aemxsc.com/callback` is listed under the darkalley client's redirect URIs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

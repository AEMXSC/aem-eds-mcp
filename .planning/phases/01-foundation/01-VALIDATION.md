---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual + curl (no test framework needed for structural changes) |
| **Config file** | none |
| **Quick run command** | `cd tools/hlx-admin-mcp && npm run build && node dist/http.js` |
| **Full suite command** | `PORT=3000 node dist/http.js & sleep 1 && curl -s http://localhost:3000/health` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build` (compile check)
- **After every plan wave:** Run full suite (start server + health check)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 1-01-01 | 01 | 1 | HOST-02 | compile | `npm run build` | ⬜ pending |
| 1-01-02 | 01 | 1 | HOST-03 | compile | `npm run build` | ⬜ pending |
| 1-01-03 | 01 | 1 | HOST-04 | curl | `curl -s http://localhost:3000/health` | ⬜ pending |
| 1-02-01 | 02 | 1 | HOST-05 | file | `test -f tools/hlx-admin-mcp/railway.toml` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — no test framework install needed. Phase 1 changes are structural (remove code, fix bindings) verified by TypeScript compile + manual curl.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Server binds to 0.0.0.0 not 127.0.0.1 | HOST-02 | Requires network interface check | `PORT=3001 node dist/http.js &` then `curl http://127.0.0.1:3001/health` — should succeed |
| No dual server on :3443 | HOST-03 | Requires verifying port NOT in use | After start, `netstat -an | grep 3443` — should show nothing |
| railway.toml valid syntax | HOST-05 | No Railway CLI locally | Visual review of toml syntax |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

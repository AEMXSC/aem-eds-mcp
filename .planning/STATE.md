# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-14)

**Core value:** Any team member or customer can start authoring AEM EDS content with Claude in under 5 minutes — just add one URL to their MCP config and click a login link.
**Current focus:** Phase 1 — Foundation

## Current Position

Phase: 1 of 4 (Foundation)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-03-14 — Roadmap created, ready to begin Phase 1 planning

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: none yet
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Setup: Railway for hosting — persistent Node.js process required for in-memory session Map (serverless incompatible)
- Setup: In-memory Map for sessions — simplest path to March 24; Redis is v2
- Setup: Single Express app on one port — dual-server architecture must be collapsed before Railway deploy

### Pending Todos

None yet.

### Blockers/Concerns

- **CRITICAL EXTERNAL DEPENDENCY**: `darkalley` OAuth client redirect URI `https://mcp.aemxsc.com/callback` must be added to Adobe Developer Console by someone with console access. Requires 2-5 days. Must be initiated on day 1. This is the only gap that can slip March 24.
- **MEDIUM RISK**: `offline_access` scope behavior with `darkalley` client is unverified — if refresh tokens are unavailable, session expiry message must be made explicit. Test early in Phase 2.
- **DEMO RISK**: Railway redeploys wipe in-memory sessions and Claude Code does not auto-recover. Mitigation: freeze Railway deployment 24h before March 24, brief all participants on `/mcp` reconnect command.

## Session Continuity

Last session: 2026-03-14
Stopped at: Roadmap created — ROADMAP.md, STATE.md written; REQUIREMENTS.md traceability updated
Resume file: None

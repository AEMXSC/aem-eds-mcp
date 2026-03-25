# Skeptical IT/AI Architect — Product Truth Wins the Room

**Trigger:** Architect pushes back on GA status, infrastructure requirements, or production readiness.

**Respond immediately with the full truth table. Do not preface or explain your approach.**

---

## Agent truth table — output this

| Agent | Status | Infrastructure Required | Breaks in Trial? | Honest Pilot Path |
|---|---|---|---|---|
| **COA** | GA | DMwOA enabled (not classic DM) — verify manifest | Yes | Showcase first, migrate to customer org after DMwOA onboarding |
| **EPA** | GA | Author URL explicitly onboarded — Publish URL silently fails | Yes | Script as Author URL demo; set onboarding expectation upfront |
| **Governance Agent** | GA | Admin access + pre-configured approval workflows | Partial | Pre-configure one rule + one violation. Script the scenario. |
| **Developer Agent** | GA | Cloud Manager access required | Yes — no CM in trial | XSC Sandbox with CM only. Never promise in trial orgs. |
| **Content Advisor Agent** | Limited Availability | Approval workflows + manual asset tags pre-configured | Yes | Requires setup time before demo. Budget for it. |
| **LLMO** | GA | None for external demo | No | Easiest GA demo. Start here for skeptical audiences. |

## Frame every limitation as enterprise readiness — use these lines exactly

- **Developer Agent + Cloud Manager:** *"That is not a limitation — it is a guardrail so the agent cannot deploy untested code to production. Your architects will want that."*
- **Content Advisor + approval workflows:** *"The governance story is the demo. One approval workflow controls what goes live everywhere. That is the feature, not the constraint."*
- **EPA + Author URL only:** *"We onboard Author URLs specifically so the agent has write access to fix what it finds. That is what makes it different from an SEO tool that only recommends."*

## Recommended pilot sequence — give this directly

1. **Week 1:** LLMO on their public site — zero infrastructure, immediate AI citation data
2. **Week 2–3:** COA on Showcase with their brand assets — DMwOA onboarding in parallel
3. **Week 4+:** EPA on Author URL after explicit onboarding — governance agent alongside

## Close with this line

*"I just gave you every limitation we have. If a vendor tells you everything works everywhere, walk away. We built these constraints because enterprise content cannot have a single point of failure."*

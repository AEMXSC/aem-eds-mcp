# AEM XSC Super Soldier Skill Pack

> The most experienced AEM XSC on your team — available at 11pm before a CMO call.
> Works in Claude Code, Cursor, Windsurf, and GitHub Copilot.

XSCs do two things: **advise** and **build**. This skill does both.

---

## What It Does

**As an advisor** — reads your deal signals, resets the narrative to the current play, flags environment traps, gives discovery questions, scripts the executive arc, and hands you objection responses. In seconds, for any XSC regardless of tenure.

**As a builder** — executes. With the 17 EDS dev skills loaded: imports customer pages, builds custom blocks, wires DA + Universal Editor, validates PageSpeed 100. With MCP tools connected: pushes content, triggers preview and publish without opening a browser.

---

## How It's Grounded

Every scenario covers all six dimensions of the XSC role:

| Dimension | In practice |
|---|---|
| **Intent** | What the customer is actually trying to solve |
| **Discovery** | The questions that surface pain before you show a screen |
| **Advisory** | Narrative, competitive angle, objection responses |
| **Key Tech Concepts** | What the XSC needs to know to demo credibly |
| **Development** | What gets built — repos, blocks, imports, content |
| **AI** | Where AI augments: code generation, site analysis, content push via MCP |

---

## Use Cases

| # | Scenario | Type | One Line | Time Savings |
|---|---|---|---|---|
| [1](use-cases/01-healthcare-poc.md) | Build a Custom Healthcare POC | **BUILD** | Scans all adobe orgs, builds branded DA+UE site overnight | 2–3 dev days → 4–6 hrs |
| [2](use-cases/02-exmod-migration.md) | ExMod Migration — Sitecore 4,000 Pages | **BUILD** | Site analyzed, 5 pages live as EDS proof point | Months → 2–3 hrs |
| [3](use-cases/03-skeptical-architect.md) | Skeptical IT/AI Architect | Advisory | Product truth table wins the room | — |
| [4](use-cases/04-omni-channel-graphql.md) | Omni-Channel Content Fragments + GraphQL | **BUILD** | CF model, queries, 3-channel demo with live GraphQL | 3–5 dev days → 1–2 hrs |
| [5](use-cases/05-competitive-rfp.md) | Competitive RFP — Three-Way Bake-Off | Advisory | Full 60-min strategy vs Sitecore + Contentful | — |
| [6](use-cases/06-llmo-ai-search.md) | LLMO — AI Search Traffic Loss | Advisory | GEO from zero to scripted demo in 20 min | — |
| [7](use-cases/07-pre-demo-crisis.md) | Pre-Demo Crisis: 30 Min to Call | Advisory | Troubleshoot + fallback before the call | — |
| [8](use-cases/08-mcp-content-push.md) | Personalize Demo Site via MCP | **BUILD** | All pages updated and published — no browser | 1 hr manual → 5 min |
| [9](use-cases/09-csc-deal.md) | CSC Deal — The Expert Advisor | Advisory | Deal-signal reading, GenStudio narrative, CMO arc | — |
| [10](use-cases/10-gartner-mq.md) | Gartner MQ — "Optimizely Is #1" | Advisory | Data-backed counter + 2027 pivot | — |

---

## Install

### SuperSkill — Claude Code, Cursor, Windsurf, Copilot

One command. Installs everything: SuperSkills + 17 EDS skills + GSD parallel execution + MCP servers + AEM CLI + Playwright.

```bash
bash <(curl -s https://raw.githubusercontent.com/AEMXSC/SuperSkills/main/setup.sh)
```

Works in any agent with terminal access and MCP support.

| Tool | Purpose |
|---|---|
| SuperSkills | This skill — advisor + builder |
| 17 AEM EDS skills | Block dev, import pipeline, testing, PageSpeed |
| GSD | Parallel wave execution — 4–8x faster builds |
| AEM CLI (`aem up`) | Local dev server for block testing |
| Playwright + Chromium | Visual validation before demo calls |
| DA MCP | Write + preview + publish DA content programmatically |
| hlx-admin MCP | `da_write` — write + CDN bust in one call |
| n8n MCP | 525+ workflow automation nodes |
| helix-mcp | Bulk preview/publish via admin API — faster than individual da_write calls |

**Manual steps after setup (printed by the script):**

1. **Claude.ai MCP connectors** — connect at claude.ai → Settings → Integrations:
   - `AEM Content - Prod`
   - `AEM DA - Prod`

2. **GitHub auth** — `gh auth login`

3. **aem-code-sync GitHub App** — install on your GitHub org:
   `https://github.com/apps/aem-code-sync`

4. **DA org** — confirm your org exists at `https://da.live`

5. **hlx-admin local server** — run in a separate terminal before any BUILD:
   `npx @adobe/hlx-admin-mcp`

6. **Adobe internal only** — FluffyJaws MCP: ask your team lead for setup

**Verify your setup is working:**
```bash
claude mcp list          # should show da-mcp, hlx-admin, n8n-mcp
aem --version            # should print AEM CLI version
aem up                   # should start local dev server on :3000
npx playwright --version # should print Playwright version
```

---

## File Structure

```
SuperSkills/
├── README.md                  ← This file — index and install guide
├── SKILL.md                   ← Master orchestrator — load this to activate
├── setup.sh                   ← One-shot full stack install (SuperSkills + 17 EDS skills + GSD + MCPs)
├── yolo-preflight.sh          ← Run before any overnight build — catches blockers before you sleep
├── demo-plays.md              ← Full scripts + exact AI prompts for all 10 plays
├── environment-matrix.md      ← What works where, pre-demo checklist, 9 failure modes
├── tech-depth.md              ← Repos, boilerplates, MCP tools, 17 EDS dev skills
├── competitive-intel.md       ← Competitive breakdowns, Gartner MQ, 20+ stats
└── use-cases/                 ← Full scenario details, prompts, and build steps
    ├── 01-healthcare-poc.md
    ├── 02-exmod-migration.md
    ├── 03-skeptical-architect.md
    ├── 04-omni-channel-graphql.md
    ├── 05-competitive-rfp.md
    ├── 06-llmo-ai-search.md
    ├── 07-pre-demo-crisis.md
    ├── 08-mcp-content-push.md
    ├── 09-csc-deal.md
    └── 10-gartner-mq.md
```

---

## Agent Support

| Agent | Activation |
|---|---|
| **Claude Code** | `npx skills add https://github.com/AEMXSC/SuperSkills` or `setup.sh` |
| **Cursor** | Run `setup.sh` — `.cursor/rules` activates automatically |
| **Windsurf** | Run `setup.sh` — `.windsurfrules` activates automatically |
| **GitHub Copilot** | Run `setup.sh` — `.github/copilot-instructions.md` activates automatically |

---

## How to Update

| Add... | Edit this file |
|---|---|
| New demo script or AI prompt | `demo-plays.md` |
| Environment constraint | `environment-matrix.md` |
| New repo or build pattern | `tech-depth.md` |
| Competitive fact or stat | `competitive-intel.md` |
| New routing entry | `SKILL.md` — Intent Detection table |
| New or updated use case | `use-cases/` — add or edit the relevant file |

**Contributing:** Branch → edit → mark outdated content with `LEGACY:` → PR with one line description.

---

## Current Status

| File | Last Verified |
|---|---|
| All skill files | Mar 2026 |
| Use cases | Mar 2026 |

# AEM XSC Technical Depth Reference

Full technical knowledge for building, configuring, and automating AEM EDS demo environments. The "how to build it" counterpart to demo-plays.md (the "how to sell it").

---

## Repo Inventory

### Which Boilerplate to Use

```
New XSC demo — need both DA + UE?      → aemdemos/ise-boilerplate (the standard)
ExMod Agent + UE in-context editing?   → aem-block-collection-xwalk (required for ExMod AEM Authoring)
Quick XSC "door opener" demo?           → AdobeDevXSC/dev-xsc-boilerplate
Need experimentation pre-wired?         → adobe/aem-experimentation-boilerplate
EDS + Universal Editor (UE/XWalk)?      → adobe-rnd/aem-boilerplate-xwalk
EDS + AEM Forms?                        → adobe-rnd/aem-boilerplate-forms
EDS + Adobe Commerce?                   → adobe-rnd/aem-boilerplate-xcom
DA-only (legacy)?                       → aemsites/author-kit
Vertical demo already built?            → Check AdobeDevXSC or aemdemos/summit-* (see below)
```

### Primary Baselines

| Repo | Purpose | Use When |
|---|---|---|
| `aemdemos/ise-boilerplate` | **Standard for ALL new projects.** DA + UE dual authoring, design tokens, agents support, AGENTS.md built in | Any new demo site or POC |
| `aem-block-collection-xwalk` | **#2 baseline — ExMod AEM Authoring.** Required template for Experience Modernization Agent UE in-context editing flow; pairs with AEM Code Connector GitHub app | ExMod demos, migration projects needing WYSIWYG UE editing in AEM Cloud Service |
| `AdobeDevXSC/dev-xsc-boilerplate` | "Door Opener Boilerplate" — XSC team's own EDS starter, pre-wired with experimentation + sidekick tools | Quick discovery-stage demos; fastest to first preview |
| `adobe/aem-experimentation-boilerplate` | Pre-wired A/B experimentation + sidekick UI rail | Any demo where experimentation is a story |
| `adobe-rnd/aem-boilerplate-xwalk` | UE/XWalk template — requires AEM Cloud Service 2024.8+ | When customer wants WYSIWYG in-context editing |
| `adobe-rnd/aem-boilerplate-forms` | AEM Forms + EDS pre-configured | Forms + EDS story (lead capture, signup) |
| `adobe-rnd/aem-boilerplate-xcom` | EDS + Adobe Commerce (XWalk variant) | Commerce + UE combined story |
| `aemsites/author-kit` | Production-grade EDS: localization, themes, Cloudflare Worker, scheduled content, design tokens | Most feature-complete foundation for complex demos |
| `scdemos/demo` | Clean minimal SC demo starter with experimentation plugin | SC (non-XSC) demo starting point |

### AEMXSC Org — XSC Reference Framework

`https://github.com/AEMXSC` — XSC-specific presales frameworks and POC templates.

| Repo | Purpose |
|---|---|
| `AEMXSC/RefDemoEDS` | **Master XSC reference demo** — dynamic media, content blocks, mobile headless, style system, rapid site creation |
| `AEMXSC/RefDemoEDS-Prod` | Production-stable version for customer-ready demos |
| `AEMXSC/RefDemoEDS-Dev` | Bleeding-edge features for XSC experiments |
| `AEMXSC/RefDemo-DA` | DA-first version of the reference demo (v2.0) |
| `AEMXSC/XSCTeamSite` | The XSC team's own live EDS site (964 commits) — inspect for mature block patterns |
| `AEMXSC/aem-eds-mcp` | **MCP server for AEM EDS** — DA content authoring + HLX admin via Claude/Cursor/VS Code |
| `AEMXSC/KnowledgeHub` | XSC knowledge base and internal resource catalog |

### AEMXSC POC Templates (Vertical-Specific with AI Wiring)

These POC repos come pre-configured with `CLAUDE.md` and `AGENTS.md` for AI-assisted development:

| Repo | Vertical | Notes |
|---|---|---|
| `AEMXSC/poc-cr-nationwide` | Insurance | DA.live, AI content gen, GraphQL, Assets, CLAUDE.md + AGENTS.md |
| `AEMXSC/poc-cr-owens-corning` | Manufacturing | Manufacturing vertical POC |
| `AEMXSC/poc-cr-nationwide-mutual` | FSI / Banking | Banking and insurance POC |

### AdobeDevXSC Org — The Demo Factory

`https://github.com/AdobeDevXSC` — 122 repos. Your vertical demo library.

> ⚠ **Always verify last commit date before using in a demo.** Some repos are from past events and may be stale. Check the README for live preview URLs.

**Current Default XSC Demo: RefDemo**

The XSC team's current standard demo — built on ise-boilerplate with DA + UE dual authoring baked in:

| URL | Repo | Notes |
|---|---|---|
| `https://main--refdemo--adobe-demopoc.aem.live/` | `adobe-demopoc/refdemo` | **Default demo for all XSC conversations.** Instructions live at the URL. |

> ⚠ **CitiSignal is LEGACY (AdobeDevXSC/citisignal-*)** — no longer the primary XSC demo brand. These repos (citisignal-one, da-citisignal, citisignal-xwalk, citisignal-designs) may still work as a Commerce+EDS reference but are not maintained as the flagship demo. Use `adobe-demopoc/refdemo` instead.

**Named Demo Sites (AdobeDevXSC org)**

| Repo | Brand | Best For |
|---|---|---|
| `ensemble` | Ensemble.com | EDS speed story — Velocity Demo |
| `ensemble-xwalk` | Ensemble.com | **Best XWalk/UE authoring demo** |
| `wknd-refdemo` | WKND | WKND-branded ref demo |
| `holland-america` | Holland America | Travel vertical |
| `amazon-alexa` | Amazon Alexa | XWalk/CrossWalk demo |
| `dev-agent-demo` | Generic | Developer Agent deep-dive |
| `showcase` | Generic | General EDS showcase |
| `da-signet-jewelers` | Signet Jewelers | Retail/jewelry, DA path |
| `corning` | Corning Optical | B2B/manufacturing |

**Vertical Demos by Industry**

| Industry | Repos |
|---|---|
| **Automotive** | `general-motors` |
| **Retail/Sports** | `da-nike-commerce`, `harbor-freight-tools`, `canadiantire`, `da-basspro` |
| **Luxury/Apparel** | `ralph-lauren-corporate`, `michael-kors`, `ann-taylor`, `johnny-was` |
| **Consumer Electronics** | `logitech`, `lenovo`, `bose`, `canon` |
| **Travel** | `united-airlines`, `air-canada`, `holland-america` |
| **Insurance/FSI** | `geico-lab`, `usaa`, `usbank`, `usbank-xwalk`, `lincoln-financial` |
| **Healthcare** | `blue-shield-ca`, `hillrom-baxter`, `baxter`, `stryker`, `stryker-da` |
| **Dental/Med Devices** | `dentsply-sirona`, `dentsply-maillefer` |
| **Manufacturing** | `pentair`, `coleman`, `sharpie` |
| **B2B/Analyst** | `gartner`, `pure-storage` |
| **Media/Telco** | `paramount`, `nbc`, `tds-telecom`, `vonage` |

**Integration & GenStudio Demos**

| Repo | What It Shows |
|---|---|
| `email-ajo-integration` | AEM + Adobe Journey Optimizer — email authoring in AEM, publish to AJO |
| `altura-tech-genstudio` | GenStudio content supply chain integration |
| `GSPeM-starter-templates` | GenStudio Performance Marketing — email, display ads, meta ad templates |
| `GSPeM-Templates` | More GenStudio Performance Marketing templates |
| `wf-firefly-extension` | Workfront + Firefly extension |
| `cfpreview` | App Builder + Content Fragments → headless display |
| `AEM-asset-selector-demo` | AEM Asset Selector embedded in web apps |
| `create-audience-variations` | AI audience content variation creation |

### aemdemos Org — Summit Lab Series (607 repos)

`https://github.com/aemdemos` — The structured summit lab environments. Each named after a major enterprise brand, built on ise-boilerplate with industry content:

| Repo | Brand |
|---|---|
| `summit-dsg` | Dick's Sporting Goods |
| `summit-wmt` | Walmart |
| `summit-vzn` | Verizon |
| `summit-bby` | Best Buy |
| `summit-avv`, `summit-nrg`, `summit-usb`, `summit-trt` | Various enterprises |

**Use:** These are structured walk-through environments built for Summit labs — great reference for seeing how ise-boilerplate is applied to real enterprise scenarios.

### Community/Partner Demos Worth Knowing

| Repo | What It Shows |
|---|---|
| `markszulc/securbank-aem-ue` | FSI vertical (SecurBankDemo.com) — EDS + UE + GraphQL. Best banking/insurance UE demo. |

### Core adobe/* and adobe-rnd/* Repos

| Repo | What It Is | XSC Value |
|---|---|---|
| `adobe/aem-boilerplate` | Canonical EDS boilerplate (853 commits, 617 forks) | Foundation all demos build on |
| `adobe/aem-lib` | Core EDS runtime library (v3.0.1, March 2026) | Explains "no bundler" architecture to technical prospects |
| `adobe/aem-sidekick` | Browser extension (176 releases, actively maintained) | Most visible author tool — essential to authoring demos |
| `adobe/aem-block-collection` | Canonical block reference library | "What blocks come out of the box?" — this is the answer |
| `adobe/da-live` | DA editor source (Lit + YDoc, collaborative editing) | Shows DA is open-source and actively maintained |
| `adobe/aem-experimentation` | A/B testing plugin — privacy-first, integrates with Analytics/Target/AJO/GA | No-code experimentation story |
| `adobe/aem-github-copilot` | VS Code extension — AI-assisted EDS block creation | The "AI dev workflow" demo — generate a block from a screenshot |
| `adobe-rnd/aem-assets-plugin` | AEM Assets + DMwOA bridge for EDS | AEM Assets + EDS integration without rebuilding frontend |

### ise-boilerplate Key Features (always use this)

```
ise-boilerplate/
├── scripts/
│   ├── aem.js                  # Core EDS pipeline — NEVER MODIFY
│   ├── scripts.js              # Page init, DA preview, UE loader (moveAttributes, moveInstrumentation, getBlockId)
│   ├── editor-support.js       # UE instrumentation support
│   ├── editor-support-rte.js   # RTE support for UE
│   ├── context.js              # Inline content editing for text elements
│   └── dompurify.min.js        # XSS protection
├── ue/
│   ├── scripts/
│   │   ├── ue.js               # UE initialization + block behavior management
│   │   └── ue-utils.js         # UE attribute utilities
│   └── models/
│       ├── page.json           # Page metadata model
│       └── blocks/             # Per-block UE model files
├── blocks/                     # One folder per block: block.js + block.css
├── component-definition.json   # UE component registry (root)
├── component-filters.json      # UE component filters (root)
├── component-models.json       # UE consolidated models (root)
├── fstab.yaml                  # DA mountpoint → content.da.live/<org>/<repo>/
├── .migration/project.json     # DA project config (type: "da")
└── AGENTS.md                   # Hard constraints — Claude reads this on project load
```

---

## Helix Version Guardrail

> ⚠ **Helix 4 reached End of Life on December 18, 2025.** Any customer still on Helix 4 needs to migrate. Current version is Helix 5 (repoless, no fstab.yaml required in new setup). If you encounter a customer on Helix 4, this is a migration conversation — not a support conversation.

---

## AI-Assisted EDS Development

Adobe officially documents AI agent development for EDS at: `https://www.aem.live/developer/ai-coding-agents`

### Key Patterns for AI-Assisted Demos

| Tool | Command | What It Does |
|---|---|---|
| `adobe/aem-github-copilot` VS Code ext | `Create` | Generate a block from a natural language prompt |
| `adobe/aem-github-copilot` VS Code ext | `Vision` (Insiders) | Generate a block from a **screenshot** — show this live |
| `adobe/aem-github-copilot` VS Code ext | `Collection` | Pull standard blocks from the Block Collection |
| `adobe/aem-github-copilot` VS Code ext | `Docs` | Search aem.live docs from VS Code |
| `adobe/aem-github-copilot` VS Code ext | `Issues` | AI resolution suggestions for code issues |
| `adobe/aem-github-copilot` VS Code ext | `Annotate` | Apply EDS best practices to existing code |
| ExMod at `aemcoder.adobe.io` | Analyze + Import | Migrate any website to EDS — outputs GitHub PRs |

### Project Context Injection for AI Tools

- **`CLAUDE.md`** — Project instructions for Claude Code. Claude reads this automatically on project load.
- **`AGENTS.md`** — Same content, for Codex/OpenAI agents. Many XSC repos now ship both.
- AEMXSC POC repos (`poc-cr-nationwide`, `poc-cr-owens-corning`, `poc-cr-nationwide-mutual`) are pre-configured with both files.

### MCP Integrations for EDS Dev
- `AEMXSC/aem-eds-mcp` — Claude/Cursor → EDS: write content, preview, publish via MCP
- **Context7** MCP — pulls live aem.live documentation into the AI context window
- **Helix MCP** — HLX admin operations
- **Browser MCP** — visual validation via Playwright (used in testing-blocks workflow)

### ExMod at aemcoder.adobe.io — The 2026 "Wow" Demo

Experience Modernization Agent lives at `https://aemcoder.adobe.io`. It:
- Analyzes any existing site (legacy AEM, any CMS, Figma)
- Maps block patterns and extracts design systems
- Generates CSS/JS as **reviewable GitHub PRs** (not just suggestions — actual code)
- Demonstrated at Adobe Developers Live November 2025

**Use in demos:** Paste a prospect's URL. Watch the agent analyze it. Show the PRs. Say: "This is what would have taken your team 6 months to spec and build."

---

## EDS Dev Skills Bridge

All 17 AEM EDS skills mapped to XSC use cases. An XSC building or validating a custom demo should route through these skills.

### When to invoke which skill

| XSC Need | Skill to Invoke | Notes |
|---|---|---|
| Set up a new custom demo environment | `aem-eds` (Project Setup section) | Handles ise-boilerplate setup, GitHub apps, fstab.yaml, project.json |
| Plan what to build before touching code | `/analyze-and-plan` | Outputs requirements + acceptance criteria for a block or page |
| Design how authors will create content | `/content-modeling` | Block table structure, DA-friendly content model |
| Build a block (JS + CSS) | `/building-blocks` | EDS block pattern, CDD workflow, DOM-based implementation |
| Run a complete block dev cycle | `/content-driven-development` | Orchestrates: analyze-and-plan → content-modeling → building-blocks → testing-blocks → code-review |
| Validate with Playwright before the demo call | `/testing-blocks` | Browser testing, linting, accessibility checks |
| Self-review before showing a customer | `/code-review` | Code quality, security, performance, EDS conventions |
| Audit PageSpeed before the demo | `/pagespeed-audit` | Must score 100. Diagnoses LCP, CLS, INP issues. |
| Find out what blocks already exist | `/block-inventory` | Surveys the project's blocks folder AND the AEM Block Collection |
| Search the reference block library | `/block-collection-and-party` | Adobe's curated block implementations with source links |
| Import a customer URL for a live migration demo | `/page-import` | Orchestrates the full import pipeline |
| Scrape and analyze a customer page | `/scrape-webpage` | Fetches HTML, downloads images, cleans markup |
| Identify sections in a scraped page | `/identify-page-structure` | Determines section boundaries and block candidates |
| Map a page's content to EDS blocks | `/page-decomposition` | Analyzes content sequences within sections |
| Decide DA vs block structure for imported content | `/authoring-analysis` | Determines default content vs blocks for each section |
| Generate structured HTML for import | `/generate-import-html` | Outputs EDS-ready block HTML from analyzed page |
| Verify imported page looks right | `/preview-import` | Validates import in local dev server; checks fidelity |
| Look up aem.live documentation | `/docs-search` | Searches AEM EDS docs index; faster than browser search |
| Find an existing test page in the project | `/find-test-content` | Locates content pages suitable for testing a specific block |
| Design system extraction from existing site | `/design-system-extractor` then `/design-tokens` | Extract CSS tokens from an existing site before migration |
| Audit/improve site performance | `/pagespeed-audit` | Core Web Vitals audit — LCP, CLS, INP |

### GSD Parallel Wave Execution — The Speed Multiplier

The single biggest speed gain available to an XSC is running block builds in parallel instead of sequentially. GSD (`/gsd:execute-phase`) spawns independent subagents per wave — each block builds simultaneously in its own 200k context window.

**Sequential build (current default):** 9 blocks × ~35 min each = ~5 hours
**GSD parallel waves:** 3 waves × longest-block time = ~45–60 minutes

**How to use it for a BUILD:**

Before coding anything, create a phase plan and execute it with GSD:

```
/gsd:plan-phase 1    → generates PLAN.md with wave structure
/gsd:execute-phase 1 → spawns parallel agents, one per block per wave
```

**Wave structure for a typical 10-block site port:**

```
Wave 0 (parallel) — Scrape + Inventory
  ├── Playwright render + full DOM capture
  └── /block-inventory + /block-collection-and-party

Wave 1 (parallel) — Plan all blocks simultaneously
  ├── /analyze-and-plan → hero
  ├── /analyze-and-plan → nav + footer
  ├── /analyze-and-plan → cards variants (3 blocks)
  └── /analyze-and-plan → custom blocks (ticker, motions, stats)

Wave 2 (parallel) — Build all blocks simultaneously
  ├── /building-blocks → hero (JS + CSS + UE model)
  ├── /building-blocks → nav + footer
  ├── /building-blocks → cards variants
  └── /building-blocks → ticker + motions + stats bar

Wave 3 (parallel) — Validate everything simultaneously
  ├── /code-review → all blocks
  ├── /testing-blocks → Playwright screenshots
  └── /pagespeed-audit → Lighthouse 100
```

**Rule:** Tasks within the same wave have no dependencies on each other. Tasks across waves do. GSD enforces this automatically.

**Install GSD:** `npx get-shit-done-cc@latest --claude --local`

---

### BUILD Playbooks — Complete Skill Chains

The 17 EDS skills work as a system. Running them in the right sequence is where the XSC multiplier comes from. Never invoke a skill in isolation — always use the full chain for your scenario.

**Rule #1 — Inventory before build.** Always run `/block-inventory` + `/block-collection-and-party` before touching `/building-blocks`. Never build a block that already exists.

**Rule #2 — Validate before demo.** Every BUILD ends with Playwright screenshots (Bash, not MCP) + `/pagespeed-audit` at 100. No exceptions.

**Rule #3 — Use GSD for any build with 3+ blocks.** Sequential builds are 4–8x slower than parallel wave execution. Always use `/gsd:plan-phase` + `/gsd:execute-phase` for multi-block sites.

#### Playbook A — Greenfield Custom Demo Site

```
1. /block-inventory               ← what blocks already exist in this org + Block Collection?
2. /block-collection-and-party    ← any reference implementations for the vertical?
   → reuse everything you can. skip to step 6 for blocks that already exist.
3. /analyze-and-plan              ← define blocks needed, acceptance criteria
4. /content-modeling              ← DA table structure for each block
5. /building-blocks               ← build only what doesn't already exist
6. /find-test-content             ← locate pages to test against
7. /code-review                   ← self-review before pushing
8. /testing-blocks                ← Playwright via Bash: 375/768/1280px screenshots
9. /pagespeed-audit               ← must score 100. diagnose LCP/CLS/INP if not.
```

**Orchestrator shortcut:** `/content-driven-development` runs steps 3–7 automatically. Still run steps 1–2 manually first and steps 8–9 after.

#### Playbook B — Migration / ExMod Demo

```
1. /scrape-webpage                ← fetch + clean HTML, download images
2. /identify-page-structure       ← section boundaries across scraped pages
3. /page-decomposition            ← content sequences → named block candidates
4. /authoring-analysis            ← DA vs UE recommendation per section
5. /block-inventory               ← do identified block patterns already exist?
6. /block-collection-and-party    ← find reference implementations for gaps
7. /generate-import-html          ← EDS-ready block HTML for each page
8. /building-blocks               ← build only blocks with no existing match
9. /docs-search                   ← look up EDS patterns if stuck
10. /preview-import               ← validate first page live before demo
11. /code-review                  ← review generated blocks before showing customer
12. /testing-blocks               ← Playwright via Bash: screenshot all imported pages
13. /pagespeed-audit              ← score 100 on all imported pages
```

**Orchestrator shortcut:** `/page-import` runs steps 1–4 + 7 + 10 automatically. Run steps 5–6 between 4 and 7, and steps 11–13 after.

#### Playbook C — Content Personalization (MCP)

```
1. da_login / da_whoami           ← verify auth before writing anything
2. da_get_source                  ← read current page to preserve structure
3. da_write                       ← update content → CDN preview triggered → published
   (repeat per page)
4. /find-test-content             ← locate the right test pages if needed
5. Playwright via Bash            ← screenshot live CDN pages to confirm changes rendered
   node validate-demo.js → delete after
```

---

### Content Driven Development (CDD) — Full Workflow

All code changes on EDS follow this process — no exceptions:

```
/content-driven-development (orchestrator)
  └── /analyze-and-plan          ← requirements + acceptance criteria
  └── /content-modeling          ← block table structure for authors
  └── /building-blocks           ← implement JS + CSS
  └── /testing-blocks            ← Playwright via Bash (not MCP)
  └── /code-review               ← self-review before PR / before demo call
```

### Import / Migration Workflow

```
/page-import (orchestrator)
  └── /scrape-webpage            ← fetch + clean HTML, download images
  └── /identify-page-structure   ← section boundaries
  └── /page-decomposition        ← content sequences within sections
  └── /authoring-analysis        ← default content vs blocks
  └── /generate-import-html      ← structured HTML output
  └── /preview-import            ← validate in local dev server
```

---

## Dual Authoring Setup

Every new project ships with DA + Universal Editor support. Required files (all from ise-boilerplate):

### Scripts Required
```
scripts/editor-support.js         # UE instrumentation
scripts/editor-support-rte.js     # RTE block support
scripts/context.js                # Inline text element editing
scripts/dompurify.min.js          # XSS protection
ue/scripts/ue.js                  # UE init + block behavior management
ue/scripts/ue-utils.js            # UE attribute helpers
```

### Content Model Files Required
```
component-definition.json         # UE component registry (root of repo)
component-filters.json            # UE component filters (root of repo)
component-models.json             # Consolidated models (root of repo)
ue/models/page.json               # Page metadata model
ue/models/blocks/<block>.json     # One file per block (definitions + models + filters)
```

### Per-Block UE Model Structure (`ue/models/blocks/<name>.json`)
```json
{
  "definitions": [{ "title": "Block Name", "id": "block-name", ... }],
  "models": [{ "id": "block-name", "fields": [...] }],
  "filters": [{ "id": "block-name", "components": [...] }]
}
```

### fstab.yaml (DA mountpoint)
```yaml
mountpoints:
  /: https://content.da.live/<org>/<repo>/
```

### project.json (DA type — no sourceUrl, no projectType: xwalk)
```json
{
  "type": "da",
  "contentHostUrl": "https://content.da.live/<org>/<repo>/",
  "libraryUrl": "https://main--<repo>--<org>.aem.page/tools/sidekick/library.json",
  "boilerplate": "<boilerplate-name>"
}
```
**Common mistakes:** Do NOT add `"projectType": "xwalk"` — breaks aemcoder preview. Do NOT add `"sourceUrl"`.

---

## GitHub Apps Required

Install on the **org** (not just the user account) for AEMXSC repos:

| App | Purpose | Install Scope |
|---|---|---|
| `aem-code-sync` | Publishes code to CDN, purges cache on push | Selected repos — must add each repo manually |
| `AEM Code Connector` | aemcoder.adobe.io push access, preview rendering | Must install on org, not just personal account |

**AEM Preview URL format:** `https://main--<repo>--<org>.aem.page/`

---

## MCP Tools

### hlx-admin-mcp

**Value:** Closes the DA MCP write+preview gap. `da_write` does write → preview → publish in one call. Without this, content written to DA doesn't appear on the live `.aem.page` URL until someone manually triggers preview.

**Config:** Stdio MCP server. Token cached at `~/.hlx-admin-mcp/hlx-site-token.json`

**Authentication flow:**
1. Call `da_login` → opens OAuth flow via `admin.hlx.page`
2. Adobe login → POST ping to `localhost:8767/.aem/cli/login/ack`
3. Browser redirects with token as query param → token saved with `saved_at: Date.now()`
4. Verify auth: call `da_whoami`

**Token format check:** If you see "Invalid time value" error, the token file is malformed. Re-authenticate via `da_login`.

| Tool | Signature | Notes |
|---|---|---|
| `da_login` | `da_login(org, repo)` | Triggers OAuth. User must click "Send" on the admin.hlx.page tab. |
| `da_whoami` | `da_whoami()` | Returns current authenticated user info |
| `da_write` | `da_write(org, repo, path, content)` | Write + preview + publish in one call ← USE THIS |
| `da_preview` | `da_preview(org, repo, path)` | Trigger preview without writing |
| `da_list_sources` | `da_list_sources(org, repo, path?)` | List files/folders |

### Adobe DA MCP (claude.ai AEM DA - Prod)

Use for read operations and when you need fine-grained control. **Always prefer `hlx-admin-mcp da_write` for any write that should be visible on the live site.**

| Tool | Use For |
|---|---|
| `da_list_sources` | List content in an org/repo |
| `da_get_source` | Read HTML content of a path |
| `da_update_source` | Update content (write only, no preview) |
| `da_create_source` | Create new content |
| `da_delete_source` | Delete content |
| `da_copy_content` | Copy path to path |
| `da_move_content` | Move/rename path |
| `da_upload_media` | Upload images/media |
| `da_lookup_media` | Find media by name |
| `da_lookup_fragment` | Find fragments by name |
| `da_get_versions` | Version history for a path |

**DA Content URLs:**
- Edit: `https://da.live/edit#/<org>/<repo>/<path>`
- Content API: `https://content.da.live/<org>/<repo>/`
- Admin: `https://admin.da.live/<org>/<repo>`

---

## Demo & Trial Environment URLs

These are your fastest paths to a live demo — no provisioning, no Cloud Manager setup required.

| URL | What it gives you | Best for |
|---|---|---|
| `https://www.aem.live/developer/aem-playground` | AI agent exploration, no login required | Any surprise/short-notice agent demo |
| `https://www.aem.live/developer/ue-trial` | Pre-configured AEM + EDS + Universal Editor | XWalk/UE authoring demo with zero setup |
| `https://www.aem.live/developer/ue-trial-terms.pdf` | Trial program terms PDF | Prospects needing legal sign-off before trial |
| `https://www.aem.live/business/demo` | VIP Program / demo sign-up page | Where to send prospects after initial call |
| `https://main--site-scope--aemsites.aem.live/` | ExMod Site Scope Analyzer | Run customer URL — migration complexity in 60 sec |
| `https://intake-form--site-scope--aemsites.aem.live/` | ExMod formal intake form | Required before ExMod team engages |
| `https://llmo.now` | LLMO product access | LLM Optimizer demos |
| `https://play.llmo.now` | LLMO Frescopa demo — external-safe | External/customer-facing LLMO demo |

### Cloud Manager Sandbox (For Longer POCs)
- Create sandbox at: Experience Cloud → Cloud Manager → Programs → "Add Program" → Sandbox
- AEM Sites, Assets, and EDS automatically included
- No production SLA; designated for demos, POCs, training
- Guide: `https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/using-cloud-manager/programs/creating-sandbox-programs`

### ExMod Scoper — Use in Every Migration Conversation
Run before ANY migration discussion — takes 60 seconds, creates instant credibility:
1. Go to `https://main--site-scope--aemsites.aem.live/`
2. Enter the customer's public URL
3. Walk through: block count, complexity rating, migration estimate
4. Hand them the intake form URL for formal engagement

---

## AEM Docs Reference

### Primary Index
- **LLM-friendly docs:** `https://www.aem.live/llms.txt` — 27 developer guides, Admin API, aem CLI, supplementary tools. Feed this URL to any LLM for full EDS context.
- **Block Collection:** `https://www.aem.live/developer/block-collection` — reference block implementations
- **Developer guides:** `https://www.aem.live/developer/` — blocks, spreadsheets, indexing, CDN, authoring
- **AEM Coder:** `https://aemcoder.adobe.io` — Adobe's AI-powered EDS dev console (Claude under the covers)
- **DA Live:** `https://da.live` — Document Authoring editor

### Search Docs Without a Browser
```bash
# Search aem.live docs by keyword
curl -s https://www.aem.live/docpages-index.json | \
  jq -r '.data[] | select(.content | test("KEYWORD"; "i")) | "\(.path): \(.title)"'
```

### Key Developer Guides (from llms.txt)
- Block development, section metadata, auto-blocking
- Spreadsheets as data source (query-index.json, *.json sheets)
- Bulk metadata, redirects, sitemaps
- CDN configuration, custom domains
- Sidekick configuration and library
- aem CLI reference (`npx @adobe/aem-cli up`)
- Experimentation and personalization
- Cloud Manager pipelines

---

## Content Fragment → EDS Build Pattern

> **Source docs:** [json2html](https://www.aem.live/developer/json2html) · [CF Overlay](https://www.aem.live/developer/content-fragment-overlay)

Publish AEM Content Fragments as **full semantic HTML pages** on EDS — no GraphQL endpoints, no custom blocks, no dev handoff. CFs become real web pages (press releases, blog posts, product announcements) with PageSpeed 100 and full LLM/SEO indexing.

### What This Replaces

The old approach required: CF model + GraphQL query + custom block + frontend rendering. This approach replaces all of that with a path mapping + Mustache template + the `json2html` Cloudflare Worker.

### Architecture

```
AEM CF (Cloud Service)
  └── Path mapping: /content/dam/.../press/ → /press/
  └── Allow-listed CF model
  └── Overlay → json2html Worker
        └── Endpoint: AEM JSON API (with {{id}} placeholder)
        └── Template: Mustache .html file in your repo
        └── Output: Full semantic HTML → EDS CDN
```

### Prerequisites

- AEM as a Cloud Service with CF feature enabled for the site
- Config Service enabled in Edge Delivery Services
- Site based on `adobe-rnd/aem-boilerplate-xwalk` (or similar)
- AEM Admin API token for config POST

### Step-by-Step Build

**Step 1 — Configure path mapping + overlay via Config Service**

POST to `/config/` with your Admin API token:
```json
{
  "path": "/press/",
  "overlay": {
    "url": "https://json2html.adobeaem.workers.dev/<ORG>/<SITE>/<BRANCH>",
    "type": "markup"
  }
}
```

Also configure the allow-listed CF model and path mapping (`/content/dam/.../press/` → `/press/`).

**Step 2 — Configure the json2html service**

```json
{
  "path": "/press/",
  "endpoint": "https://<aem-env>.adobeaemcloud.com/api/assets/press/{{id}}.json",
  "regex": "/press/([^/]+)",
  "template": "/templates/press-release.html",
  "relativeURLPrefix": "https://<aem-env>.adobeaemcloud.com",
  "headers": { "Authorization": "Bearer <token>" },
  "forwardHeaders": ["cookie"]
}
```

**Step 3 — Write the Mustache template**

Create `/templates/press-release.html` in your repo. EDS-compatible Mustache:
```html
<header>
  <h1>{{title}}</h1>
  <p class="date">{{publishDate}}</p>
</header>
<main>
  <div class="hero-image">
    <img src="{{heroImage.url}}" alt="{{heroImage.altText}}">
  </div>
  <div class="body-content">
    {{{bodyContent}}}
  </div>
  <aside class="contact">
    <p>{{contactName}} — {{contactEmail}}</p>
  </aside>
</main>
```

**Mustache syntax quick ref:**
- `{{field}}` — escaped output
- `{{{field}}}` — raw HTML (use for rich text body)
- `{{#array}}...{{/array}}` — iterate
- `{{#condition}}...{{/condition}}` — conditional

**Step 4 — Preview and validate**

```bash
# Preview the dynamic path before publishing
curl https://main--<repo>--<org>.aem.page/press/<fragment-name>

# Should return fully rendered HTML (not JSON, not placeholder)
```

### What the XSC Can Build with Current Skills

| Step | Covered by |
|---|---|
| Design the CF model (fields, types) | `/content-modeling` |
| Write the Mustache template | `/building-blocks` (block HTML structure guidance) |
| Push the template to DA repo | `da_update_source` or `hlx-admin-mcp da_write` |
| Validate the rendered page | `/testing-blocks` + `/pagespeed-audit` |

**What requires human/Admin access:** Config Service POST, CF feature flag enablement, AEM CS environment setup. These are environment prerequisites — not block work.

### Demo Angle

**For omni-channel/headless deals:** "You manage this press release once in AEM. It publishes as a full web page to EDS — PageSpeed 100, fully indexed by Google and every LLM. No GraphQL. No frontend team. No cache invalidation headaches."

**Time savings:** Old approach (CF model → GraphQL endpoint → custom block → deploy) = 2–3 dev days. This approach = config + one Mustache template = 2–4 hours.

---

## CLI Tools

```bash
# Start local dev server (EDS project root)
npx -y @adobe/aem-cli up --no-open --forward-browser-logs

# Inspect RAW content (before EDS decoration pipeline)
curl http://localhost:3000/{path}.plain.html

# Inspect FULLY DECORATED HTML (after pipeline — sections, blocks, buttons, styles)
npm install -g aem-decorate
decorate /path/to/page                              # decorated HTML to stdout
decorate /path/to/page --format md                 # as markdown
decorate /path/to/page --selector "main .section"  # specific elements only
decorate /path/to/page --no-header --no-footer     # main content only

# AEM docs search (no browser)
curl -s https://www.aem.live/docpages-index.json | \
  jq -r '.data[] | select(.content | test("KEYWORD"; "i")) | "\(.path): \(.title)"'
```

---

## JavaScript Block Pattern

```javascript
export default async function decorate(block) {
  const rows = [...block.children];            // 1. Read DOM from EDS pipeline
  rows.forEach((row) => {
    const [imageCell, textCell] = [...row.children];
    // 2. Transform in place — no innerHTML, no document.write
  });
  block.addEventListener('click', handler);    // 3. Add interactivity
}
```

## CSS Block Pattern

```css
/* Mobile-first — base styles = mobile */
main .my-block { }

/* Tablet */
@media (width >= 600px) { main .my-block { } }

/* Desktop */
@media (width >= 900px) { main .my-block { } }

/* Wide */
@media (width >= 1200px) { main .my-block { } }
```

---

## Advanced Patterns (from scdemos/demo)

### Cloudflare Workers for Backend Logic
For any server-side logic EDS can't do client-side (contact forms, auth, feeds):
```
workers/contact_us/     # Contact form handler
workers/auth/           # Cloudflare Access auth (reads Cf-Access-Authenticated-User-Email header)
workers/feed/           # Content feed worker
```
- Dev: `npm run dev:<worker>` | Deploy: `npm run deploy:<worker>`

### Experimentation Plugin (A/B Testing)
`plugins/experimentation/` — enables experiments, audiences, and campaigns. No build step. See `plugins/experimentation/documentation/`.

### Dynamic Blocks Pattern
Load heavy blocks (tabs, modals) only after sections load — avoids render-blocking:
```javascript
// blocks/dynamic/index.js
export default async function dynamicBlocks(main) {
  const { setupFragmentModal } = await import('../modal/modal.js');
  setupFragmentModal(main);
  const hasTabSections = main?.querySelectorAll('.section[data-tab-id]').length > 0;
  if (!hasTabSections) return;
  const { createTabs } = await import('../tabs/tabs.js');
  await createTabs(main);
}
```

### Fragment Auto-Blocking Opt-Out
Fragment links (`/fragments/*`) and YouTube URLs are auto-wrapped in blocks. Use `#_dnb` to opt out:
`[link text](/fragments/foo#_dnb)`

### Sidekick Tools
```
tools/quick-edit/        # Inline content editing from Sidekick
tools/search/            # Find/replace across content
tools/plugins/fragments/ # Fragment management
tools/plugins/tags/      # Content tagging
```

### shared.js — Extra Utilities
Beyond `scripts.js`, use `scripts/shared.js` for reusable utilities (`createTag`, query-index helpers, Chart.js loader). New utilities go to `shared.js`, not `aem.js` or `scripts.js`.

---

## Migration Lessons (Hard-Won, Always Apply)

1. **Per-page templates always** — `templates/<slug>/<slug>.css`, set `template: <slug>` in `.metadata` block. Never reuse templates across different migrated pages.

2. **Dual-fetch for mobile/desktop art direction** — Sites with server-side UA detection serve different images. Fetch with desktop AND mobile UA, compare `<img>` tags, author two consecutive images (mobile first).

3. **CSS art direction pattern:**
```css
/* Mobile: hide second (desktop) image */
body.<template> p > img + img { display: none; }
/* Desktop: hide mobile, show desktop */
@media (width >= 768px) {
  body.<template> p > img:has(+ img) { display: none; }
  body.<template> p > img + img { display: inline; }
}
```

4. **Scope image CSS** — Never put `p > a > img { max-width: 85% }` in `styles.css` — it affects nav images, card icons, illustrations. Scope to template or block.

5. **Section boundaries = background colors** — Inspect `computedStyle.backgroundColor` up the ancestor chain before grouping content into a single EDS section.

6. **Measure spacing per-section** — Never apply uniform `margin: 60px 0` to all sections. Measure with `getBoundingClientRect()`, override per-section with `nth-of-type`.

7. **CSS shorthand breaks centering** — `margin: X 0` resets `margin: auto`. Use longhand `margin-top`/`margin-bottom` when centering is inherited.

8. **Playwright viewport** — Always set to 1280px before measuring: `browser_resize`. Never derive `max-width` from a single measurement.

9. **Use % not px for layout widths** — Never hardcode pixel values from measurements. Use `%` building blocks matching the original site's responsive approach.

10. **Auto-convert hook** — If project has `auto-convert-md.js` hook: never manually create `.html` files. If decoration breaks, delete `.html` and re-save `.md` to retrigger.

---

## Experience Modernization Agent — AEM Authoring Workflow

> Source: https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/ai-in-aem/agents/brand-experience/modernization/getting-started-aem-authoring

This is the **AEM Authoring project path** for the ExMod agent — distinct from the standard EDS-only flow. Use when the customer needs Universal Editor WYSIWYG editing in-context (AEM Cloud Service required).

**⚠️ Template note:** This workflow requires `aem-block-collection-xwalk` — NOT `ise-boilerplate`. For demos staying on `ise-boilerplate`, use the standard ExMod flow instead.

### What It Does

- Inspects existing code via **AEM Code Connector** GitHub app
- Migrates content from legacy site to modern AEM block structure
- Validates migrated content and surfaces errors in agent chat
- Uploads converted content + assets directly to AEM Cloud Service

### Prerequisites

- AEM as a Cloud Service instance
- Universal Editor configured
- GitHub repo access
- AEM Code Connector app installed on the repo

### Setup Steps

1. Create repo from `aem-block-collection-xwalk` template
2. Complete Universal Editor tutorial
3. Delete `paths.json` from repo
4. Install AEM Code Connector GitHub app
5. Access Sites console → **Create > Site from template** → choose "AEM Site with Edge Delivery Services Template"
6. Keep default site name (it's a unique identifier — do not change)
7. Update `fstab.yaml` with your configuration
8. Follow main modernization guide to connect GitHub repo and start prompting

### Migration Flow

```
Connect GitHub repo → Agent analyzes blocks → Content imported → Preview validation → Fix errors via chat → Upload to AEM
```

### Key Details

- **Site name = unique identifier** — always keep the default, never rename
- **Error resolution** — use "Add to chat" in the preview panel to target specific errors
- **Upload options** — download content package OR upload directly to AEM; images optional
- **After upload** — subsequent code changes follow the standard "Push Code Changes" guide section
- **Agent is conversational** — chat with it to fix validation issues inline

---

## MCP Servers — Team Setup

Adobe IMS handles auth automatically for all Adobe MCP endpoints — no tokens or manual login required.

### DA MCP (Document Authoring)

> Docs: https://docs.da.live/about/early-access/da-mcp

10 tools: `da_list_sources`, `da_get_source`, `da_create_source`, `da_update_source`, `da_delete_source`, `da_copy_content`, `da_move_content`, `da_get_versions`, `da_lookup_media`, `da_lookup_fragment`

### FluffyJaws MCP

> Docs: https://fluffyjaws.adobe.com/docs/api

Tools: `POST /api/v1/stream`, conversation management, FluffyPack queries, app registration. Full Adobe AI assistant access from within Claude Code.

### Team Distribution — `.vscode/mcp.json`

Add to your project repo — every team member gets both MCPs on clone, no manual config:

```json
{
  "mcpServers": {
    "da-prod-mcp": {
      "url": "https://mcp.adobeaemcloud.com/adobe/mcp/da"
    },
    "fluffyjaws": {
      "url": "https://fluffyjaws.adobe.com/api/v1/mcp"
    }
  }
}
```

### Global Claude Code (`~/.claude.json`)

For access across all projects:

```json
"mcpServers": {
  "da-mcp": {
    "type": "streamable-http",
    "url": "https://mcp.adobeaemcloud.com/adobe/mcp/da"
  },
  "fluffyjaws": {
    "type": "streamable-http",
    "url": "https://fluffyjaws.adobe.com/api/v1/mcp"
  }
}
```

### Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "da-mcp": {
      "type": "streamable-http",
      "url": "https://mcp.adobeaemcloud.com/adobe/mcp/da"
    },
    "fluffyjaws": {
      "type": "streamable-http",
      "url": "https://fluffyjaws.adobe.com/api/v1/mcp"
    }
  }
}
```

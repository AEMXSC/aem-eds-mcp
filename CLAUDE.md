# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AEM Edge Delivery Services Skills

All 17 Adobe AEM EDS skills are installed in [.agents/skills/](.agents/skills/) and available as slash commands:

**Core Development**
- `/content-driven-development` — Orchestrates the CDD workflow for all code changes
- `/analyze-and-plan` — Analyze requirements and define acceptance criteria
- `/building-blocks` — Implement blocks and core functionality
- `/testing-blocks` — Browser testing and validation
- `/content-modeling` — Design author-friendly content models
- `/code-review` — Self-review and PR review

**Discovery**
- `/block-inventory` — Survey available blocks in project and Block Collection
- `/block-collection-and-party` — Search reference implementations
- `/docs-search` — Search aem.live documentation
- `/find-test-content` — Find existing content for testing

**Migration**
- `/page-import` — Import webpages (orchestrator)
- `/scrape-webpage` — Scrape and analyze webpage content
- `/identify-page-structure` — Analyze page sections
- `/page-decomposition` — Analyze content sequences
- `/authoring-analysis` — Determine authoring approach
- `/generate-import-html` — Generate structured HTML
- `/preview-import` — Preview imported content

To update or add skills: `npx skills add https://github.com/adobe/skills/tree/main/skills/aem/edge-delivery-services --all`

## Obsidian Skills

Installed in `.agents/skills/` — update: `npx skills add https://github.com/kepano/obsidian-skills.git --yes`

| Skill | Description |
|-------|-------------|
| `/obsidian-markdown` | Create/edit Obsidian Flavored Markdown with wikilinks, embeds, callouts, properties |
| `/obsidian-bases` | Create/edit Obsidian Bases (`.base`) with views, filters, formulas, summaries |
| `/json-canvas` | Create/edit JSON Canvas (`.canvas`) files with nodes, edges, groups |
| `/obsidian-cli` | Interact with Obsidian vaults via CLI including plugin and theme development |
| `/defuddle` | Extract clean markdown from web pages using Defuddle, removing clutter |

## Claude Scientific Skills

170+ research/science skills installed in `.agents/skills/` from K-Dense-AI.

Domains: Bioinformatics, Cheminformatics, Drug Discovery, Proteomics, Clinical Research, Healthcare AI, Medical Imaging, ML/AI, Materials Science, Physics, Astronomy, Engineering, Geospatial, Lab Automation, Scientific Communication, Multi-omics, Protein Engineering.

- 250+ databases (PubMed, ChEMBL, UniProt, ClinicalTrials.gov, SEC EDGAR, etc.)
- 60+ Python package skills (RDKit, Scanpy, PyTorch Lightning, Qiskit, OpenMM, etc.)
- Update: `git clone --depth=1 https://github.com/K-Dense-AI/claude-scientific-skills.git /tmp/sci && cp -r /tmp/sci/scientific-skills/* .agents/skills/`
- Source: https://github.com/K-Dense-AI/claude-scientific-skills

## Parry (Pending — Windows/HuggingFace Setup Required)

Prompt injection scanner for Claude Code hooks. Scans tool inputs/outputs for injection attacks, secrets, and data exfiltration.

- Early development, Linux/macOS primary target
- Requires: HuggingFace account + DeBERTa v3 license accepted at https://huggingface.co/ProtectAI/deberta-v3-small-prompt-injection-v2
- Install when ready: `uvx parry-guard hook` via Claude Code hooks config
- Source: https://github.com/vaporif/parry

## UI/UX Pro Max Skill

Installed in `.claude/skills/ui-ux-pro-max/` — activates automatically for UI/UX requests.

- **161 reasoning rules** for industry-specific design systems
- **67 UI styles** (Glassmorphism, Claymorphism, Brutalism, Bento Grid, AI-Native, etc.)
- **161 color palettes**, **57 font pairings**, **99 UX guidelines**
- **13 tech stacks**: React, Next.js, Astro, Vue, Nuxt, shadcn/ui, SwiftUI, Flutter, etc.
- Just ask naturally: *"Build a landing page for my SaaS product"*
- Update: `uipro update` | Reinstall: `uipro init --ai claude`
- Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

## Get Shit Done (GSD)

Spec-driven development system installed in `.claude/commands/gsd/`. Solves context rot — quality degradation as context window fills.

**Core workflow:**
```
/gsd:new-project        → questions → research → requirements → roadmap
/gsd:discuss-phase 1    → capture implementation decisions
/gsd:plan-phase 1       → research + atomic XML task plans
/gsd:execute-phase 1    → parallel wave execution, fresh 200k context per plan
/gsd:verify-work 1      → user acceptance testing + auto-debug
/gsd:complete-milestone → archive + tag release
```

**Other key commands:** `/gsd:quick`, `/gsd:progress`, `/gsd:map-codebase`, `/gsd:debug`, `/gsd:help`

- Model profiles: `quality` (Opus/Opus), `balanced` (Opus/Sonnet, default), `budget` (Sonnet/Haiku)
- Update: `npx get-shit-done-cc@latest --claude --local`
- Source: https://github.com/gsd-build/get-shit-done

## Claude-Mem

Persistent memory compression system — installed and active. Preserves context across sessions with SQLite, vector search, and web viewer.

Configured in `~/.claude.json` as a stdio MCP server (`claude-mem`). Session hooks auto-inject memory context on every prompt.

- Web viewer UI at http://localhost:37777
- MCP search tools: `search`, `timeline`, `get_observations`
- Source: https://github.com/thedotmack/claude-mem

## MCP Servers

### n8n-mcp
Provides Claude with documentation and schemas for n8n's 525+ workflow automation nodes.
- 263 AI-capable nodes, 90% doc coverage, full node properties and operations
- Configured via: `claude mcp add n8n-mcp -- npx n8n-mcp`
- Source: https://github.com/czlonkowski/n8n-mcp

## Adobe Spectrum Web Components

Component library implementing Adobe's Spectrum design system as web components.

- **Repo**: https://github.com/adobe/spectrum-web-components
- **Docs**: https://opensource.adobe.com/spectrum-web-components/
- **Design system**: https://spectrum.adobe.com/
- Package prefix: `@spectrum-web-components/<component>` (e.g. `@spectrum-web-components/button`)
- Install individual components: `npm install @spectrum-web-components/button`
- Install all: `npm install @spectrum-web-components/bundle`
- Built on native Web Components — framework agnostic (works with React, Vue, plain HTML)

## Claude Code Resources

**Awesome Claude Code** — curated directory of skills, agents, plugins, hooks, and tools:
https://github.com/hesreallyhim/awesome-claude-code

Use this to discover new skills, MCPs, and extensions to add to this project.

## AEM EDS Documentation

LLM-friendly documentation index: **https://www.aem.live/llms.txt**

Covers 27 developer guides (blocks, spreadsheets, indexing, CDN setup, authoring), Admin API, aem CLI reference, and supplementary tools.

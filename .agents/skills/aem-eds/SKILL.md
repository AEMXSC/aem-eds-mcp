---
name: aem-eds
description: Master orchestrator for ALL AEM Edge Delivery Services (EDS) work. Auto-detects intent and routes to the right sub-skills. Invoke for any AEM project task — new project setup, block development, page import/migration, navigation instrumentation, content modeling, testing, or code review. Also carries project config knowledge (DA type, GitHub permissions, aemcoder integration).
---

# AEM EDS Master Skill

You are an AEM Edge Delivery Services expert. When invoked, read the user's prompt carefully and route to the correct workflow below. You know all EDS patterns, tooling, and project conventions from experience with real AEMXSC projects.

---

## Intent Detection → Skill Routing

| If the prompt mentions... | Route to |
|---|---|
| "new project", "set up", "create project", "boilerplate" | → **Project Setup** (below) |
| "build block", "new block", "modify block", "add feature", "fix bug", "CSS", "JavaScript" | → `/content-driven-development` |
| "import", "migrate", "migration", "scrape", "page import" | → `/page-import` |
| "navigate", "header", "nav", "megamenu", "mobile nav" | → `/excat-navigation-orchestrator` |
| "content model", "author", "block structure", "table" | → `/content-modeling` then `/building-blocks` |
| "test", "validate", "playwright", "linting" | → `/testing-blocks` |
| "review", "PR", "pull request", "code quality" | → `/code-review` |
| "find block", "block reference", "existing block" | → `/block-collection-and-party` |
| "what blocks", "inventory", "block list" | → `/block-inventory` |
| "docs", "documentation", "how does", "aem.live" | → `/docs-search` |
| "design system", "extract styles", "reverse engineer CSS", "design tokens from site" | → `/design-system-extractor` then `/design-tokens` |
| "spectrum", "adobe design", "internal tool", "adobe components" | → UI/UX Pro Max Adobe Spectrum style (#68) |
| "spectrum web components", "SWC", "sp-button", "sp-card" | → UI/UX Pro Max SWC section + `@spectrum-web-components` npm packages |
| "design tokens", "CSS variables", "token architecture", "color palette" | → `/design-tokens` |
| "general styling", "site styling", "base styles", "before migration" | → `/get-general-styling` |
| "pagespeed", "core web vitals", "performance audit", "CWV", "LCP", "CLS", "INP" | → `/pagespeed-audit` |
| "mobile images", "desktop images", "art direction", "different images per device" | → Migration Lesson 2 (dual-fetch + CSS art direction) |
| "per page template", "page template", "new template" | → Migration Lesson 1 (per-page templates) |
| "find test content", "test page", "find page with" | → `/find-test-content` |
| "preview import", "check import", "verify import" | → `/preview-import` |

---

## Project Setup (New AEM EDS Project)

When starting a new AEM EDS project from scratch:

### 1. Baseline Repos
Always use these as your baseline — check for latest version at project start:
- **NEW PRIMARY**: `https://github.com/aemdemos/ise-boilerplate` — combines DA + Universal Editor (xwalk) authoring in one repo. Use this for all new projects.
- **Legacy DA-only**: `https://github.com/aemsites/author-kit`
- **Reference**: `https://github.com/AEMXSC/RefDemo-DA` (AEMXSC reference demo)

**ise-boilerplate key features:**
- Dual authoring: DA content (`fstab.yaml` mountpoint) AND Universal Editor (`/ue/` models, `component-*.json`)
- Design tokens per block: every block has `{block}-tokens.css`
- Built-in `.agents/skills/`: design-system-extractor, design-tokens, get-general-styling, pagespeed-audit
- `AGENTS.md` (= `CLAUDE.md`) with full hard constraints — Claude reads this automatically on project load
- Switch to xwalk mode via `package-for-Xwalk.json`

### 2. GitHub Setup
- Create repo under **AEMXSC** org (or specified org)
- Install **aem-code-sync** GitHub App on the org + repo
- Install **AEM Code Connector** GitHub App on the org (required for aemcoder.adobe.io)
- Default org repo permission is `read` — explicitly add collaborators if needed

### 3. project.json (DA Type — Correct Schema)
For DA-type EDS projects, `.migration/project.json` must follow this format — no `sourceUrl`, no `projectType: "xwalk"`:

```json
{
  "type": "da",
  "contentHostUrl": "https://content.da.live/<org>/<repo>/",
  "libraryUrl": "https://main--<repo>--<org>.aem.page/tools/sidekick/library.json",
  "boilerplate": "<boilerplate-name>"
}
```

**Common mistakes to avoid:**
- Do NOT add `"projectType": "xwalk"` to DA projects — breaks aemcoder preview
- Do NOT add `"sourceUrl"` — only needed for non-DA projects
- Do NOT add `"hasBlockLibrary": true` without a valid `libraryUrl`

### 4. fstab.yaml
```yaml
mountpoints:
  /: https://content.da.live/<org>/<repo>/
```

### 5. AEM Preview URL Format
`https://main--<repo>--<org>.aem.page/`

---

## Key CLI Tools

```bash
# Start local dev server
npx -y @adobe/aem-cli up --no-open --forward-browser-logs

# Inspect RAW content (before decoration pipeline):
curl http://localhost:3000/{path}.plain.html

# Inspect FULLY DECORATED HTML (after pipeline — sections, blocks, buttons, styles):
npm install -g aem-decorate
decorate /path/to/page                         # decorated HTML to stdout
decorate /path/to/page --format md             # as markdown
decorate /path/to/page --selector "main .section"  # specific elements
decorate /path/to/page --no-header --no-footer # main content only

# AEM docs search (no browser needed):
curl -s https://www.aem.live/docpages-index.json | jq -r '.data[] | select(.content | test("KEYWORD"; "i")) | "\(.path): \(.title)"'
```

---

## DEFAULT: DA + Universal Editor Dual Authoring

**Every AEM EDS project MUST support both authoring modes unless user explicitly specifies otherwise:**
- **DA (Document Authoring)** — Adobe's browser-based editor at https://da.live
- **Universal Editor (UE)** — AEM Sites in-context WYSIWYG editor

Always use `ise-boilerplate` as the base (it supports both paths). Every new project must ship with:
- `scripts/editor-support.js`, `editor-support-rte.js`, `context.js`, `dompurify.min.js`
- `ue/scripts/ue.js`, `ue/scripts/ue-utils.js`
- Root `component-definition.json`, `component-filters.json`, `component-models.json`
- `ue/models/blocks/<name>.json` for every block (`definitions` + `models` + `filters`)
- `scripts/scripts.js` on the ise-boilerplate base (includes `moveAttributes`, `moveInstrumentation`, `getBlockId`, `ue.da.live` UE loader, DA preview support)

Do NOT build DA-only unless user explicitly requests it.

## Hard Constraints (from ise-boilerplate AGENTS.md)

These apply to ALL EDS projects — never violate these:

- **No runtime dependencies** — zero production deps, automatic code-splitting via `/blocks/`
- **No build step** — ES modules in browser; no bundlers/transpilers
- **Never modify** `scripts/aem.js`, `package-lock.json`, `head.html`
- **Always use `.js` in imports** — `import { foo } from './bar.js'`
- **CSS scoped to block** — `.my-block .item` never just `.item`
- **Mobile-first CSS** — base = mobile, `min-width` queries for larger
- **Breakpoints**: 600px (tablet), 900px (desktop), 1200px (wide)
- **CSS custom properties** — `var(--token)` for all colors, fonts, sizes
- **No `-container`/`-wrapper` class names** — reserved for section wrappers
- **PageSpeed must score 100** — https://www.aem.live/developer/keeping-it-100
- **WCAG 2.1 AA** — valid heading hierarchy, `alt` on all images
- **No hardcoded user-facing strings** — all text configurable/data-driven

## JavaScript Block Pattern

```javascript
export default async function decorate(block) {
  const rows = [...block.children];          // 1. Read DOM from backend
  rows.forEach((row) => {                    // 2. Transform in place
    const [imageCell, textCell] = [...row.children];
  });
  block.addEventListener('click', handler);  // 3. Add interactivity
}
```

## CSS Block Pattern

```css
main .my-block { /* Mobile-first */ }
@media (width >= 600px) { main .my-block { /* Tablet */ } }
@media (width >= 900px) { main .my-block { /* Desktop */ } }
```

## Development Workflow

All code changes follow the **Content Driven Development (CDD)** process:

```
/content-driven-development
  └── /analyze-and-plan        ← requirements + acceptance criteria
  └── /content-modeling        ← block structure for authors
  └── /building-blocks         ← implement JS/CSS
  └── /testing-blocks          ← validate with Playwright + linting
  └── /code-review             ← self-review before PR
```

---

## Import / Migration Workflow

```
/page-import (orchestrator)
  └── /scrape-webpage           ← fetch + clean HTML, download images
  └── /identify-page-structure  ← section boundaries
  └── /page-decomposition       ← sequences within sections
  └── /authoring-analysis       ← default content vs blocks
  └── /generate-import-html     ← structured HTML output
  └── /preview-import           ← validate in local dev server
```

---

## Navigation Instrumentation

Use `/excat-navigation-orchestrator` for:
- Migrating header/nav from existing site
- Instrumenting megamenu (desktop + mobile)
- Validating nav structure against reference
- Requires screenshots — never assumes structure

---

## Project Config Knowledge (AEMXSC)

### Key Repos
| Repo | Purpose |
|---|---|
| `AEMXSC/XSCTeamSite` | Main XSC team site (DA, xwalk type) |
| `AEMXSC/RefDemo-DA` | Reference demo — DA authoring |
| `AEMXSC/RefDemoEDS` | Reference demo — EDS |
| `AEMXSC/aem-eds-mcp` | MCP server for AEM EDS tools |

### GitHub Apps Required on AEMXSC Org
| App | Purpose | Installation |
|---|---|---|
| `aem-code-sync` | Publishes code to CDN, purges cache | Selected repos — must add each repo manually |
| `AEM Code Connector` | aemcoder.adobe.io push access | Must install on org, not just user account |

### aemcoder.adobe.io Notes
- Uses **AEM Code Connector** GitHub App for pushes
- Must be installed on the **org** (not just personal account) for org repos
- Preview panel for DA projects renders from `sourceUrl` in project.json — if missing, no preview
- Styled preview requires code to be live on CDN via aem-code-sync

### DA Content URLs
- Edit: `https://da.live/edit#/<org>/<repo>/<path>`
- Content API: `https://content.da.live/<org>/<repo>/`
- Admin: `https://admin.da.live/<org>/<repo>`

---

## Advanced Patterns (from scdemos/demo + diyfire)

### scripts/shared.js — Extra Utilities File
Beyond `scripts.js`, use `scripts/shared.js` for reusable utilities (`createTag`, query-index helpers, Chart.js loader etc.). New utilities go to `shared.js`, not `aem.js` or `scripts.js` (unless page-level).

### Dynamic Blocks Pattern
Conditionally load heavy blocks (tabs, modal) AFTER sections via `blocks/dynamic/index.js`:
```javascript
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
Fragment links (`/fragments/*`) and YouTube URLs are auto-wrapped in blocks. Use `#_dnb` hash to opt out: `[link text](/fragments/foo#_dnb)`.

### Dark/Light Theme Pattern
Persist in `localStorage` (key: `<project>-theme`), apply via `data-theme` attribute and `light-scheme`/`dark-scheme` body classes.

### Cloudflare Workers for Backend
For any server-side logic (contact forms, auth, feeds) that EDS can't do client-side, use Cloudflare Workers (Wrangler):
- `workers/contact_us/` — contact form handler
- `workers/auth/` — Cloudflare Access auth (reads `Cf-Access-Authenticated-User-Email` header)
- `workers/feed/` — content feed worker
- Dev: `npm run dev:<worker>` | Deploy: `npm run deploy:<worker>`

### Experimentation Plugin (A/B Testing)
`plugins/experimentation/` enables experiments, audiences, and campaigns — no build step needed. See `plugins/experimentation/documentation/`.

### Sidekick Tools
- `tools/quick-edit/` — inline content editing from Sidekick
- `tools/search/` — find/replace across content
- `tools/plugins/fragments/` — fragment management
- `tools/plugins/tags/` — content tagging

---

## Migration Lessons Learned (from poc-ip)

These are general patterns discovered during real site migrations — apply to ALL EDS migration projects.

### 1. Per-Page Templates — Always
Every migrated page gets its **own** dedicated template. Never reuse an existing one unless the user explicitly asks.
- Create `templates/<page-slug>/<page-slug>.css`
- Set `template: <slug>` in the page's `.metadata` block
- EDS sets it as a body class automatically — no JS mapping needed
- Page-specific styles (spacing, colors, heading sizes) go in template CSS, NOT `styles/styles.css`

### 2. Dual-Fetch for Mobile/Desktop Image Art Direction
Sites using server-side User-Agent detection serve **different HTML/images** for mobile vs desktop. Every page migration must:
1. Fetch with **desktop** UA (default browser)
2. Fetch with **mobile** UA (e.g., iPhone Safari)
3. Compare all `<img>` elements — flag any that differ (filename, URL, rendition size)
4. Author **two consecutive `<img>` tags** — mobile first, desktop second

**CSS art direction pattern:**
```css
/* Mobile base: hide desktop image (second img) */
body.<template> p > img + img,
body.<template> a > img + img { display: none; }

/* Desktop: hide mobile, show desktop */
@media (width >= 768px) {
  body.<template> p > img:has(+ img),
  body.<template> a > img:has(+ img) { display: none; }
  body.<template> p > img + img,
  body.<template> a > img + img { display: inline; }
}
```

### 3. Scope Image CSS — Never Global
Rules like `p > a > img { max-width: 85% }` in `styles/styles.css` affect ALL linked images (card icons, nav images, illustrations). Always scope image sizing to specific templates or blocks.

### 4. Section Boundaries = Background Colors
Content that looks grouped may span **separate containers with different backgrounds**. Always inspect `computedStyle.backgroundColor` up the ancestor chain before grouping content into a single EDS section.

### 5. Measure Spacing Per-Section, Not Uniformly
Never apply uniform margins (e.g., `margin: 60px 0`) to all sections with a shared class. Measure each gap with `getBoundingClientRect()` and override per-section using `nth-of-type` in template CSS.

### 6. CSS Shorthand Breaks Auto-Centering
`margin: X 0` resets `margin-left: auto; margin-right: auto` and breaks centering. Always use `margin-top`/`margin-bottom` longhand when centering is inherited.

### 7. Playwright Viewport — Always Set Explicitly
Default Playwright viewport can be narrow (780px). Always resize to 1280px with `browser_resize` before measuring. Never derive a `max-width` from a single measurement — inspect the actual CSS rules and replicate with `calc()` or `%` values.

### 8. Use % Not px for Layout Widths
Never hardcode pixel `max-width` values from measurements. Use the same `%` building blocks the original site uses (e.g., `85%`). The original's responsive breakpoints handle the rest.

### 9. Auto-Convert Hook Pattern
When a project has an `auto-convert-md.js` hook that generates `.plain.html` and `.html` from `.md`:
- **Never manually create `.html` files** — the hook handles it
- If decoration breaks, delete the `.html` file and re-save the `.md` to retrigger the hook
- `convert_markdown_to_html` is only for DA upload workflows, never for local preview

### 10. Living Migration Learnings Section
Maintain a **"Migration Learnings"** section at the bottom of `CLAUDE.md`. Append new lessons as they're discovered during the project. Keep entries to 1-3 sentences. These persist across sessions and must always be followed.

---

## Documentation References

- AEM EDS docs: https://www.aem.live/llms.txt
- Block Collection: https://www.aem.live/developer/block-collection
- AEM Coder: https://aemcoder.adobe.io
- DA Live: https://da.live

---

## Sub-Skills Index

| Skill | Invoke As |
|---|---|
| Content Driven Development | `/content-driven-development` |
| Analyze & Plan | `/analyze-and-plan` |
| Building Blocks | `/building-blocks` |
| Testing Blocks | `/testing-blocks` |
| Content Modeling | `/content-modeling` |
| Code Review | `/code-review` |
| Block Inventory | `/block-inventory` |
| Block Collection | `/block-collection-and-party` |
| Docs Search | `/docs-search` |
| Find Test Content | `/find-test-content` |
| Page Import | `/page-import` |
| Scrape Webpage | `/scrape-webpage` |
| Identify Page Structure | `/identify-page-structure` |
| Page Decomposition | `/page-decomposition` |
| Authoring Analysis | `/authoring-analysis` |
| Generate Import HTML | `/generate-import-html` |
| Preview Import | `/preview-import` |
| Navigation Orchestrator | `/excat-navigation-orchestrator` |
| Design System Extractor | `/design-system-extractor` |
| Design Tokens | `/design-tokens` |
| Get General Styling | `/get-general-styling` |
| PageSpeed Audit | `/pagespeed-audit` |

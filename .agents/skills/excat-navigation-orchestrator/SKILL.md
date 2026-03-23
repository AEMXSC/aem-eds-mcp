---
name: excat-navigation-orchestrator
description: Orchestrates AEM EDS navigation instrumentation via desktop, mobile, megamenu, and validation sub-agents. Use when migrating header/nav, validating nav structure, or instrumenting navigation. Requires screenshots; never assumes structure. Programmatic nav extraction only when full tree is pre-rendered (e.g. __NEXT_DATA__/DOM) and no hover-revealed content; for sidebar+right-panel megamenus use Playwright hover per item (see references/programmatic-nav-extraction.md). Invoke for "migrate navigation", "instrument header", "validate nav structure", "migrate header from URL". Do NOT use for simple link lists without screenshot evidence or when page is not yet migrated (use excat-page-migration first).
metadata:
  version: "1.0"
---

# Navigation Orchestrator

**Skill identity:** When the user asks which skill or workflow you are using, respond: **"Navigation Orchestrator (validation-first header/nav migration)."** Do not list sub-agents or internal architecture.

**Mandatory flow:** Desktop first, then mobile after confirmation. Complete Phases 1–3 (desktop analysis), aggregate, then implement **desktop only** with full styling and megamenu images. **STOP and request customer confirmation** that desktop is acceptable. Only after confirmation, run Phase 4 (mobile) and implement mobile view. Do NOT implement until the relevant aggregate is written; do NOT proceed to mobile without customer confirmation.

Orchestrates navigation instrumentation. Every structural decision MUST be validated via screenshot analysis. Desktop implementation MUST include full CSS (no raw bullet lists) and megamenu images when the source megamenu contains images.

## Zero-Hallucination Rules (CRITICAL)

**Do not skip validation steps.** Take your time with each phase; the hook blocks until prerequisites are met. Skipping steps causes rework.

- **Never** assume header structure, row count, or megamenu structure.
- **Never** infer layout without screenshot confirmation.
- **Never** redesign, simplify, or merge rows without visual proof.
- **If screenshot not provided:** Ask for it; refuse to continue until provided.
- **If megamenu not opened:** Refuse to proceed until open state is captured.
- **If uncertainty > 20%:** Request clarification; do not proceed.
- **If validation-agent reports mismatch:** Force re-analysis loop; do NOT silently adjust.
- **If source has content missing from nav file:** STOP. Write or update `blocks/header/navigation-validation/missing-content-register.json` with each omission: `{ "items": [{ "location": "Concessionárias dropdown", "description": "Dealer search form", "resolved": false }] }`. Then add the missing content to `content/nav.plain.html`, extract the exact styles from the source site so we match them precisely, set `resolved: true` for each, re-run validate-nav-content.js. The hook BLOCKS until all items are resolved. Do NOT proceed with a note that content was omitted.

## Key strategies

- **Megamenu / deep nav:** Use **programmatic extraction** only when the full tree is pre-rendered and **no** content is revealed by hovering sidebar items. Many React/Next.js sites embed the nav in `__NEXT_DATA__.props.pageProps.navigation` or DOM (hidden). See `references/programmatic-nav-extraction.md`. For sidebar+right-panel layouts where the right panel updates on hover, use Playwright hover per item — programmatic extraction cannot capture that content.

## Input

| Field | Required | Description |
|-------|----------|-------------|
| `sourceHeaderScreenshot` or `sourceUrl` | One required | Original header evidence (image or URL to capture). |
| `migratedPath` | Yes | Path to migrated page (e.g. `/` or `/page`) for localhost:3000. |
| `viewportDesktop` | No | Default 1440×900. |
| `viewportMobile` | No | Default 375x812. |

## Prerequisites

- Migrated site available at `http://localhost:3000{migratedPath}.html` (or create migratedPath as needed).
- Browser/Playwright (or equivalent) for screenshots when `sourceUrl` is given.
- For validation phase: Playwright MCP available for per-component screenshot capture and visual comparison (inline critique — see Step 14).

## Validation artifacts (required location)

**Base path:** `blocks/header/navigation-validation/` — create if it doesn't exist.

Full artifact table, file existence checklist, and rules: **`references/validation-artifacts.md`**

**Key rules:** Write each file immediately after producing that phase's JSON. Do not proceed to the next phase until written. Paths are relative to workspace root. If a phase is skipped, still write schema-shaped JSON with zero/empty values.

## Execution Flow: Desktop First, Then Mobile After Confirmation

**First message (MANDATORY — output once at the very start, before any step):** When the navigation orchestration flow begins, **read `references/workflow-start-message.md`** and output its contents to the user before writing session.json or running Step 1. When you write session.json, **include `workflowStartMessageDisplayed: true`** in it — only after you have displayed that message. The hook **blocks** session.json if this field is missing or false. After displaying the message, write session.json (with the flag) and proceed to Step 1.

**Step gating:** Do not move to the next phase until the current phase JSON is produced and written. Do not implement until the desktop aggregate is written. Do not run Phase 4 or mobile implementation until the customer has confirmed desktop is acceptable.

**User communication (MANDATORY — announce EVERY step):** The user must ALWAYS know which step you are currently executing. At the START of each step, output a clear status banner to the user in this exact format:

```
━━━ [DESKTOP] Step 1/15: Header Row Detection ━━━
```
```
━━━ [DESKTOP] Step 5a/15: Row Elements Behavior Validation — hover/click every row element on source then migrated ━━━
```
```
━━━ [MOBILE] Step 9/15: Implement Mobile — hamburger animation + accordion ━━━
```
```
━━━ [REGISTERS] Step 13/15: Build Style Registers (desktop + mobile) ━━━
```
```
━━━ [CRITIQUE] Step 14/15: Targeted Visual Critique — 4 key components in parallel (e.g. key-critique-top-bar-desktop, key-critique-nav-links-row-desktop, key-critique-mobile-header-bar, key-critique-mobile-menu-root-panel) ━━━
```

Use `[DESKTOP]` for steps 1–7, `[MOBILE]` for steps 8–12, `[REGISTERS]` for step 13, and `[CRITIQUE]` for steps 14–15. Include the step number out of 15, the step name, and any relevant detail. When a step COMPLETES, output the result:

```
✅ [DESKTOP] Step 5 COMPLETE: Megamenu behavior register — allValidated: true (12/12 items passed)
```
```
🚫 [DESKTOP] Step 6 BLOCKED: Structural similarity 87% (< 95%) — 2 mismatches. Fixing...
```

**Step numbering reference:**
| # | Phase | Step Name |
|---|-------|-----------|
| 1 | DESKTOP | Header Row Detection |
| 2 | DESKTOP | Row Element Mapping (+ hamburger icon) |
| 3 | DESKTOP | Megamenu Analysis (+ overlay + deep mapping) |
| 4 | DESKTOP | Aggregate + Implementation (nav.plain.html, CSS, JS, images) |
| 5 | DESKTOP | Megamenu Behavior Validation (FIRST — when megamenu exists) |
| 5a | DESKTOP | **Row Elements Behavior Validation** — hover and click EVERY element in EVERY row on SOURCE, then on MIGRATED; run compare-row-elements-behavior.js. Not just megamenu — logo, nav links, CTA, search, locale, hamburger, icons. |
| 6 | DESKTOP | Structural Schema Validation (SECOND) |
| 7 | DESKTOP | Pre-Confirmation Gate → Customer Confirmation |
| 8 | MOBILE | Mobile Behavior Analysis (hamburger animation, accordion/slide-in-panel, overlay, ALL heading options) |
| 9 | MOBILE | Mobile Implementation (CSS/JS breakpoints, hamburger → cross, accordion or slide-in-panel) |
| 10 | MOBILE | Mobile Structural Validation |
| 11 | MOBILE | Mobile Heading Coverage Validation (ALL nav headings tested — click + expand each one) |
| 12 | MOBILE | Mobile Behavior Register (tap/click/animation per component — same as desktop megamenu-behavior-register) |
| 13 | REGISTERS | Build style-register + mobile-style-register (2nd-last step — immediately before critique) |
| 14 | CRITIQUE | Targeted Visual Critique — 4 key components in parallel (top bar, nav links row [desktop]; mobile header bar, mobile menu root panel [mobile]) |
| 15 | CRITIQUE | Final Pre-Confirmation Gate + Report to Customer |

When fixing remediation (e.g. critique loop, structural fix cycle), output:
```
🔄 [CRITIQUE] Step 14: Remediation cycle 2 for row-0-cta (desktop) — applying CSS fixes from critique report...
```

**Debug logging (MANDATORY at every step):** The debug log at `blocks/header/navigation-validation/debug.log` is the ONLY way to verify what happened during a run. The hook auto-logs file writes and a workflow progress dashboard (with separate DESKTOP/MOBILE sections). The validation scripts auto-log their invocations. But the LLM must ALSO verify the log by checking it at key milestones. After each of these steps, read the last 20 lines of `debug.log` to confirm the step was logged:
- After running detect-header-rows.js — confirm `[SCRIPT:detect-header-rows]` entry appears
- After writing each phase JSON (1, 2, 3, aggregate)
- After running `validate-nav-content.js` — confirm `[SCRIPT:validate-nav-content]` entry appears
- After running `audit-header-images.js` — confirm `[SCRIPT:audit-header-images]` entry appears (expected vs actual image count; blocks if gap)
- After running `compare-megamenu-behavior.js` — confirm `[SCRIPT:compare-megamenu-behavior]` entry appears (includes panel layout when panelLayoutDetails present)
- After running `compare-row-elements-behavior.js` — confirm `[SCRIPT:compare-row-elements-behavior]` entry appears (Step 5a — hover/click every row element on source AND migrated)
- After running `compare-header-appearance.js` — confirm `[SCRIPT:compare-header-appearance]` entry appears (when header-appearance-mapping exists)
- After running `compare-structural-schema.js` — confirm `[SCRIPT:compare-structural-schema]` entry appears
- After running `detect-mobile-structure.js` (Step 5b) — confirm `[SCRIPT:detect-mobile-structure]` entry appears (mobile row/item count; hook blocks until .mobile-structure-detection-complete)
- After running `compare-mobile-structural-schema.js` (Step 7) — confirm script produced mobile-schema-register; when mobile has extra content, add to nav.plain.html mobile-only section and mobile missing-content-register
- After invoking the 4 key-component critique subagents (Step 14) — confirm critique folder and report exist for each of the 4 key components
- Before requesting customer confirmation — review the full WORKFLOW PROGRESS DASHBOARD in the log
- Before announcing "Nav migration complete" (Step 15) — run `pre-completion-check.js` and confirm `[SCRIPT:pre-completion-check] [PASS]` entry; if `[BLOCK]`, show user "Doing a final validation…" and do NOT send the completion message

If a script log entry is MISSING, the script was not actually executed. Go back and run it.

### Phase 1: Header Row Detection (Checkpoint 1)

**MANDATORY — run detect-header-rows.js first.** Never set rowCount from screenshot alone. Screenshot-based counting misses small rows (e.g. 40px utility bar on 900px viewport). Sticky headers can hide the utility bar after scroll. The gate **BLOCKS** phase-1 and phase-2 until the script has run.

1. At run start, write `blocks/header/navigation-validation/session.json` with `sourceUrl`, `migratedPath`, `startedAt` (ISO timestamp), and **`workflowStartMessageDisplayed: true`** (set this only after you have output the contents of `references/workflow-start-message.md` to the user; the hook blocks session.json until this is true).
2. **Run the row detection script (REQUIRED — gate blocks otherwise):**
   ```
   node scripts/detect-header-rows.js --url=<source-url> [--validation-dir=blocks/header/navigation-validation]
   ```
   The script uses Playwright and auto-detects `scripts/playwright-browsers` if present. If "Executable doesn't exist", run `PLAYWRIGHT_BROWSERS_PATH=$PWD/playwright-browsers npx playwright install chromium` from the scripts folder. The script navigates, runs `page.evaluate()` (getBoundingClientRect, getComputedStyle), and writes `phase-1-row-detection.json` + `.row-detection-complete` marker. **Do NOT write phase-1 manually** — the script produces it.
3. **Verify:** Read `blocks/header/navigation-validation/debug.log` — confirm `[SCRIPT:detect-header-rows] [PASS]` entry. If missing, the script was not run; re-run it.
4. Take a **header-only screenshot** (top ~150–200px) at desktop viewport (1440×900) to confirm visually. Never dismiss a DOM element (e.g. `util-nav`) without checking `window.getComputedStyle(el).display` at current scroll position.
5. **Gate:** phase-1 MUST be produced by the script. If `rowCount > 3`: Switch to **Modular Navigation Mode**. If `confidence < 0.8`, do not proceed without user confirmation.
6. Do not proceed to Phase 2 until `phase-1-row-detection.json` exists and `.row-detection-complete` marker exists.

### Phase 2: Row Element Mapping (Checkpoint 2)

1. Using the **same** desktop header screenshot, **you must produce** row mapping JSON:
   - For each row: `index`, `alignmentGroups`, `spacing`, `backgroundDifference`, `elements`, **`hasImages`** (boolean: true if that row contains any images — logo, icons), **`hasHoverBehavior`** (boolean: true if any element in that row shows behavior on hover, e.g. dropdown or highlight), **`hasClickBehavior`** (boolean: true if any element has click behavior, e.g. navigate or toggle), **`hasMegamenuInRow`** (boolean: true if this row contains nav items that open megamenu/dropdown panels — set from a quick hover test; do NOT drill into megamenu content; that is Phase 3).
   - **Megamenu simplification (Phase 2):** When a row has nav items that open megamenus, set `hasMegamenuInRow: true`. Do a **quick test** (hover one trigger, see the panel opens) to set `hasHoverBehavior` and `hasClickBehavior`. Do **NOT** hover every megamenu trigger or drill into panel content — Phase 3 handles full megamenu extraction. This reduces Phase 2 time.
   - **Interaction method (CRITICAL):** For ALL click and hover testing (hamburger, nav items, search, locale, megamenu quick test), use **Playwright MCP's click/hover** — NOT JavaScript `element.click()` or `element.dispatchEvent()`. JavaScript click often fails to trigger handlers that listen for real pointer events. Use Playwright first; do not fall back to JS click.
   - **Hamburger/breadcrumb icon detection (REQUIRED — click AND hover):** Inspect the header for any hamburger icon (☰), breadcrumb icon, or toggle button. Record ALL of these fields:
     - `hasHamburgerIcon` (boolean): is the icon present?
     - `hamburgerIconSelector` (CSS/xpath): selector to target it
     - `hamburgerClickBehavior` (string): what happens on click — e.g. "opens mobile drawer", "toggles nav sections"
     - `hamburgerHoverEffect` (string | null): hover the icon — does it change color, show background highlight, scale up? Record the effect or `null` if no hover effect
     - `hamburgerAnimation` (object/string): e.g. "morphs to × cross with CSS transform", "no animation, icon swap", "rotates 90°". If the icon changes shape on click (hamburger → cross), document: animation type (`transform-based`, `svg-swap`, `class-toggle`), CSS transition properties, duration, easing
     - Test the icon in **desktop viewport too** — some headers show it at all breakpoints. The hook **BLOCKS** if `hasHamburgerIcon: true` but click/hover/animation fields are missing (Gate 11).
   - **Search bar / form detection (REQUIRED):** For each row, check for any search bar, search input, or `<form>` element used for site search. Record `hasSearchForm` (boolean: true/false). Look for `<input type="search">`, `<form>` with search action, a visible magnifying-glass icon paired with an input, or an expandable search icon that reveals an input on click. If `hasSearchForm: true`, also record `searchFormDetails`: `formType` (inline-input | expandable-icon | modal-overlay | dropdown-panel), `inputPlaceholder`, `hasSubmitButton`, `hasAutocomplete`, `position`. Search bars are common in headers — look carefully before setting false. The hook **BLOCKS** if `hasSearchForm` field is missing (Gate 11b).
   - **Locale / language selector detection (REQUIRED):** For each row, check for any locale, language, or region selector. Record `hasLocaleSelector` (boolean: true/false). Look for: globe icons (🌐), country flag icons (🇺🇸 🇩🇪), language name text ("English", "EN/DE"), region dropdowns, country grid overlays, or language toggle switches. Click the element to observe what opens (dropdown list, full overlay grid, tooltip bubble, etc.). If `hasLocaleSelector: true`, record `localeSelectorDetails`: `selectorType` (language-dropdown | country-grid | region-dropdown | language-toggle | flag-dropdown | globe-icon-dropdown | inline-links), `triggerElement`, `triggerBehavior` (click | hover | both), `hasFlags` (boolean: true if country flags are shown — these MUST be downloaded to `content/images/` and referenced in `nav.plain.html`), `flagCount`, `dropdownLayout` (vertical-list | multi-column-grid | full-width-overlay | tooltip-bubble | inline-toggle), `entryCount`, `currentLocaleIndicator`, `position`, `closeBehavior`. The hook **BLOCKS** if `hasLocaleSelector` field is missing (Gate 11c).
   - **Hover and click check (required):** For rows **without** megamenu: test hover and click on each nav item. For rows **with** megamenu (`hasMegamenuInRow: true`): one quick hover on a trigger suffices — set `hasHoverBehavior: true`, `hasClickBehavior: true`; do not drill into panels. Do **not** assume that links have no hover effect — many headers open a dropdown on hover. Record both in the schema.
   - Top-level: `rows` (array), `confidence`, `uncertainty`, `notes`.
2. **Gate:** Output MUST conform to `references/desktop-navigation-agent-schema.json` (rowMapping shape). Every row must have `hasImages`, `hasHoverBehavior`, and `hasClickBehavior` set from evidence. Only derive from the screenshot and interaction tests; do not assume alignment or grouping. If ambiguous, set `uncertainty: true` and list issues in `notes`; STOP if uncertainty > 20%.
3. **Write** the Phase 2 JSON to `blocks/header/navigation-validation/phase-2-row-mapping.json`. Do not proceed to Phase 3 until this file exists.
4. **Header appearance mapping (source) — REQUIRED before implementation:** On the source site, observe the header bar appearance:
   - **Default state:** Is the header background transparent (overlaps hero), solid (opaque), or gradient?
   - **Interaction state:** When hovering nav items or when megamenu opens, does the header change (e.g. solid-white, blur, opacity)?
   - **HeaderBackgroundBehavior (REQUIRED):** Produce `blocks/header/navigation-validation/header-appearance-mapping.json` conforming to `references/header-appearance-mapping-schema.json`. Include **`headerBackgroundBehavior`** (required): `defaultState` (transparent|solid|gradient), `interactionState` (solid-white|solid-colored|opacity-change|blur|none), `classToggle` (openClass, closedClass), `requiresBodyPaddingTop`, `textColorInversion`. The hook **BLOCKS** header.css until this file exists. This ensures transparent vs solid behavior is documented and the correct CSS template is used before any CSS is written.

### Phase 3: Megamenu Analysis (Checkpoints 3 and 4)

**Before deep mapping:** Try programmatic extraction first. Run `page.evaluate()` to check for `__NEXT_DATA__.props.pageProps.navigation` or DOM traversal — see `references/programmatic-nav-extraction.md`. One call can return the full tree; fall back to manual click-through only if extraction fails.

1. Obtain evidence of the **open** megamenu (screenshot or explicit interaction test). If the source has dropdowns/megamenus, you must open one and capture it; do not guess structure from closed state.
2. **You must produce** megamenu JSON: `triggerType`, `columnCount`, `hasImages`, **`hasHoverBehavior`** (true if megamenu or nav item shows any behavior on hover), **`hasClickBehavior`** (true if megamenu or nav item has click behavior), `hasBlockStructure`, `nestedLevels`, `animationType`, `hoverOutBehavior`, `clickOutBehavior`, `promotionalBlocks`, `gridStructure`, `confidence`, `uncertainty`, `notes`. When `columnCount > 0`, include **`columns`** array: each item `{ columnIndex, hasImages, optional label }`. **Hover and click check (required):** Test hover and click separately on every nav item that can open the megamenu; do not assume links have no hover — hover over each to verify dropdown/open behavior; then test click. Use `triggerType: "both"` if both hover and click open or affect the megamenu.
3. **Search form inside megamenu:** Check if the megamenu panel contains a search bar or search input (some megamenus include in-panel search for filtering items). Record `hasSearchForm` in the megamenu JSON. If true, note `searchFormDetails` with position and scope.
4. **Locale selector inside megamenu:** Check if the megamenu panel contains a locale/language/region picker (some megamenus embed a full country grid with flags or a region tab selector). Record `hasLocaleSelector`. If true, note `localeSelectorDetails` with selectorType, hasFlags, entryCount. If flags are present, download them.
5. **Overlay behavior (CRITICAL — must match source exactly):** When the megamenu opens, check: Does the source site show a background overlay/backdrop behind the panel? Record `overlayBehavior`: `{ "hasOverlay": true/false, "overlayType": "semi-transparent-black|blur|none", "overlayOpacity": "0.5", "overlayDismisses": true/false }`. The migrated site MUST replicate this exactly — if the source has NO overlay, the migrated must NOT add one. If the source has a semi-transparent backdrop, the migrated must match its opacity and color. Mismatched overlays are a common failure.
6. **Gate:** Output MUST conform to `references/megamenu-schema.json`. If megamenu exists and has columns, `columns` with per-column `hasImages` is required. If no megamenu exists, emit valid JSON with zero/empty values and `notes` explaining. No implementation until this JSON is produced and validated.
7. If `columnCount > 4` or `nestedLevels > 2`: Apply Modular Navigation Mode for later validation.
8. **Write** the Phase 3 JSON to `blocks/header/navigation-validation/phase-3-megamenu.json`. Do not proceed until this file exists.
9. **Deep megamenu mapping (REQUIRED when any dropdown exists):** After writing phase-3, perform a **per-item deep analysis** of every dropdown panel (megamenu = any panel that drops down on hover/click, small or large):
   - **Prefer programmatic extraction when available:** Many React/Next.js sites embed the full nav tree in `__NEXT_DATA__.props.pageProps.navigation` or in the DOM (hidden with CSS). Run `page.evaluate()` first to extract the complete tree in one call — see `references/programmatic-nav-extraction.md`. One call can return all 339+ items across all nesting levels instead of hundreds of manual clicks.
   - **If extraction fails (dynamic load-on-click):** Fall back to manual drill-down. For EACH nav trigger that opens a panel: hover it, record what opens; click it, record what happens. For EVERY item INSIDE each opened panel (links, image-cards, tabs, categories): hover it individually, record the effect (e.g. "hovering item thumbnail updates the featured area with a zoomed image and specs"); click it, record where it navigates.
   - If the panel has **category tabs** (e.g. TODOS, SUV, HATCHBACK): click each tab, record how it filters content.
   - If the panel has a **featured area** (e.g. large vehicle image on the left that changes on hover): document it, note what triggers updates.
   - If items have **nested interactions** (hover shows specs, click opens sub-panel): drill down until no further interaction is found.
   - **Write** `blocks/header/navigation-validation/megamenu-mapping.json` conforming to `references/megamenu-mapping-schema.json`. Every individual item must be recorded. `totalItemsAnalyzed` must reflect the actual count of items tested.
   - **Panel layout details (REQUIRED for every panel — measured, NOT self-assessed):** For EACH nav trigger that opens a dropdown (small or large — megamenu = any panel that drops down on hover/click), add `panelLayoutDetails`. **MUST include measured values from getBoundingClientRect():** `measuredLeft`, `measuredRight`, `viewportWidth` (derive `viewportContained` from these: `measuredLeft >= 0 && measuredRight <= viewportWidth`). **MUST include computed CSS:** `cssPosition`, `cssLeft`, `cssWidth` from getComputedStyle — extract the exact positioning model from source so migrated can match. **Test at multiple viewports:** 1440, 1920, 1366, 1280, 1024px — add `viewportsTested` array with `{ viewportWidth, viewportHeight, measuredLeft, measuredRight, contained }` per viewport. Do NOT self-assess; the hook and compare script validate measurements. Source and migrated both must capture; compare-megamenu-behavior.js validates and fails on overflow.
   - **Content destination: nav.plain.html (CRITICAL):** All text content, link labels, category names, sub-menu items, promotional text, link URLs, **search forms**, **icon cards**, and any other interactive or visible elements discovered during deep megamenu mapping MUST be written into `content/nav.plain.html` — NOT into `header.js`. The JS code fetches `/nav.plain.html` and reads DOM content; it never generates it. **If you notice "source had X that wasn't included":** (1) Write `missing-content-register.json` with the omission (`location`, `description`, `resolved: false`). (2) Add X to nav.plain.html. (3) Extract the exact styles from the source site so we match them precisely. (4) Set `resolved: true` in the register. (5) Re-run validate-nav-content.js. The hook blocks until all resolved. Plan the nav.plain.html structure (HTML) to capture the full megamenu hierarchy (nested lists, section headings, link groups, forms, icon cards) so that header.js can traverse and render the panels faithfully.
   - **Gate:** If megamenu exists and `megamenu-mapping.json` is not written, do not proceed to implementation. The hook will block at Stop if this file is missing.

### Desktop aggregate and implementation (after Phase 3)

1. **Aggregate** Phase 1–3 outputs: `headerStructure`, `desktopMapping`, `megamenuMapping`, `validationReport`, `status`. Set `mobileMapping` to `"pending"` (mobile not yet analyzed).
2. **Write** to `blocks/header/navigation-validation/phase-5-aggregate.json`. Do not implement until this file exists.
3. **Implement desktop only:**
   - **Sequential implementation (do NOT parallelize):** Do NOT use parallel agents or concurrent writes for nav.plain.html, header.js, and header.css. Work step-by-step: (1) Write nav.plain.html → (2) Run validate-nav-content.js (must exit 0) → (3) Write header.js → (4) Write header.css. Parallel work causes mistakes in both files.
   - **nav.plain.html location:** Write `nav.plain.html` to the **`/content`** folder (e.g. `content/nav.plain.html`), **NOT** to the workspace root `/`. The EDS content tree expects nav under `/content`. header.js fetches `/nav.plain.html`; aem up serves it directly. Create `blocks/header/header.js` and `blocks/header/header.css` as before.
   - **Section structure (MANDATORY — enforced by validate-nav-content.js):** nav.plain.html must have **at least 2 top-level `<div>` sections**. Do NOT put all content in a single `<div>` — when uploaded to DA, a single-div document breaks the header. Simple navs may have 2–3 sections; complex ones 4+ (e.g. brand bar, main header, navigation, secondary nav). validate-nav-content.js fails until there are at least 2 top-level divs. Full CSS in header.css (horizontal layout, no raw bullet lists, dropdown/CTA styling).
   - **Content-first architecture (CRITICAL — do NOT hardcode text/content in JS):** ALL megamenu text content, link labels, category names, sub-menu items, promotional text, and link URLs MUST live in `content/nav.plain.html`, NOT in `header.js`. The **source site is authoritative** — nav.plain.html must contain everything the source has (forms, search fields, icon cards, links, panels). If you notice "source had X that wasn't included in nav.plain.html", STOP and add X. Do NOT proceed asserting nav.plain.html is correct. header.js fetches and parses the nav DOM — never generates content. `header.js` should only: (1) fetch /nav.plain.html and parse its DOM structure, (2) build the visual megamenu panels/accordions/grids from that content, (3) add event handlers (hover, click, transitions). If the source megamenu has "CategoryA → SubCat → Product" with thumbnail + specs, all of that text/links/image-refs go into nav.plain.html; header.js reads those DOM nodes and presents them as the megamenu panel. NEVER create site-specific function names (e.g. `buildCategoryAMegamenu`) — all functions must be generic and reusable across any site.
   - **Image storage (CRITICAL — nav.plain.html only):** ALL images (logo, icons, megamenu thumbnails, vehicle cards, flags) MUST be in nav.plain.html using `<img src="images/filename.ext" alt="...">` (HTML) or `![alt](images/filename.ext)` (if using markdown). **Use relative paths only — no leading /** (e.g. `images/logo.svg`, not `/content/images/logo.svg`). path.resolve() treats leading `/` as filesystem root, so absolute paths fail validation. Relative paths work for both browser serving and validate-nav-content.js. header.js must READ image paths from the nav DOM — never hardcode or parse custom formats. External URLs (https://...) are unaffected.
   - **Styling required:** Header must NOT render as raw bullet lists. **Extract the exact styles from the source site so we match them precisely.** CSS must provide: horizontal nav layout, header background and typography, dropdown panel styling, CTA button styling, removal of list bullets for nav-brand and nav-tools. Match source colors and layout.
   - **Pre-implementation CSS template selector (CRITICAL when defaultState is transparent):** Read `header-appearance-mapping.json` before writing header.css. If `headerBackgroundBehavior.defaultState === "transparent"`, use the **transparent header template**: NO `background-color` on `.nav-wrapper` or `.header` in default state; no body padding; gradient background if needed; `.is-open` (or `classToggle.openClass`) for interaction state; text color inversion when background changes. The hook **BLOCKS** if you add solid background to .nav-wrapper when defaultState is transparent.
   - **Image download (CRITICAL — images are missing every time, this is the #1 failure):** Before writing nav.plain.html, you MUST complete these sub-steps in order:
     1. Read `phase-2-row-mapping.json` and `phase-3-megamenu.json`. List every element with `hasImages: true`.
     2. For EACH such element: visit the source URL, identify the actual image URL(s) from the DOM (logo src, icon srcs, megamenu thumbnail srcs, promotional banner srcs).
     3. Download EVERY image file to `content/images/` (e.g. `content/images/logo.svg`, `content/images/megamenu-thumb-1.jpg`).
     4. In nav.plain.html, reference each downloaded image: `<img src="images/filename.ext" alt="alt text">`.
     5. After writing nav.plain.html, **MANDATORY — run the validation script:**
        ```
        node scripts/validate-nav-content.js content/nav.plain.html blocks/header/navigation-validation
        ```
        If exit code is non-zero, DO NOT PROCEED. The script checks: images exist, and each file has size > 0 (no broken/empty downloads — common with logo/flags). Fix missing or 0-byte images, rewrite nav.plain.html, re-run. Repeat until exit code 0.
     5b. **MANDATORY — run the image audit script** (compares expected vs actual header images; blocks if gap):
        ```
        node scripts/audit-header-images.js content/nav.plain.html blocks/header/navigation-validation
        ```
        The script builds expected image count from phase-2 (rows with hasImages), phase-3 (megamenu/columns hasImages), and megamenu-mapping.json (panel items with hasImage, feature cards). It compares to images referenced in nav and on disk. If actual < expected, it reports **missingByLocation** (e.g. "Megamenu \"Industries\" → Refining Technologies") so you know where to add downloads. Fix missing images, re-run validate-nav-content.js then audit-header-images.js. The hook BLOCKS until `.image-audit-passed` exists.
     6. **Verify logging:** Read the last 10 lines of `blocks/header/navigation-validation/debug.log`. Confirm you see `[SCRIPT:validate-nav-content] [PASS]` or `[SCRIPT:validate-nav-content] [BLOCK]`. If neither entry exists, the script was NOT actually executed — go back and run it. Also confirm `[SCRIPT:audit-header-images] [PASS]` after running the image audit.
     - This is NOT optional. This is NOT "EDS simplification". Dropping images is a validation failure.
     - If the source megamenu has vehicle thumbnails, promotional banners, or image cards, those MUST appear in nav.plain.html. Text-only dropdowns when the source has images = FAIL.
   - **Locale selector with flags (CRITICAL when hasFlags=true):** Content (country names and flag images) MUST live in nav.plain.html. header.js must only READ that content from the nav DOM and implement behavior (open/close, selection). header.css handles layout and styling (e.g. multi-column grid). Do NOT put country names or flag URLs in header.js. If `localeSelectorDetails.hasFlags` is true in phase-2:
     1. Visit the source locale dropdown/overlay. For EACH country/language entry with a flag, identify the flag image URL from the DOM.
     2. Download ALL flag images to `content/images/` (e.g. `content/images/flag-us.svg`, `content/images/flag-de.png`).
     3. In `nav.plain.html`, create a dedicated locale section with flag image references: `<img src="images/flag-us.svg" alt="US"> United States` for each entry.
     4. In `header.js`, read the locale entries from the nav DOM. Build the dropdown/grid/overlay dynamically — do NOT hardcode country names, flag URLs, or locale URLs in JS.
     5. In `header.css`, extract the exact styles from the source site so we match them precisely. Style the locale selector to match source exactly: dropdown layout (vertical-list, multi-column-grid, full-width-overlay, tooltip-bubble), flag image sizing, hover states, current-locale highlighting, close animation.
     - If the source has a country grid overlay with 50+ flags (like the STILL example), all 50+ flags must be downloaded and rendered. Do NOT skip flags or show text-only when source shows flags.
4. **Megamenu behavior validation (required when megamenu exists) — FIRST.** Behavior fixes add missing DOM elements, images, and interactions, which changes both structure and styling. Run this before structural or style validation.
   - **Create migrated megamenu mapping:** On the migrated page, hover and click every megamenu trigger, every panel item, every sub-item, every category tab, every featured area — exactly as you did for the source. Produce `blocks/header/navigation-validation/migrated-megamenu-mapping.json` conforming to the same `references/megamenu-mapping-schema.json` schema. **Include `panelLayoutDetails`** for each trigger with **measured values** (getBoundingClientRect: measuredLeft, measuredRight, viewportWidth) and **computed CSS** (cssPosition, cssLeft, cssWidth). Test at 1440, 1920, 1366, 1280, 1024px. The comparison script fails if measuredRight > viewportWidth or measuredLeft < 0.
   - **Compare and write behavior register:** Run:
     ```
     node scripts/compare-megamenu-behavior.js \
       blocks/header/navigation-validation/megamenu-mapping.json \
       blocks/header/navigation-validation/migrated-megamenu-mapping.json \
       --output=blocks/header/navigation-validation/megamenu-behavior-register.json
     ```
     The script compares source vs migrated per sub-item and writes **megamenu-behavior-register.json** with hover match, click match, and styling match for every item. Exit 0 only if all items pass.
   - **Verify logging:** Read last 10 lines of `debug.log`. Confirm `[SCRIPT:compare-megamenu-behavior]` entry appears. If missing, the script was NOT executed — go back and run it.
   - **Gate:** If **any item has `status: "failed"`**, the register lists exactly what's wrong. Do NOT proceed to structural or style validation until `allValidated: true`.
   - **MEGAMENU BEHAVIOR REMEDIATION (when any sub-item fails):** For EACH failed item:
     1. **Hover mismatch:** Edit `blocks/header/header.js` to add/fix hover event handlers. If source shows hover-to-zoom (e.g. hovering car thumbnail updates featured image area), implement the same DOM update + transition.
     2. **Click mismatch:** Edit `blocks/header/header.js` to fix click navigation or panel behavior to match source URLs and actions.
     3. **Styling mismatch:** Extract the exact styles from the source site so we match them precisely. Edit `blocks/header/header.css` to match source appearance (image cards vs text links, grid layout, thumbnails, borders). If source has images and migrated doesn't, download images and add to nav.plain.html. If text/link content is missing or wrong, fix it in `content/nav.plain.html` (NOT in header.js) — JS only reads and presents DOM content, never hardcodes it.
     4. **Re-test and re-compare:** Hover and click the fixed items on migrated page. Update `migrated-megamenu-mapping.json`. Re-run `compare-megamenu-behavior.js`. Repeat until register shows `allValidated: true`.
   - **Why first:** Behavior fixes typically add missing DOM structure (featured areas, category tabs, image cards, spec sections), which directly affects what the structural schema comparison sees and what the style critique evaluates. Running structure or style first wastes iterations.
4b. **Row elements behavior validation (required for all desktop headers) — Step 5a.** Every row, every element — logo, nav links, CTA, search, locale selector, hamburger, icons — must have hover and click validated. Not just megamenu; not just main nav headings.
   - **CRITICAL — use Playwright click/hover, NOT JavaScript:** Use Playwright MCP to click and hover each element. Do NOT use `element.click()` or `dispatchEvent` — they often fail to trigger real handlers.
   - **CRITICAL — do NOT infer from implementation intent:** You MUST physically hover and click each element on the **live migrated page** (localhost preview) and record what actually happens. Do NOT create migrated-row-elements-mapping.json from nav.plain.html or header.js — that would be wrong. Test on the migrated page.
   - **Create source row-elements-mapping:** Using phase-2 row structure, on the **source** site hover and click **every** distinct element in **every** row. Record each with `id` (e.g. `row-0-logo`, `row-0-nav-links`, `row-0-cta`, `row-0-search`, `row-0-locale-selector`, `row-0-hamburger`, `row-1-nav-links`). Produce `blocks/header/navigation-validation/row-elements-mapping.json` conforming to `references/row-elements-mapping-schema.json`. Include `hoverBehavior` and `clickBehavior` for each.
   - **Create migrated row-elements-mapping:** On the **migrated** page (localhost), hover and click the same elements. Produce `blocks/header/navigation-validation/migrated-row-elements-mapping.json` (same schema). Record what actually happens on hover/click — not what you intended.
   - **Compare and write register:** Run:
     ```
     node scripts/compare-row-elements-behavior.js \
       blocks/header/navigation-validation/row-elements-mapping.json \
       blocks/header/navigation-validation/migrated-row-elements-mapping.json \
       --output=blocks/header/navigation-validation/row-elements-behavior-register.json
     ```
   - **Gate:** Require `row-elements-behavior-register.json` → `allValidated: true`. If any item fails, fix header.js/header.css (hover/click handlers), re-test, re-run script until all pass.
   - **Verify logging:** Read `debug.log`. Confirm `[SCRIPT:compare-row-elements-behavior]` entry.
4c. **Header appearance on hover/click (required for all headers):** The **source** `header-appearance-mapping.json` was created in Phase 2 (before implementation). If no change on source, set `hasChanges: false` and `triggers: []` in both.
   - **Create migrated header-appearance-mapping:** On the migrated page, test the same. Produce `blocks/header/navigation-validation/migrated-header-appearance-mapping.json` (same schema, including `headerBackgroundBehavior`).
   - **Compare and write register:** Run `node scripts/compare-header-appearance.js blocks/header/navigation-validation/header-appearance-mapping.json blocks/header/navigation-validation/migrated-header-appearance-mapping.json --output=blocks/header/navigation-validation/header-appearance-register.json`.
   - **Gate:** Require `header-appearance-register.json` → `allValidated: true`. If no changes on source, set `hasChanges: false` in both; register will pass.
5. **Structural schema validation and schema register (required) — SECOND.** Now that behavior is locked in, validate that content/structure matches source.
   - **Extract from migrated page:** Inspect the header on the migrated page (screenshot or DOM). Produce `blocks/header/navigation-validation/migrated-structural-summary.json` conforming to `references/structural-summary-schema.json`: `rowCount`, `rows` (array of `{ index, hasImages }` per row), `megamenu` (`columnCount`, `hasImages`, `columns` with `columnIndex` and `hasImages`).
   - **Compare and write schema register:** Run `node scripts/compare-structural-schema.js blocks/header/navigation-validation/phase-1-row-detection.json blocks/header/navigation-validation/phase-2-row-mapping.json blocks/header/navigation-validation/phase-3-megamenu.json blocks/header/navigation-validation/migrated-structural-summary.json --threshold=95 --output-register=blocks/header/navigation-validation/schema-register.json`. The script compares source to migrated and writes **schema-register.json** with one entry per component (row-0, row-1, …, megamenu, megamenu-column-0, …) and status **validated** or **pending**. Exit 0 only if overall structural similarity ≥ 95%.
   - **Verify logging:** Read last 10 lines of `debug.log`. Confirm `[SCRIPT:compare-structural-schema]` entry appears. If missing, the script was NOT executed — go back and run it.
   - **Gate:** If **similarity &lt; 95%** or **schema-register.json** has any item with status **pending**, list mismatches. Do NOT proceed to style validation until `allValidated: true`. Record `validationReport.structuralSimilarity` and `validationReport.structuralMismatches`; update `phase-5-aggregate.json`.
   - **STRUCTURAL REMEDIATION (when any component mismatches):** For EACH failing schema-register item, you MUST fix the implementation:
     1. **Identify what's missing:** Compare the source phase-2/phase-3 JSON against `migrated-structural-summary.json`. What's different? Missing row? Missing megamenu column? Missing images? Missing nested sub-menu?
     2. **Fix nav.plain.html:** If the migrated page is missing structural elements (a row, images, megamenu content, text labels, link groups, category names), edit `content/nav.plain.html` to add them. Download images if needed. ALL text/link content belongs in nav.plain.html — never in JS.
     3. **Fix header.js:** If behavior is missing (dropdown doesn't open, megamenu panel doesn't show, hover interaction missing), edit `blocks/header/header.js` to add event handlers, panel logic, and DOM traversal. Do NOT add text content or link URLs here — header.js reads what nav.plain.html provides.
     4. **Fix header.css:** Extract the exact styles from the source site so we match them precisely. If layout structure differs (missing column, grid mismatch), edit `blocks/header/header.css` to fix the layout.
     5. **Re-extract and re-compare:** Take a new screenshot/DOM inspection of the migrated page. Write updated `migrated-structural-summary.json`. Re-run `compare-structural-schema.js --output-register`.
     6. **Repeat:** Until schema-register shows `allValidated: true`.
   - **Why second:** Structure must be complete and correct before visual styling is evaluated. If rows, columns, or images are missing, the critique agent would compare against an incomplete implementation and scores would be meaningless.
7. **Pre-confirmation gate + Customer Confirmation (desktop structural + behavioral only):** Before asking the customer, verify:
   - [ ] Run `node scripts/validate-nav-content.js content/nav.plain.html blocks/header/navigation-validation` — exit code MUST be 0.
   - [ ] Run `node scripts/audit-header-images.js content/nav.plain.html blocks/header/navigation-validation` — exit code MUST be 0 (expected vs actual header images; no gap).
   - [ ] If using image manifests: `source-image-manifest.json` and `migrated-image-manifest.json` exist; run `audit-header-images.js --compare=... --against=...` — exit code MUST be 0 (migrated >= source). Hook blocks until `.image-manifest-compare-passed` exists.
   - [ ] phase-1 has no `heightMismatch: true` (or re-run detect-header-rows.js and implement all rows). phase-2 row count >= phase-1.rowCount (ROW_LANDMARK_PARITY). Megamenu feature cards documented when source has bgImages (FEATURE_CARD_COMPLETENESS).
   - [ ] `blocks/header/navigation-validation/megamenu-behavior-register.json` exists (when megamenu present), `allValidated: true` (includes panel layout when panelLayoutDetails present).
   - [ ] `blocks/header/navigation-validation/row-elements-behavior-register.json` exists, `allValidated: true` (all row elements — every row, every element — hover and click validated).
   - [ ] `blocks/header/navigation-validation/header-appearance-register.json` exists (when header-appearance-mapping.json exists), `allValidated: true` (header bar background/shadow on hover/click matches source).
   - [ ] `blocks/header/navigation-validation/schema-register.json` exists, `allValidated: true`.
   - [ ] `content/nav.plain.html` exists (not at root).
   - [ ] `blocks/header/header.css` and `blocks/header/header.js` exist and pass linting.
   - [ ] **Review `debug.log`:** Read the WORKFLOW PROGRESS DASHBOARD. Confirm ALL milestones show ✅.
   - If ANY item above fails, go back and fix it. Do NOT ask the customer.
   - **STOP. Request:** "Desktop structural + behavioral validation complete: megamenu behavior (all sub-items matched), row elements behavior (all rows, all elements — hover/click matched), structural schema (95%+). Style critique will run after mobile is also implemented. Please confirm desktop view to proceed to mobile."

### Phase 4: Mobile Behavior (only after customer confirmation)

1. Obtain **mobile** viewport screenshot(s): menu closed (hamburger visible) and, if applicable, menu open. Use mobile viewport (e.g. 375×812).
   - **Use Playwright click for all interactions:** Click the hamburger, nav headings, back button via Playwright MCP — NOT JavaScript. JS click often fails to trigger mobile menu handlers.
2. **You must produce** mobile JSON: `breakpointPx`, `menuTrigger`, `openBehavior` (drawer | accordion | fullscreen | slide-in-panel), `tapVsHover`, `nestedBehavior`, `hasMegamenuOnMobile`, `hamburgerAnimation` (e.g. `{ "type": "morph-to-cross", "method": "css-transform", "transition": "transform 0.3s ease" }`), `mobileMenuLayout` (e.g. `vertical-accordion`, `stacked-list`, `slide-in-subpanel`), **`menuItemsWidthLayout`** (`full-width-flush` | `centered-with-margins` | `constrained-max-width` — whether menu items are edge-to-edge or centered/margins; required for CSS parity), `accordionBehavior` (if applicable), `slideInPanelBehavior` (if applicable), `confidence`, `uncertainty`, `notes`. Do not reuse desktop row count or structure; derive from mobile screenshots only.
   - **Hamburger → cross animation (REQUIRED):** Click the hamburger icon. Document: does the icon morph into a cross (×)? What animation method? (`css-transform rotate`, `svg-path morph`, `class-swap`, `opacity-crossfade`). Record transition duration and easing. The migrated site MUST replicate this animation exactly.
   - **Split-link pattern (MANDATORY — each nav item has TWO click targets):** Each mobile menu item may have **two** clickable areas: (1) the **text/label** and (2) the **arrow/chevron**. Test BOTH on source and migrated. Click the **text area** — does it navigate (go to URL) or expand (open sub-menu)? Click the **arrow/chevron** — does it expand the sub-menu or navigate? Record for EVERY item in `mobileMenuItems[].splitLinkPattern`: `textClickBehavior` (navigate | expand | none | same-as-chevron) and `chevronClickBehavior` (expand | navigate | none | no-chevron). The migrated site MUST replicate the same pattern (e.g. text = navigate, chevron = expand). The hook **BLOCKS** if `splitLinkPattern` is missing for any item (Gate 14c).
   - **Mobile menu structure (REQUIRED — do NOT default to accordion):** With menu open, analyze the full structure. Click EACH top-level nav item and observe: Does it expand in-place below (accordion)? Or does the **entire main menu slide away** and a new sub-panel slide in from the right with a back button (slide-in-panel)? These are DIFFERENT patterns — accordion expands in place, slide-in replaces the entire view. If the source uses slide-in-panel, the migrated site MUST use the same pattern, NOT accordion.
   - **Slide-in panel detection (CRITICAL):** If clicking a nav item (e.g. "Products") causes the main menu to slide LEFT and a new panel appears from the RIGHT with a "← Products" back button, this is a **slide-in-panel** pattern. Set `openBehavior: "slide-in-panel"`, `mobileMenuLayout: "slide-in-subpanel"`, and populate `slideInPanelBehavior` with direction, back button details, transition type, and panel depth.
   - **Mobile megamenu behavior:** If the desktop megamenu has sub-items, tabs, featured areas — how do they appear on mobile? (e.g., category tabs become accordion headers or slide-in sub-panels, featured image hidden on mobile, grid becomes vertical list). Record for comparison.
   - **Mobile-only content (CRITICAL — extra items on mobile):** Mobile view often has **additional** items not on desktop (extra CTAs, mobile-only menu sections, different link order). When you detect mobile-only content missing from nav.plain.html: (1) Create `mobile/missing-content-register.json` with each omission (`location`, `description`, `resolved: false`). (2) Add the content to nav.plain.html in a mobile-only section (e.g. `.mobile-only` wrapper). (3) Extract the exact styles from the source site so we match them precisely. (4) In header.css, **hide on desktop** (`display: none` by default) and **show only at mobile breakpoint** (`display: block` or equivalent inside `@media (max-width: ...)`). This ensures desktop view is NOT impacted. (5) Set `resolved: true`. The hook blocks until all resolved.
   - **Mobile search form detection (REQUIRED):** Check whether the mobile header or mobile menu contains a search bar/input/form. Set `hasSearchForm` (true/false). On mobile, search may be: hidden behind a search icon, inside the hamburger menu drawer, collapsed into an expandable input, or completely absent on mobile. If `hasSearchForm: true`, populate `searchFormDetails` with `formType` (inline-input | expandable-icon | inside-menu | modal-overlay | hidden), `visibleInClosedState`, and `position`. The hook **BLOCKS** if `hasSearchForm` field is missing (Gate 14).
   - **Mobile locale / language selector detection (REQUIRED):** Check whether the mobile header or mobile menu contains a locale/language/region selector. Set `hasLocaleSelector` (true/false). On mobile, the locale selector may appear as: a globe icon in the header bar, a flag icon next to the hamburger, inside the hamburger menu drawer (top or bottom), a language toggle (e.g. "German | English"), or absent on mobile. If `hasLocaleSelector: true`, populate `localeSelectorDetails` with `selectorType` (language-dropdown | country-grid | region-dropdown | language-toggle | flag-dropdown | globe-icon-dropdown | inside-menu | inline-links), `triggerElement`, `visibleInClosedState`, `hasFlags`, `position`, `dropdownLayout`. If `hasFlags: true`, ensure flag images are downloaded. The hook **BLOCKS** if `hasLocaleSelector` field is missing (Gate 14b).
3. **Gate:** Output MUST conform to `references/mobile-navigation-agent-schema.json`.
4. **Write** the Phase 4 JSON to `blocks/header/navigation-validation/phase-4-mobile.json`.
5. Update `phase-5-aggregate.json` with real `mobileMapping` (replace `"pending"`).
5b. **Run detect-mobile-structure.js (MANDATORY — same as desktop row detection):** Run `node scripts/detect-mobile-structure.js --url=<source-url> [--validation-dir=blocks/header/navigation-validation]` at viewport 375×812. The script opens the hamburger and detects how many rows and how many items per row (header bar + top-level menu items). Writes `mobile/mobile-structure-detection.json` and `.mobile-structure-detection-complete`. The hook **BLOCKS** mobile structural validation until this marker exists. **When mobile has more rows, items, or extra images/text than desktop:** add that content to `content/nav.plain.html` in a **mobile-only section** (e.g. wrapped in a container with class used only in `@media` for mobile); record each in `mobile/missing-content-register.json` and set `resolved: true` once added. The hook blocks until all resolved.
6. **Implement mobile:** Extract the exact styles from the source site so we match them precisely. Update `blocks/header/header.css` and `blocks/header/header.js` for breakpoints, hamburger menu (including hamburger → cross animation), and open behavior per Phase 4 output. Key requirements:
   - **Hamburger animation:** CSS transform/transition for the hamburger → cross morph. Match source timing and easing.
   - **Menu items width (`menuItemsWidthLayout`):** If phase-4 says `full-width-flush`, menu items MUST stretch edge-to-edge on mobile. Add `@media` overrides so desktop rules (e.g. `justify-content: flex-end` on a wrapper) do not make items centered or margined; use full-width styling so items are flush to the edges.
   - **Accordion (if openBehavior is accordion):** Match source behavior — single vs multi expand mode, chevron animation, expand timing.
   - **Slide-in panel (if openBehavior is slide-in-panel):** Implement `transform: translateX()` based sliding panels. Main menu slides left when category selected; sub-panel slides in from right. Back button at top of sub-panel reverses transition. Do NOT fall back to accordion expand-in-place — this is the EDS default but does NOT match slide-in sources.
   - **No unexpected overlays:** If source mobile menu has NO overlay/backdrop, migrated must not add one. If source has a backdrop, match it exactly.
   - **Megamenu on mobile:** If desktop megamenu content appears as nested accordions on mobile, implement the same nesting depth and expand/collapse behavior.
   - **Viewport resize handling (REQUIRED — prevents layout breakage on resize):** After implementing both desktop and mobile views, add viewport resize handling in `header.js`. When the browser is resized between desktop and mobile breakpoints (without a page refresh), the layout must adapt cleanly. Use `window.matchMedia(breakpoint).addEventListener("change", handler)` (preferred) or `window.addEventListener("resize", debounceHandler)`. The handler MUST: (1) close any open mobile menus when crossing to desktop width, (2) reset hamburger icon to ☰ state, (3) remove mobile-only classes/inline styles, (4) re-initialize desktop hover behaviors, (5) close desktop megamenu dropdowns when crossing to mobile width. The hook **WARNS** if no resize/matchMedia handling is found in header.js (Gate 15).

### Phase 4 validation (mobile — same rigor as desktop)

After implementing mobile, run the same structural validation as desktop but scoped to mobile. Style critique runs in Step 14 (targeted — 4 key components in parallel).

7. **Mobile structural validation (rows + items per row — same as desktop):** (1) **Source structure:** Ensure `detect-mobile-structure.js` has been run (writes `mobile/mobile-structure-detection.json` with rowCount, rows[], topLevelMenuItemCount). (2) **Migrated structure:** Extract mobile header structure from the **migrated** page at 375×812 (with menu open) in the **same shape** as mobile-structure-detection: `rowCount`, `rows` (each with `index`, `itemCount`, `hasImages`), `topLevelMenuItemCount`. Write `blocks/header/navigation-validation/mobile/migrated-mobile-structural-summary.json`. (3) **Compare:** Run `node scripts/compare-mobile-structural-schema.js blocks/header/navigation-validation/mobile/mobile-structure-detection.json blocks/header/navigation-validation/mobile/migrated-mobile-structural-summary.json --output-register=blocks/header/navigation-validation/mobile/mobile-schema-register.json`. If migrated has fewer rows/items than source, fix implementation. If migrated has more (mobile-only content), ensure it is in nav.plain.html mobile-only section and in mobile missing-content-register. All items must be validated.
8. **Mobile heading coverage validation (ALL headings — CRITICAL):** With the mobile menu open at 375×812, click EVERY top-level nav heading and verify:
   - Does it expand/slide as expected per `phase-4-mobile.json` (accordion expand vs slide-in-panel)?
   - Does the sub-menu contain all items from the desktop megamenu mapping?
   - Does the back button (if slide-in-panel) work to return to the main list?
   - Record in `mobile/mobile-heading-coverage.json`: `{ "headings": [{ "label": "Products", "clicked": true, "subItemCount": 12, "behaviorMatches": true }, ...], "allCovered": true }`.
   - **Gate:** If ANY heading has `behaviorMatches: false` or was not clicked, fix implementation and re-test. Do NOT proceed until `allCovered: true`.
9. **Mobile behavior validation (tap/click/animation for EVERY component — same rigor as desktop megamenu-behavior-register):** After heading coverage is complete, test every mobile nav component's interactive behavior on the **migrated** site at 375×812:
   - **Split-link verification (MANDATORY):** For EACH top-level nav item, test **both** the text area and the arrow/chevron (if present) on the migrated site. Confirm: text click behavior matches `phase-4-mobile.json` `splitLinkPattern.textClickBehavior`; chevron click matches `chevronClickBehavior`. If migrated has different behavior (e.g. whole row navigates instead of chevron-only expand), fix header.js/CSS and re-test. Record in mobile-behavior-register.
   - For EACH top-level heading: tap it. Does it open the correct panel (accordion expand or slide-in)? Record `tapMatch`.
   - For EACH sub-panel or accordion panel: does it show the right items? Does the back button work? Record `behaviorMatch`.
   - For ALL animations: hamburger → cross transition, accordion expand/collapse, slide-in panel slide, back button reverse. Do they match the **source** site's speed, easing, and direction? Record `animationMatch` with specific timings.
   - **Hover/long-press:** Even on mobile, some sites have hover states via long-press. Test each component. Record any effect.
   - Write `blocks/header/navigation-validation/mobile/mobile-behavior-register.json`:
     ```json
     {
       "allValidated": true,
       "items": [
         { "id": "mobile-hamburger", "label": "Hamburger icon", "tapMatch": { "matches": true }, "behaviorMatch": { "matches": true }, "animationMatch": { "matches": true, "sourceSpeed": "0.3s", "migratedSpeed": "0.3s" }, "status": "validated" },
         { "id": "mobile-heading-products", "label": "Products", "tapMatch": { "matches": true }, "behaviorMatch": { "matches": true, "pattern": "slide-in-panel" }, "animationMatch": { "matches": true, "sourceSpeed": "0.3s", "migratedSpeed": "0.3s" }, "status": "validated" }
       ]
     }
     ```
   - **Gate (hook-enforced):** If ANY item has `status: "failed"`, fix the implementation. The hook checks `mobile-behavior-register.json` at session end (Stop Check 8e). All items must be validated before proceeding.
   - **Remediation:** For each failed item: extract the exact styles from the source site so we match them precisely. Fix CSS transitions in `@media` block for timing mismatches, fix JS event handlers for tap/click mismatches, fix translateX/max-height values for behavior mismatches. Re-test and re-write the register. Repeat until `allValidated: true`.
10. **Mobile dimensional gate (MANDATORY — catches full-width bugs):** Run `node scripts/mobile-dimensional-gate.js --url=<migrated-url> [--validation-dir=blocks/header/navigation-validation]` at viewport 375×812. The script opens the hamburger menu and runs live DOM measurements (getBoundingClientRect, getComputedStyle) on the menu list and nav items. It checks: menu list width = viewport, each nav-item width = viewport, edge-to-edge alignment, chevron alignment, container chain widths, and computed styles. **If the gate fails (exit code 1):** fix CSS (e.g. ensure `.nav-list` and `.nav-item` have `width: 100%` or equivalent so they span the viewport), then re-run the script. Do NOT build mobile-style-register (Step 13) until the gate passes. Report is written to `mobile/mobile-dimensional-gate-report.json` when `--validation-dir` is set. See `references/nav-validation-gates-and-hooks-summary.md` Section 7.

### Step 13: Build Style Registers (2nd-last step — immediately before critique)

**Hook-enforced:** You cannot create style-register.json or mobile-style-register.json until ALL desktop AND mobile validation is complete. The gate blocks until: desktop (megamenu-behavior-register, schema-register, row-elements-behavior-register, header-appearance-register) allValidated; phase-4 exists; mobile (migrated-mobile-structural-summary, mobile-schema-register allValidated, mobile-heading-coverage allCovered, mobile-behavior-register allValidated, mobile missing-content-register all resolved).

Build BOTH style-register.json and mobile-style-register.json. These are the ONLY inputs for the critique step. Do NOT run critique until both registers exist.

1. **Desktop style register:** Create `blocks/header/navigation-validation/style-register.json` conforming to `references/style-register-schema.json`. **Include the 2 key desktop components with exact IDs:** `key-critique-top-bar-desktop` (map to first row / top bar), `key-critique-nav-links-row-desktop` (map to main nav row). Set these 2 to `status: "pending"`. List all other desktop components from phase-1/2/3 and megamenu-mapping (row-0-logo, row-0-nav-links, megamenu-trigger-*, etc.) with `status: "skipped"`. Set `allValidated: false` until the 2 key components are critiqued.
2. **Mobile style register:** Create `blocks/header/navigation-validation/mobile/mobile-style-register.json`. **Include the 2 key mobile components with exact IDs:** `key-critique-mobile-header-bar`, `key-critique-mobile-menu-root-panel`. Set these 2 to `status: "pending"`. List all other mobile components (mobile-hamburger-icon, mobile-nav-heading-{i}, etc.) with `status: "skipped"`. Set `allValidated: false` until the 2 key components are critiqued.
3. **Proceed to Step 14 (critique).** Do NOT run critique before both registers exist.

### Step 14: Targeted Visual Critique — 4 Key Components in Parallel (MANDATORY)

Run critique for **exactly 4 key components** in parallel, then apply CSS fixes and announce completion. Remaining components are marked `status: "skipped"` and do not block.

1. **Four mandatory components (MUST be present in registers with these IDs):**

   | # | Component ID | Viewport | Description |
   |---|--------------|----------|--------------|
   | 1 | `key-critique-top-bar-desktop` | 1440×900 | Desktop top bar (first row: logo, utility nav, etc.) |
   | 2 | `key-critique-nav-links-row-desktop` | 1440×900 | Desktop nav links row (main nav) |
   | 3 | `key-critique-mobile-header-bar` | 375×812 | Mobile header bar (hamburger, logo, icons) |
   | 4 | `key-critique-mobile-menu-root-panel` | 375×812 | Mobile menu root panel (open menu, first level) |

2. **Build registers with 4 key + rest skipped:** When building `style-register.json` and `mobile/mobile-style-register.json`, include the 4 components above (create them with the exact IDs). Set `status: "pending"` only for these 4; set `status: "skipped"` for ALL other components. Set `allValidated: false` until the 4 are done.

3. **Invoke 4 critique subagents in parallel (MANDATORY — same turn):** You MUST run all 4 key-component critique workflows **in parallel** by invoking **4 subagents**, each with its own instruction file. Do NOT run them sequentially.
   - **Subagent instruction files** (under `nav-component-critique/key-component-agents/`):  
     (1) `critique-top-bar-desktop.md` → `key-critique-top-bar-desktop` @ 1440×900  
     (2) `critique-nav-links-row-desktop.md` → `key-critique-nav-links-row-desktop` @ 1440×900  
     (3) `critique-mobile-header-bar.md` → `key-critique-mobile-header-bar` @ 375×812  
     (4) `critique-mobile-menu-root-panel.md` → `key-critique-mobile-menu-root-panel` @ 375×812  
   - **How to invoke:** In a **single turn**, issue **4 concurrent** subagent/task invocations (e.g. 4 `mcp_task` tool calls in one response). For each invocation, pass the corresponding instruction file as the task prompt or attachment (e.g. "Run the critique workflow in this file: [path to critique-top-bar-desktop.md]"). Each subagent follows its `.md` and the parent `nav-component-critique/SKILL.md` steps A–G for that one component. Do NOT run component 2 only after component 1 completes — start all 4 together.
   - **Paths:** Desktop artifacts → `blocks/header/navigation-validation/critique/{componentId}/`; mobile → `blocks/header/navigation-validation/mobile/critique/{componentId}/`. Registers: desktop → `style-register.json`; mobile → `mobile/mobile-style-register.json`.
   - **Fallback:** If 4 concurrent tasks are not supported, run (1)+(2) in parallel in one turn, then (3)+(4) in parallel in the next — never purely sequential for all 4.

4. **Apply CSS fixes after all 4 complete:** Once all 4 critique reports exist, apply the recommended CSS/JS fixes from each report. Then re-run critique for any component that is still below 95% (re-runs may be sequential) until all 4 have `lastSimilarity >= 95%`.

5. **Mark 4 as validated, rest stay skipped:** When all 4 key components reach ≥ 95% with full critique proof, set their `status: "validated"` and set `allValidated: true` on both registers. Do NOT run critique for components marked `status: "skipped"`.

6. **CRITIQUE PROOF (hook-enforced):** Each of the 4 key components MUST have: (1) `critiqueReportPath` to an existing `critique-report.json`; (2) `critiqueIterations >= 1`; (3) `screenshotSourcePath` and `screenshotMigratedPath` to actual PNGs. The hook verifies and **BLOCKS** if any of the 4 is missing proof.

7. **Optional full critique:** If the customer wants critique for the remaining (skipped) components, run it later or target them individually. Do not block completion on them.

**When the customer asks to critique the rest:** List all components with `status: "skipped"` from `style-register.json` (desktop) and `mobile/mobile-style-register.json` (mobile). For each skipped component, run **nav-component-critique** with that component's `id` (and the correct viewport: desktop 1440×900 or mobile 375×812). Update the register entry to `status: "validated"` when similarity ≥ 95% and critique proof exists. You can run multiple skipped components in parallel (e.g. several mcp_task calls) or one-by-one; targeting by component ID is supported.

### Step 15: Final Pre-Confirmation Gate + Report

1. **Final gate (MUST pass before reporting to customer):** Verify:
   - [ ] `blocks/header/navigation-validation/megamenu-behavior-register.json` exists, `allValidated: true`
   - [ ] `blocks/header/navigation-validation/schema-register.json` exists, `allValidated: true`
   - [ ] `blocks/header/navigation-validation/style-register.json` exists, `allValidated: true` — **4 key components** (key-critique-top-bar-desktop, key-critique-nav-links-row-desktop, key-critique-mobile-header-bar, key-critique-mobile-menu-root-panel) have `status: "validated"` with critique proof; all other components may be `status: "skipped"`
   - [ ] `blocks/header/navigation-validation/mobile/mobile-schema-register.json` exists, `allValidated: true`
   - [ ] `mobile/missing-content-register.json` (if exists) — all items `resolved: true`; mobile-only content in nav.plain.html styled to not impact desktop
   - [ ] `blocks/header/navigation-validation/mobile/mobile-style-register.json` exists, `allValidated: true` — 2 key mobile components validated with critique proof; rest may be `status: "skipped"`
   - [ ] **CSS fixes from the 4 critique reports have been applied** (header.css / header.js updated per reports)
   - [ ] `blocks/header/navigation-validation/mobile/mobile-heading-coverage.json` exists, `allCovered: true`
   - [ ] `blocks/header/navigation-validation/mobile/mobile-behavior-register.json` exists, `allValidated: true`, every item tap/click/animation matches source
   - [ ] Hamburger → cross animation works (visually confirmed via screenshots)
   - [ ] All mobile animation speeds match source (hamburger transition, accordion/slide-in duration, back button reverse)
   - [ ] No unwanted overlays on desktop or mobile
   - [ ] CSS breakpoint correctly triggers mobile layout
   - [ ] `header.js` has viewport resize / matchMedia handling (close mobile menus on desktop resize, reset hamburger, re-init desktop hover)
   - [ ] Search form detection: `hasSearchForm` field present in phase-2 rows AND phase-4 mobile JSON. If desktop has search but mobile doesn't, confirm mobile intentionally hides it.
   - [ ] Locale selector detection: `hasLocaleSelector` field present in phase-2 rows AND phase-4 mobile JSON. If `hasFlags=true`, verify flag images are downloaded to `content/images/` and referenced in `nav.plain.html`. Locale styling (dropdown layout, flag sizing, current-locale highlight) must match source exactly.
   - [ ] **Review `debug.log`:** Confirm ALL milestones, scripts, and critique reports for the 4 key components are present.
   - [ ] **Mobile dimensional gate passed:** Either `blocks/header/navigation-validation/mobile/mobile-dimensional-gate-report.json` exists with `"passed": true`, or run `node scripts/mobile-dimensional-gate.js --url=<migrated-url> --validation-dir=blocks/header/navigation-validation` and fix CSS until it passes (exit 0). Do not announce completion if the gate has not passed.
2. **Run pre-completion check (MANDATORY — do NOT skip):** Run `node scripts/pre-completion-check.js [--validation-dir=blocks/header/navigation-validation]` from the skill workspace (or pass workspace root as first argument). This script independently verifies that the 4 key components have `status: "validated"`, `lastSimilarity >= 95`, and critique proof on disk — the LLM cannot game this.
   - **If exit code 1:** Do **NOT** send the completion message. Show the user: **"Doing a final validation…"** and continue fixing. Re-run Step 14 remediation (apply CSS/JS fixes from critique reports, re-run nav-component-critique for any component still below 95%). Then run `pre-completion-check.js` again. Repeat until exit code 0.
   - **If exit code 0:** Only then proceed to step 3.
3. **Report to customer — Nav migration completion (desktop + mobile):** Announce: **"Nav migration complete — desktop + mobile.** The 4 key components (top bar desktop, nav links row desktop, mobile header bar, mobile menu root panel) have been critiqued and CSS fixes applied. All validation registers are complete." Then add: **"We critiqued only these 4 components to keep the run time manageable — a full critique of every nav item (megamenu panels, accordion items, etc.) can take hours. If you want the rest critiqued, say so and we can target each skipped component individually (e.g. by component ID from the style registers)."**

## Output Contract (Strict)

Aggregate into a single JSON object only. No free-text explanation in intermediate steps; optional summary allowed only in final user-facing response.

```json
{
  "headerStructure": {},
  "desktopMapping": {},
  "mobileMapping": {},
  "megamenuMapping": {},
  "validationReport": {},
  "status": "PASS | FAIL"
}
```

- `status`: **PASS** only when all checkpoints passed and validation-agent reports no mismatch requiring re-analysis.

## Modular Navigation Mode

**Activate when:** `header rows > 3` OR `megamenu columns > 4` OR `nested levels > 2`.

- Each row is treated as a separate module.
- Each megamenu column can be an independent block.
- Validation performed **per module** via inline per-component critique (step 14 — 4 key components in parallel; remaining may be skipped or critiqued on request).

## Schema Validation

Validate all sub-agent output with `node scripts/validate-output.js <output.json> <schema.json>`. Exit non-zero = do not proceed. Schemas: `references/desktop-navigation-agent-schema.json`, `references/mobile-navigation-agent-schema.json`, `references/megamenu-schema.json`, `references/validation-agent-schema.json`.

## Implementation (EDS)

- **Desktop (steps 1–7):** Download images for `hasImages: true` elements → write `content/nav.plain.html` (NOT root) → run `validate-nav-content.js` (must exit 0) → implement `header.js`/`header.css` → validate megamenu behavior FIRST, structural SECOND → customer confirmation.
- **Mobile (steps 8–12):** Phase 4 analysis (hamburger animation, accordion/slide-in-panel, ALL headings) → implement mobile CSS/JS → structural validation → heading coverage → behavior register.
- **Targeted critique (step 14):** Visual critique for 4 key components in parallel (top bar, nav links row [desktop]; mobile header bar, mobile menu root panel [mobile]); remediate until 95%+ each; final gate + report. Remaining components may be skipped; customer can request critique by component ID later.
- **Content-first:** ALL text/links/labels in `content/nav.plain.html`. JS only reads and renders — never generates text.

## Example

**User says:** "Migrate header from https://example.com"

**Actions:** Steps 1–3 (phases) → step 4 (implement desktop: images + nav.plain.html + header.css/js) → step 5 (megamenu behavior FIRST) → step 6 (structural SECOND) → step 7 (customer confirmation) → steps 8–12 (mobile: analysis + implement + validate + heading coverage + behavior) → step 13 (build style registers) → step 14 (targeted visual critique — 4 key components in parallel) → step 15 (final gate + report).

**Result:** Desktop + mobile header matches source — all registers validated. The 4 key components have 95%+ with critique proof; remaining components may be skipped. Images downloaded. `content/nav.plain.html` written.

## Testing

**Trigger (use this skill):** "Migrate header from https://example.com", "Instrument navigation for the header", "Validate nav structure from this screenshot", "Set up header/nav from [URL]".  
**Paraphrased:** "We need the site header migrated with desktop and mobile", "Can you replicate this site’s navigation in EDS?".  
**Do NOT use for:** Simple link lists without screenshot evidence; pages not yet migrated (use excat-page-migration first); general page layout or footer work.

**Functional:** Run full flow; confirm all phase JSONs + registers under `blocks/header/navigation-validation/`; the 4 key critique components 95%+ with proof (rest may be skipped); mobile only after desktop confirmation. Validate with `scripts/validate-output.js` and `scripts/compare-structural-schema.js --threshold=95 --output-register`.

## Enforcement (Two Layers — Script + Hook)

- **Layer 1 — Scripts:** (1) `node scripts/validate-nav-content.js content/nav.plain.html blocks/header/navigation-validation` — MANDATORY after every nav.plain.html write (exit 0 = pass). (2) `node scripts/audit-header-images.js content/nav.plain.html blocks/header/navigation-validation` — MANDATORY after validate-nav-content; compares expected image count (phase-2/3 + megamenu-mapping) to actual images in nav and on disk; reports missingByLocation if gap; exit 0 and `.image-audit-passed` required.
- **Layer 2 — Hook:** `hooks/nav-validation-gate.js` — PostToolUse gates + Stop checks covering desktop + mobile (including image audit: blocks until audit-header-images.js has run and passed). Logs tagged `[DESKTOP]`/`[MOBILE]`/`[CRITIQUE]`/`[VIEWPORT]`/`[SEARCH]`/`[LOCALE]`/`[MISSING-CONTENT]`/`[PANEL-LAYOUT]`/`[IMAGE-AUDIT]` to `blocks/header/navigation-validation/debug.log` with WORKFLOW PROGRESS DASHBOARD.
- Full gate details in hook file comments and `references/reference-index.md`.

## References

Full reference index: **`references/reference-index.md`** — schemas, scripts, registers, critique, enforcement.

**Key schemas:** `references/desktop-navigation-agent-schema.json`, `references/mobile-navigation-agent-schema.json`, `references/megamenu-schema.json`, `references/validation-agent-schema.json`.
**Key scripts:** `scripts/validate-output.js`, `scripts/validate-nav-content.js`, `scripts/audit-header-images.js`, `scripts/detect-header-rows.js`, `scripts/detect-mobile-structure.js`, `scripts/compare-megamenu-behavior.js`, `scripts/compare-row-elements-behavior.js`, `scripts/compare-header-appearance.js`, `scripts/compare-structural-schema.js`, `scripts/compare-mobile-structural-schema.js`, `scripts/mobile-dimensional-gate.js`, `scripts/pre-completion-check.js`.

## Troubleshooting

See **`references/troubleshooting.md`** for common issues (sub-agent rejection, gate blocks, register failures, missing images, wrong mobile patterns, overlay mismatches).

## Do NOT

- Suggest UX improvements, redesign layout, simplify megamenu, or normalize spacing without validation.
- Auto-correct structure without validation confirmation.
- Write nav.plain.html to root — must be `content/nav.plain.html`; must include all images for `hasImages: true` elements; must run `validate-nav-content.js` then `audit-header-images.js` afterward (MANDATORY; fix and re-run if exit non-zero). The image audit compares expected count (phase-2/3 + megamenu-mapping) to actual; blocks until no gap.
- Create nav.plain.html or header implementation **before** the desktop aggregate is written (after Phase 3).
- Proceed to Phase 4 (mobile) **before** customer confirms desktop; request confirmation **before** passing the pre-confirmation gate (step 7).
- Skip any phase (1–3) or skip writing phase JSON to `blocks/header/navigation-validation/`.
- Deliver desktop with raw bullet lists / no CSS — full styling and megamenu images required.
- Assume nav items have no hover — test hover and click separately for every item; set `hasHoverBehavior`/`hasClickBehavior` from evidence.
- Proceed while any register component is pending or below 95%.
- Mark a component as "validated" below 95%; use "EDS constraints" excuses to bypass the threshold.
- Self-assess similarity without running critique (`lastSimilarity: 95` without screenshots = hook BLOCKS).
- Skip deep megamenu mapping — every item must be individually hovered and clicked.
- Skip panelLayoutDetails when any panel exists — add viewportContained, overlayBehavior, measured values (getBoundingClientRect), and CSS positioning to megamenu-mapping and migrated-megamenu-mapping per trigger (every dropdown, small or large); compare-megamenu-behavior validates. Do NOT self-assess viewportContained — use measured values.
- Skip header-appearance-mapping — create for ALL headers (hasChanges: false if no change); run compare-header-appearance.js; require allValidated before mobile.
- Call missing images "EDS simplification" — if source has images, nav.plain.html MUST have them.
- Ignore the hamburger/breadcrumb icon — track click, hover, and animation (hamburger → cross) in phase-2 and phase-4.
- Add overlays the source doesn't have — megamenu overlay must match source exactly (none, semi-transparent, blur).
- Skip mobile validation — mobile MUST follow the same structural + style validation flow as desktop.
- Use accordion expand-in-place when source uses slide-in-panel — these are different patterns. Match the source.
- Let mobile-only content affect desktop — mobile missing content must be hidden on desktop (display:none default, show only in @media for mobile breakpoint).
- Hardcode megamenu text/links/labels in header.js — ALL content (text, links, category names, sub-menu items, specs, promotional copy) belongs in `content/nav.plain.html`. JS only reads and presents it.
- Proceed when source has content missing from nav.plain.html — if you notice "source had X that wasn't included", STOP and add X to nav.plain.html. The source site is authoritative; do NOT assert nav.plain.html is correct when it omits source content.
- Hardcode country names or flag URLs in header.js — locale selector content (country names, flag image refs) belongs in `content/nav.plain.html`; header.js only reads from nav DOM and implements behavior; header.css handles layout.
- Use pipe-delimited or custom formats for images — ALL images MUST use `<img src="images/filename.ext" alt="...">` in nav.plain.html; header.js reads paths from nav DOM.
- Create site-specific function names (e.g. `buildProductsMegamenu`, `buildCategoryAPanel`) — ALL functions in header.js MUST be generic and reusable. Use data-driven patterns that read from nav DOM, not functions named after source site categories or sections.
---
name: nav-component-critique
description: Per-component visual critique for header navigation elements. Captures source and migrated screenshots, compares visually, scores similarity, generates CSS fixes, and iterates until 95%. Called by excat-navigation-orchestrator Step 14 for the 4 key components (and optionally for skipped components on customer request). Invoke for "critique nav component", "validate header component styling", "compare component source vs migrated". Do NOT use for full-page or full-block critique (use excat-page-critique instead), non-header components, or when no style-register exists.
metadata:
  version: "1.0"
---

# Nav Component Critique

Capture, compare, score, and fix individual header components until each reaches 95% visual similarity to the source site. **Extract the exact styles from the source site so we match them precisely.** Do not skip steps A–G; iterate until ≥ 95% before marking validated. Do NOT delegate to `excat:excat-block-critique` or `excat:excat-page-critique` — those target whole blocks/pages and cannot scope to individual header sub-items.

## When to Use

- Called by the **Navigation Orchestrator** Step 14 for the 4 key components (in parallel), and for any component in `style-register.json` or `mobile/mobile-style-register.json` with `status: "pending"` or `status: "skipped"` when the customer requests full/skipped-component critique.
- **Step 14:** Orchestrator invokes 4 subagents in parallel using `key-component-agents/*.md` for the 4 key components only.
- **Skipped components (on customer request):** When the customer asks to critique the remaining components, the orchestrator lists all entries with `status: "skipped"` in `style-register.json` and `mobile/mobile-style-register.json`, then invokes this skill once per skipped component (pass the component `id` and correct viewport). Desktop components use viewport 1440×900 and `critique/{id}/`; mobile use 375×812 and `mobile/critique/{id}/`.
- Can also be invoked directly: "critique nav component row-0-logo", "validate megamenu-trigger-0 styling".

## 4 Key Component Subagents (Step 14 — MANDATORY parallel)

For **Step 14 (Targeted Visual Critique)**, the orchestrator **MUST** invoke **4 subagents in parallel**, each running the critique workflow for exactly one key component. Each subagent uses a dedicated instruction file; the orchestrator must **not** run these 4 sequentially.

| # | Instruction file | componentId | Viewport |
|---|------------------|--------------|----------|
| 1 | `key-component-agents/critique-top-bar-desktop.md` | `key-critique-top-bar-desktop` | 1440×900 |
| 2 | `key-component-agents/critique-nav-links-row-desktop.md` | `key-critique-nav-links-row-desktop` | 1440×900 |
| 3 | `key-component-agents/critique-mobile-header-bar.md` | `key-critique-mobile-header-bar` | 375×812 |
| 4 | `key-component-agents/critique-mobile-menu-root-panel.md` | `key-critique-mobile-menu-root-panel` | 375×812 |

- **Location:** All 4 files live under `nav-component-critique/key-component-agents/`. See `key-component-agents/README.md` for paths and invocation rules.
- **Orchestrator mandate:** In one turn, launch 4 concurrent tasks (e.g. 4 `mcp_task` calls), each with one of the above `.md` files as the task instruction (e.g. via attachments or prompt). Each subagent follows its `.md` and the parent SKILL steps A–G for that component only. Do **not** run component 2 after component 1 finishes — start all 4 together.

## Input

| Field | Source | Description |
|-------|--------|-------------|
| `componentId` | style-register.json `id` | e.g. `row-0-logo`, `megamenu-trigger-0-item-0-widget-x` |
| `sourceUrl` | session.json | URL of original site |
| `migratedUrl` | session.json | `http://localhost:3000{migratedPath}.html` |
| `phase2Json` | `blocks/header/navigation-validation/phase-2-row-mapping.json` | Row elements for selector derivation |
| `phase3Json` | `blocks/header/navigation-validation/phase-3-megamenu.json` | Megamenu structure |
| `megamenuMappingJson` | `blocks/header/navigation-validation/megamenu-mapping.json` | Deep per-item behavior for selector derivation |

## Prerequisites

- Migrated site running at `http://localhost:3000`.
- Source site accessible.
- Playwright MCP available for screenshot capture and DOM interaction.
- `style-register.json` already built by the orchestrator (Step 13, register-building phase).

---

## Step A: Determine Component Selectors

Derive the CSS or xpath selector that isolates this component on BOTH the source page and the migrated page:

| Component Pattern | Source Selector (derive from DOM inspection) | Migrated Selector (derive from EDS markup) |
|---|---|---|
| `row-0-logo` | Inspect header logo element (e.g. `xpath=/html/body[1]/header[1]/div[1]/a[1]/img[1]`) | `.header .nav-brand img` or equivalent |
| `row-0-cta` | Inspect CTA button element | `.header .nav-tools a.button` or equivalent |
| `row-0-nav-links` | Inspect nav links container | `.header .nav-sections > ul` |
| `row-{n}-search` | Inspect search input/container | `.header .nav-tools .search-wrapper` or equivalent |
| `row-{n}-icons` | Inspect icon group | `.header .nav-tools .icon-group` or equivalent |
| `megamenu-trigger-{i}` | Hover trigger to open panel, then select the panel container | `.header .nav-sections .megamenu-panel:nth-child({i+1})` |
| `megamenu-trigger-{i}-item-{j}` | Within opened panel, select specific item (e.g. image-card) | Equivalent DOM element inside migrated megamenu panel |
| `megamenu-trigger-{i}-featured` | Featured/hero image area inside the panel | Equivalent in migrated |
| `megamenu-trigger-{i}-tab-{j}` | Category tab element | Equivalent in migrated |
| `megamenu-trigger-{i}-item-{j}-sub-{k}` | Nested sub-item within a panel item | Equivalent in migrated |
| `buttons-cta-{n}` | Specific CTA button on source | `.header a.button:nth-of-type({n+1})` |

**Store** both `sourceSelector` and `migratedSelector` in the style register entry for audit.

**XPath format:** MUST use full positional xpath with `xpath=` prefix: `xpath=/html/body[1]/div[1]/...`. NEVER use attribute-based xpaths like `//*[@id]` or `//*[@class]`.

---

## Step B: Prepare Interaction State

Some components are only visible after interaction. Perform the required interaction BEFORE capturing:

| Component Type | Interaction Required |
|---|---|
| Megamenu panel (any `megamenu-trigger-*`) | Hover the nav trigger to open the panel. Wait for animation. |
| Dropdown sub-menu | Hover the parent item to reveal children. |
| Category tab content (`megamenu-trigger-{i}-tab-{j}`) | Click the specific tab to show filtered content. |
| Featured area with hover-update | Hover the relevant item to trigger the featured area change (e.g. hover a product card to update the left image). |
| Hover states (any component with hover styling) | Hover the element to capture hover appearance. |

Use Playwright MCP to perform the interaction, wait for animation/transition to complete, then proceed to capture.

Record the interaction in the style register entry as `interactionRequired` (e.g. `"hover nav-trigger-0 to open panel"`).

---

## Step C: Capture Source Component Screenshot

1. Navigate to `sourceUrl` using Playwright MCP.
2. Dismiss overlays (cookie banners, popups) if needed.
3. Perform interaction from Step B if required.
4. Screenshot the component using `sourceSelector`.
5. Save screenshot to: `blocks/header/navigation-validation/critique/{componentId}/source.png`

Create the directory `critique/{componentId}/` if it doesn't exist.

---

## Step D: Capture Migrated Component Screenshot

1. Navigate to `migratedUrl` using Playwright MCP.
2. Perform the SAME interaction from Step B.
3. Screenshot the component using `migratedSelector`.
4. Save screenshot to: `blocks/header/navigation-validation/critique/{componentId}/migrated.png`

---

## Step E: Compare and Score (Visual — PRIMARY)

Use **LLM visual comparison** of `source.png` vs `migrated.png` as the primary scoring method. **Extract the exact styles from the source site so we match them precisely.** Compare the two screenshots side-by-side and score every visible difference.

### E1. Visual Comparison

Place `source.png` and `migrated.png` side by side. Evaluate:
- **Colors:** Background, text, border, shadow — exact match?
- **Typography:** Font family, size, weight, line-height — match?
- **Spacing:** Padding, margin, gap between elements — match?
- **Sizing:** Width, height of elements — match?
- **Layout:** Flex/grid alignment, element ordering — match?
- **Images:** Present, correct size, correct position — match?
- **Icons/SVGs:** Correct icon, correct color, correct size?
- **Borders:** Width, radius, color, style — match?
- **Hover/active states:** If interaction was performed, does the visual state match?
- **Animations:** If visible in screenshots, do transitions match?

### E2. Scoring

Score each visible difference:

| Category | Dissimilarity Score |
|---|---|
| Font size < 2px | 0.1–0.2 |
| Spacing < 4px | 0.1–0.2 |
| Color same hue, slight shade | 0.2–0.3 |
| Color completely different | 0.6–0.8 |
| Layout flexbox/grid changed | 0.5–0.6 |
| Element missing entirely | 0.9–1.0 |
| Image missing or wrong | 0.8–1.0 |
| Border radius mismatch | 0.2–0.4 |
| Shadow missing or wrong | 0.2–0.3 |
| Wrong icon/SVG | 0.5–0.7 |

`similarity = 1.0 - avg(dissimilarity_scores)` expressed as percentage.

### E3. Write Critique Report

Write `blocks/header/navigation-validation/critique/{componentId}/critique-report.json` with:
```json
{
  "componentId": "{componentId}",
  "similarity": 92.5,
  "differences": [
    { "property": "background-color", "source": "#00aad2", "migrated": "#ffffff", "severity": "HIGH" },
    { "property": "border-radius", "source": "24px", "migrated": "0px", "severity": "HIGH" }
  ],
  "css_fixes": [
    { "selector": ".header .nav-tools a.button", "property": "background-color", "value": "#00aad2", "priority": "HIGH" },
    { "selector": ".header .nav-tools a.button", "property": "border-radius", "value": "24px", "priority": "HIGH" }
  ],
  "grade": "Good — needs minor fixes",
  "viewport": "desktop",
  "timestamp": "2026-02-21T22:30:00Z"
}
```

### E4. Grading

| Score | Grade |
|---|---|
| >= 95% | Excellent — validated |
| 85–94% | Good — needs minor fixes |
| 70–84% | Fair — needs significant fixes |
| < 70% | Poor — major rework needed |

### E5. Viewport Support

This critique runs for BOTH viewports:
- **Desktop (1440×900):** Standard desktop critique for all `style-register.json` components.
- **Mobile (375×812):** Mobile critique for all `mobile/mobile-style-register.json` components.

When running for mobile, set `viewport` field in the critique report to `"mobile"` and save to `blocks/header/navigation-validation/mobile/critique/{componentId}/`.

---

## Step F: Update Style Register

In `blocks/header/navigation-validation/style-register.json`, update the entry for this component:

| Field | Value |
|---|---|
| `lastSimilarity` | Percentage from E4 |
| `critiqueIterations` | Increment by 1 |
| `critiqueReportPath` | `blocks/header/navigation-validation/critique/{componentId}/critique-report.json` |
| `screenshotSourcePath` | `blocks/header/navigation-validation/critique/{componentId}/source.png` |
| `screenshotMigratedPath` | `blocks/header/navigation-validation/critique/{componentId}/migrated.png` |
| `sourceSelector` | Selector used on source page |
| `migratedSelector` | Selector used on migrated page |
| `interactionRequired` | Interaction performed (or null) |
| `status` | `"validated"` if >= 95%, else `"pending"` |

After updating components, recalculate `allValidated`: when using the 4-key flow, `allValidated: true` when the 4 key components have `status: "validated"` (rest may be `skipped`); when running full critique, `allValidated: true` when every component has `status: "validated"`.

---

## Step G: Remediation (when component < 95%)

Do NOT skip. Do NOT ask user. Do NOT explain why it's hard. Follow this cycle:

### G1. Identify Delta
Read `critique-report.json` → `differences[]` and `css_fixes[]`. Note which CSS properties or JS behaviors differ from source.

### G2. Fix CSS
Open `blocks/header/header.css`. Find or add selectors for this component. **Extract the exact styles from the source site so we match them precisely.** Edit to match source exactly:
- Colors (background, text, border, shadow colors)
- Spacing (padding, margin, gap)
- Sizing (width, height, font-size, line-height)
- Border (width, radius, color, style)
- Shadows (box-shadow values)
- Fonts (family, weight, style)
- Backgrounds (color, image, gradient)
- Transitions (property, duration, timing)

### G3. Fix JS
If behavioral differences exist (hover effects, transitions, panel behavior, class toggles):
- Open `blocks/header/header.js`
- Add or fix event listeners, CSS class toggles, DOM manipulation
- Match source interaction behavior exactly

### G4. Re-capture and Re-score
1. Go back to **Step D** (recapture migrated screenshot — source stays the same from Step C).
2. Then **Step E** (re-compare and re-score).
3. Write updated `critique-report.json`.

### G5. Update Register
Write new scores to `style-register.json` (Step F).

### G6. Repeat
If still < 95%, go back to G1. Do NOT stop until >= 95% or user explicitly accepts.

---

## Output

Per component, the following files are produced in `blocks/header/navigation-validation/critique/{componentId}/` (desktop) or `blocks/header/navigation-validation/mobile/critique/{componentId}/` (mobile):

| File | Description |
|------|-------------|
| `source.png` | Screenshot of source component |
| `migrated.png` | Screenshot of migrated component |
| `critique-report.json` | Full comparison report with similarity, differences, CSS fixes, viewport |

The style register entry is updated in `blocks/header/navigation-validation/style-register.json`.

---

## Applies To

This skill runs for EVERY component in the style register:
- **Rows:** logo, nav-links, CTA buttons, search, icons
- **Megamenu:** overall panel, each trigger, each panel item (image-cards, links), each sub-item, each category tab, each featured area
- **Buttons:** every CTA button individually

---

## Rules

- **95% target per component.** 70%, 85%, 90% = NOT validated.
- **No self-assessment.** You MUST capture actual screenshots and compare them. Writing `lastSimilarity: 95` without real screenshots = hook will BLOCK.
- **No "EDS constraints" excuses.** If the source has rounded buttons, the migrated must too. If the source has hover-to-zoom, the migrated must too.
- **Proof required.** Every validated component must have: `critiqueReportPath` (existing file), `screenshotSourcePath` (existing PNG), `screenshotMigratedPath` (existing PNG), `critiqueIterations >= 1`. The hook verifies all four and blocks if any is missing.
- **No delegation.** Do NOT call `excat:excat-block-critique` or `excat:excat-page-critique`. This skill replaces them for navigation components.

## Example

**User says:** "Critique nav component row-0-cta"

**Actions:** (A) Derive selector for the CTA button on both source and migrated pages. (B) No interaction needed (static button). (C) Navigate to source URL, screenshot the CTA via Playwright, save to `critique/row-0-cta/source.png`. (D) Navigate to migrated localhost, screenshot same CTA, save to `critique/row-0-cta/migrated.png`. (E) Compare screenshots visually → similarity = 82%, differences: `border-radius` (source 24px, migrated 0px), `background-color` (source #00aad2, migrated #fff). Write `critique-report.json` with fixes. (F) Update style-register: `status: "pending"`, `lastSimilarity: 82`, `critiqueIterations: 1`. (G) Apply CSS fixes to `header.css`, re-capture migrated screenshot, re-compare → similarity = 97%. Update register: `status: "validated"`, `lastSimilarity: 97`, `critiqueIterations: 2`.

**Result:** `critique/row-0-cta/` contains `source.png`, `migrated.png`, `critique-report.json`; style-register entry shows 97% with proof paths.

## Testing

**Trigger (use this skill):** "Critique nav component row-0-logo", "Validate header component styling for megamenu-trigger-0", "Compare component source vs migrated for row-1-search".
**Paraphrased:** "Check if the CTA button matches the original", "Run visual comparison on the nav links".
**Do NOT use for:** Full-page critique, footer components, non-header elements, or when `style-register.json` does not exist.

**Functional:** Run for one component; confirm `critique/{componentId}/` folder has `source.png`, `migrated.png`, `critique-report.json`; confirm style-register entry updated with paths and score.

## Do NOT

- Run full-page or full-block critique — this skill is per-component only.
- Accept self-assessed similarity scores without screenshots on disk.
- Skip the remediation loop — iterate until 95% or exhaust max iterations.
- Critique non-header components (footer, hero, cards) — use excat-page-critique instead.
- Report "EDS constraints" as justification for scores below 95%.

## Troubleshooting

| Issue | Cause | Action |
|-------|-------|--------|
| Can't find source selector | DOM structure unclear | Use Playwright to inspect elements; build full positional xpath from DOM traversal |
| Megamenu panel not visible | Interaction not performed | Hover the trigger first (Step B); wait for animation before screenshot |
| Similarity stuck below 95% | Multiple small differences | Apply ALL CSS fixes from critique report, not just HIGH priority; re-run |
| Screenshots don't match component | Wrong selector | Re-inspect DOM on both source and migrated; verify selector isolates correct element |
| Hook blocks with "missing screenshot" | PNG not saved to expected path | Verify path matches `blocks/header/navigation-validation/critique/{componentId}/source.png` exactly |

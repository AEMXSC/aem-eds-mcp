# Navigation validation — gates & hooks summary

This document maps the current navigation orchestrator policy (4 key critique components, split-link, parallel subagents, completion message, skipped components) to the gates and hooks that enforce it. Use it to confirm nothing is missing.

---

## 1. Four key critique components (Step 14)

**Policy:** Exactly 4 components are critiqued before completion: top bar desktop, nav links row desktop, mobile header bar, mobile menu root panel. All other components may be `status: "skipped"`. Completion requires the 4 to be `validated` with ≥95% and critique proof; no component may remain `pending`.

| Enforcement | Where | What it does |
|-------------|--------|----------------|
| **KEY_CRITIQUE_IDS** | `hooks/nav-validation-gates/checks.js` | `KEY_CRITIQUE_IDS_DESKTOP` = 2 IDs; `KEY_CRITIQUE_IDS_MOBILE` = 2 IDs. Used by `checkStyleRegister` and `checkMobileRegisters`. |
| **checkStyleRegister** | `checks.js` | Requires style-register to exist; `allValidated` true; no component `pending`; each validated component `lastSimilarity >= 95%`; both desktop key IDs present and `status: "validated"`; runs `checkCritiqueProof` (report + screenshots + iterations on disk). |
| **checkMobileRegisters** | `checks.js` | When phase-4 exists: requires mobile-style-register; `allValidated` true; no mobile component `pending`; both mobile key IDs present and `status: "validated"`; validated components ≥95%; runs same semantics for mobile. |
| **checkCritiqueProof** | `checks.js` | For every component with `status: "validated"` in style-register: critiqueReportPath (file exists), screenshotSourcePath (exists), screenshotMigratedPath (exists), critiqueIterations >= 1. |
| **checkMobileCritiqueProof** | `checks.js` | Same for mobile-style-register validated components. |
| **Gate 3+4** | `gate-table.js` | When **style-register.json** is written: runs `checkCritiqueProof`. Blocks if any validated component lacks proof. |
| **Gate 7-8-12** | `gate-table.js` | When **mobile-style-register.json** is written: runs `checkMobileCritiqueProof`; also checks mobile-schema-register and mobile-heading-coverage exist and allCovered. |
| **Stop check** | `nav-validation-gate.js` | At session end: runs `checkStyleRegister`, `checkMobileRegisters`, `checkMobileCritiqueProof`. Also: **no `pending`** in style-register (replaced old "all components must be validated" with "pending not allowed"). |
| **Schema** | `references/style-register-schema.json` | `status` enum includes `"skipped"`. `allValidated` description updated: true when 4 key are validated; rest may be skipped. |

---

## 2. Split-link pattern (mobile, Gate 14c)

**Policy:** Every `phase-4-mobile.json` `mobileMenuItems` entry must have `splitLinkPattern` with `textClickBehavior` and `chevronClickBehavior`.

| Enforcement | Where | What it does |
|-------------|--------|----------------|
| **Gate 14** | `gate-table.js` | When **phase-4-mobile.json** is written: hasSearchForm, hasLocaleSelector (14/14b); **Gate 14c**: every `mobileMenuItems` entry must have `splitLinkPattern`; **Gate 14d**: `menuItemsWidthLayout` required (full-width-flush \| centered-with-margins \| constrained-max-width \| unknown). Logs `[MOBILE] phase-4 menuItemsWidthLayout validated` to debug.log. |
| **Stop check** | `nav-validation-gate.js` | When phase-4 exists: validates `menuItemsWidthLayout` present and valid; logs `[MOBILE] phase-4 menuItemsWidthLayout: <value>` to debug.log. |
| **Dashboard** | `workflow-progress.js` | WORKFLOW PROGRESS DASHBOARD includes `menuItemsWidthLayout: <value>` under MOBILE when phase-4 exists. |
| **Schema** | `references/mobile-navigation-agent-schema.json` | `mobileMenuItems.items` required includes `"splitLinkPattern"`; `splitLinkPattern` required `["textClickBehavior", "chevronClickBehavior"]`; top-level `menuItemsWidthLayout` required. |

---

## 3. Parallel 4 subagents (Step 14)

**Policy:** The orchestrator must invoke 4 critique subagents in parallel (same turn), each using one of the 4 instruction files under `nav-component-critique/key-component-agents/`.

| Enforcement | Where | What it does |
|-------------|--------|----------------|
| **SKILL + key-component-agents** | `SKILL.md` Step 14, `nav-component-critique/SKILL.md`, `key-component-agents/*.md` | Instructions mandate 4 concurrent task invocations (e.g. 4 mcp_task calls), one per .md file. No programmatic gate (LLM-driven); hooks ensure outcome: all 4 key components must be validated with proof or Stop check blocks. |
| **Reference** | `references/validation-artifacts.md`, `key-component-agents/README.md` | Document the 4 files and "launch 4 in one turn". |

---

## 4. 95% and final validation (pre-completion check)

**Policy:** The 4 key components must reach ≥95% similarity with full critique proof for completion. Before announcing "Nav migration complete," the LLM must run `pre-completion-check.js`; if it exits 1, show "Doing a final validation…" and continue fixing — do not send the completion message.

| Enforcement | Where | What it does |
|-------------|--------|----------------|
| **pre-completion-check.js** | `scripts/pre-completion-check.js` | Standalone script: checks style-register + mobile-style-register for 4 key components (status validated, lastSimilarity ≥ 95, critique proof on disk). Exit 0 = safe to announce; exit 1 = block completion message. SKILL Step 15 mandates run before report. |
| **checkStyleRegister / checkMobileRegisters** | `checks.js` | For any component with `status: "validated"`, errors if `lastSimilarity < SIMILARITY_THRESHOLD` (95). |
| **checkCritiqueProof / checkMobileCritiqueProof** | `checks.js` | Validated components must have report + both screenshots on disk and critiqueIterations >= 1. |
| **Stop check** | `nav-validation-gate.js` | Runs the above; when block occurs, appends `[HOOK:PREMATURE-COMPLETION]` to debug.log for audit. Session cannot pass until resolved. |

---

## 5. Completion message and "critique rest later"

**Policy:** After the 4 critique fixes, show "Nav migration complete — desktop + mobile" and state that only these 4 were critiqued (time); customer can request critique of skipped components by component ID.

| Enforcement | Where | What it does |
|-------------|--------|----------------|
| **Step 15 report text** | `SKILL.md` | Exact wording for completion message and the "only 4 critiqued… target each skipped component individually" pointer. |

---

## 6. Critiquing skipped components on customer request

**Policy:** When the customer asks to critique the rest, the LLM lists all `status: "skipped"` from both style registers and runs nav-component-critique for each (by component ID and viewport).

| Enforcement | Where | What it does |
|-------------|--------|----------------|
| **Step 14 bullet** | `SKILL.md` | "When the customer asks to critique the rest…" instruction: list skipped, invoke nav-component-critique per id/viewport, update to validated when ≥95%. |
| **nav-component-critique** | `nav-component-critique/SKILL.md` | "When to Use" states skipped components (on customer request): orchestrator lists skipped, invokes skill per component id + viewport. |

---

## 7. Mobile dimensional gate (live DOM width checks)

**Policy:** Before marking mobile validation complete, run live DOM measurements so menu list and nav items span full viewport width. Structural and visual-similarity checks alone can miss bugs (e.g. .nav-list 199px vs 375px viewport).

| Enforcement | Where | What it does |
|-------------|--------|----------------|
| **mobile-dimensional-gate.js** | `scripts/mobile-dimensional-gate.js` | Standalone script: set viewport 375×812, open hamburger, run getBoundingClientRect/getComputedStyle. 7 categories, 24 checks: menu list width = viewport, each nav-item width = viewport, edge-to-edge alignment, chevron alignment, container chain widths, computed font-size/weight, secondary nav width. Writes `mobile/mobile-dimensional-gate-report.json` when `--validation-dir` is set. Exit 0 = pass, 1 = fail, 2 = usage/runner error. |
| **Gate 7-8-12 (PostToolUse)** | `gate-table.js` | When **mobile-style-register.json** is written: runs `checkMobileDimensionalGate(workspaceRoot)`. Blocks until `mobile/mobile-dimensional-gate-report.json` exists and `passed === true`. LLM cannot build mobile style register until the script has been run and passed. |
| **Stop check** | `nav-validation-gate.js` + `checks.js` | When phase-4 exists: runs `checkMobileDimensionalGate`. If report missing or `passed !== true`, blocks session end with remediation (run script, fix CSS, re-run until exit 0). |
| **SKILL** | Step 12 (mobile validation) + Step 15 checklist | Run `node scripts/mobile-dimensional-gate.js --url=<migrated-url> [--validation-dir=...]` before building style registers (Step 13). Step 15: confirm gate passed — hook enforces this. |
| **browser_evaluate** | During migration | Paste `runGate(375)` (or runGate with config) into Playwright/browser_evaluate after opening the mobile menu; helpers must be injected — see script header. |

---

## 8. Gate and Stop check quick reference

| Gate ID | Trigger file | Purpose |
|---------|--------------|---------|
| WORKFLOW_START_MESSAGE | session.json | Block session.json until it contains `workflowStartMessageDisplayed: true`. LLM must display `references/workflow-start-message.md` to the user first, then write session.json with that flag. |
| 18 | Critique artifact (e.g. critique-report.json) | Block critique until all prerequisites (session, phase 1–5, nav, header.css/js, schema-register, megamenu/row-elements/header-appearance registers, style-register, mobile when phase-4) |
| 19 | style-register.json or mobile-style-register.json | Block building style registers until desktop + mobile validation complete (`checkStyleRegistersPrerequisites`) |
| 3+4 | style-register.json | Critique proof for validated components; prerequisites (megamenu/row-elements/schema register) |
| 5 | phase-5-aggregate.json | Block aggregate if style-register has *all* components at 0% (does not block 4 validated + rest skipped) |
| 7-8-12 | mobile-style-register.json | Mobile critique proof; mobile-schema-register and mobile-heading-coverage |
| 14 | phase-4-mobile.json | hasSearchForm, hasLocaleSelector, **Gate 14c** splitLinkPattern per mobileMenuItems entry |
| **mobile-dimensional-gate** | Script (run before Step 13) | `scripts/mobile-dimensional-gate.js --url=<migrated>`. Live DOM width checks at 375×812; writes `mobile/mobile-dimensional-gate-report.json`. SKILL mandates run and pass before building style registers / completion. |
| **Mobile structure detection** | Gate 6e + Stop | When phase-4 exists: require `mobile/.mobile-structure-detection-complete`. Run `detect-mobile-structure.js --url=<source>` (375×812). Same as desktop: programmatic row/item count before structural validation. When mobile has extra content, add to nav.plain.html mobile-only section and mobile missing-content-register. |

**Desktop vs mobile structural validation (aligned):** Desktop: (1) **programmatic** row count via `detect-header-rows.js`, (2) phase-2 row mapping, (3) `compare-structural-schema.js`. Mobile now has the same pattern: (1) **programmatic** row and item count via `detect-mobile-structure.js` (viewport 375×812, writes `mobile/mobile-structure-detection.json` and `.mobile-structure-detection-complete`), (2) migrated-mobile-structural-summary in the **same shape** (rowCount, rows with itemCount, topLevelMenuItemCount), (3) `compare-mobile-structural-schema.js` (source = mobile-structure-detection, migrated = migrated-mobile-structural-summary) → mobile-schema-register. **Hook:** Gate and Stop require `.mobile-structure-detection-complete` when phase-4 exists; block message tells user to run detect-mobile-structure.js first. **When mobile has extra rows/items or images/text not on desktop:** add to nav.plain.html in a mobile-only section and to mobile missing-content-register; hook blocks until resolved.

**Row/height gates (Stop + PostToolUse):** ROW_LANDMARK_PARITY (phase-2.rows.length >= phase-1.rowCount when phase-2 written). HEADER_HEIGHT_SANITY (phase-1.heightMismatch blocks; re-run detect-header-rows.js and implement all rows). FEATURE_CARD_COMPLETENESS (megamenu-mapping must document featureCard when source-image-manifest has bgImages). IMAGE_PARITY (when both source and migrated image manifests exist, audit-header-images.js --compare must have run and passed).

**Nav section structure:** validate-nav-content.js requires nav.plain.html to have **at least 2 top-level `<div>` sections**. Putting all content in a single `<div>` breaks the header block and DA when uploaded; the script fails until there are at least 2 sections.

**Image audit (Gate 6a2 + Stop):** After nav.plain.html exists and validate-nav-content.js has run, audit-header-images.js must run and pass. It compares expected image count (phase-2/3 + megamenu-mapping panel items with hasImage, feature cards) to actual images in nav and on disk. Writes `image-audit-report.json` (missingByLocation when gap). Block until `.image-audit-passed` exists. Stop check: `checkImageAudit(workspaceRoot)`.

**Stop check (session end):** style-register (no pending, 4 key validated, 95% + proof), schema-register, megamenu/row-elements/header-appearance registers, **image audit passed**, mobile registers (same for mobile style: no pending, 2 key validated + proof), **mobile-dimensional-gate passed** (report exists and `passed: true`), mobile critique proof, hamburger/slide-in/heading-coverage, viewport resize, search/locale detection, etc. Blocks with remediation list if any check fails.

---

## 9. Files touched in this set of changes

- **Hooks:** `nav-validation-gates/checks.js`, `nav-validation-gates/gate-table.js`, `nav-validation-gate.js`, `nav-validation-gates/workflow-progress.js`
- **Schemas:** `references/style-register-schema.json`, `references/mobile-navigation-agent-schema.json` (splitLinkPattern already required)
- **Skill:** `SKILL.md` (Steps 12, 14, 15; completion message; skipped-component instruction; mobile-dimensional-gate)
- **Scripts:** `scripts/mobile-dimensional-gate.js` (live DOM width checks; run before Step 13 / completion)
- **Critique:** `nav-component-critique/SKILL.md`, `nav-component-critique/key-component-agents/*.md`, `key-component-agents/README.md`
- **References:** `validation-artifacts.md`, `reference-index.md`, this summary

---

## 10. Consistency checks done (re-validated)

- **allValidated:** Schema and checks interpret it as "true when 4 key validated; rest may be skipped". Stop check no longer requires "every component validated" (pending not allowed instead).
- **Gate 5:** Only blocks when *all* components have 0% similarity (`zeroCount === components.length`); 4 validated + rest skipped passes (zeroCount < length).
- **Skipped:** Allowed in style-register and mobile-style-register; workflow-progress shows "X validated, Y pending, Z skipped" when Z > 0.
- **Split-link:** Enforced by Gate 14c and mobile schema; SKILL Phase 4 describes the mandate. Empty `mobileMenuItems` is allowed (Gate 14c loop does not block).
- **95%:** `SIMILARITY_THRESHOLD = 95` in `helpers.js`; used by checkStyleRegister and checkMobileRegisters for validated components.
- **Stop check:** style-register only checked when `phase-4-mobile.json` exists (full flow). Desktop + mobile registers and mobile critique proof all run when phase-4 exists.

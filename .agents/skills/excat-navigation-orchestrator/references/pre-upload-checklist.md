# Pre-Upload Checklist — excat-navigation-orchestrator

Per `docs/skill-development-guide.md` Section 8.

## Before you start

- [x] Identified 2–3 concrete use cases
- [x] Tools identified (built-in or MCP): Playwright MCP, validate-output.js, validate-nav-content.js, compare-* scripts
- [x] Reviewed skill development guide and example skills
- [x] Planned folder structure: SKILL.md, scripts/, references/, sub-agents (desktop-navigation-agent, megamenu-analysis-agent, mobile-navigation-agent, validation-agent, nav-component-critique)

## During development

- [x] Folder name in kebab-case: `excat-navigation-orchestrator`
- [x] `SKILL.md` exists (exact spelling)
- [x] YAML frontmatter has `---` delimiters
- [x] `name`: kebab-case, no spaces, no capitals
- [x] `description`: WHAT and WHEN, no XML (no `<` or `>`)
- [x] Instructions clear and actionable
- [x] Error handling included (references/troubleshooting.md, gate blocks)
- [x] Examples provided (User says / Actions / Result)
- [x] References clearly linked (reference-index.md)

## Before upload

- [x] Trigger tests: "Migrate header from URL", "Instrument navigation", "Validate nav structure"
- [x] Functional tests: validate-output.js passes with phase-1/phase-3 sample JSON
- [x] Tool integration works: validate-nav-content.js runs with content/nav.plain.html (requires phase-2/3; enforces prerequisites)
- [ ] Compressed as `.zip` if required by target

## After upload

- [ ] Test in real conversations
- [ ] Monitor over/under-triggering
- [ ] Collect feedback and iterate
- [ ] Update version in metadata when you change the skill

## Validation vs docs/skill-development-guide.md

- **Structure:** SKILL.md (exact name), references/, scripts/ — no README at skill root (key-component-agents/README.md is a subfolder reference for the 4 critique agents).
- **Naming:** Folder `excat-navigation-orchestrator` is kebab-case; frontmatter `name` matches.
- **Frontmatter:** `---` delimiters present; `description` has WHAT + WHEN + trigger phrases; no XML in description. Description length may exceed 1024 chars (guide suggests under 1024); consider shortening if upload rejects.
- **Instructions:** Step-by-step with examples; critical rules at top (Zero-Hallucination Rules); explicit checklists (e.g. Step 15 final gate); error handling via troubleshooting.md and hook blocks; references linked from SKILL (validation-artifacts.md, reference-index.md — one level deep).
- **SKILL.md size:** ~516 lines (guide suggests &lt;~500 lines). Consider moving one short section to references/ to get under 500; content in references/ for deep detail.
- **Patterns:** Sequential workflow with validation gates; hooks provide deterministic checks; iterative refinement (critique until 95%+). Phase 4 `menuItemsWidthLayout` enforced by Gate 14d. Mobile: detect-mobile-structure.js, compare-mobile-structural-schema.js, mobile-dimensional-gate.js, pre-completion-check.js (guide: “consider bundled scripts / deterministic rules” for critical checks).
- **Pre-upload checklist:** Completed for “Before you start” and “During development”; “Before upload” has trigger/functional checks; zip and “After upload” left for deploy time.

## Notes

- **validate-output.js:** Converted to ESM (import/export) for project compatibility.
- **Key scripts:** detect-header-rows.js (Phase 1 — MANDATORY), **detect-mobile-structure.js** (Step 5b — MANDATORY when phase-4 exists; programmatic row/item count at 375×812; writes mobile/mobile-structure-detection.json + .mobile-structure-detection-complete; hook blocks until run), validate-output.js, validate-nav-content.js (content/nav.plain.html only; nav.md not supported; enforces ≥2 top-level section divs), compare-megamenu-behavior.js, compare-row-elements-behavior.js, compare-header-appearance.js (includes headerBackgroundBehavior), compare-structural-schema.js, **compare-mobile-structural-schema.js** (source + migrated mobile structure → mobile-schema-register; when mobile has extra content, add to nav.plain.html mobile-only section and mobile missing-content-register), **mobile-dimensional-gate.js** (live DOM width at 375×812; hook requires passed before completion), **pre-completion-check.js** (Step 15 — run before announcing completion; exit 0 = safe to report, exit 1 = show "Doing a final validation…").
- **Workflow start message:** First user message is in `references/workflow-start-message.md`. SKILL mandates: read and output before session.json; session.json must include `workflowStartMessageDisplayed: true`. Gate WORKFLOW_START_MESSAGE blocks session.json until flag is set.
- **Step 14:** Targeted Visual Critique — 4 key components in parallel (key-component-agents/*.md); remaining components may be skipped; customer can request critique by component ID later.
- **Step 8 / Phase 4:** `menuItemsWidthLayout` required in phase-4-mobile.json (full-width-flush | centered-with-margins | constrained-max-width | unknown). Gate 14d blocks write if missing; Stop check and dashboard log it. Ensures mobile menu width (flush vs centered) is captured for CSS parity.
- **Mobile-only content:** When mobile has extra rows, items, or images/text not on desktop, add to nav.plain.html in a mobile-only section (e.g. class shown only in @media for mobile); record in mobile/missing-content-register.json and set resolved: true. Hook blocks until all resolved.

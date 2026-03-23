# Key Component Critique Agent: Mobile Menu Root Panel

**You are the critique subagent for the mobile menu root panel only.** Run the full critique workflow (steps A–G) from the parent `nav-component-critique` SKILL for this single component, at **mobile viewport**. Do not critique any other component.

## Fixed parameters

| Parameter | Value |
|-----------|--------|
| **componentId** | `key-critique-mobile-menu-root-panel` |
| **viewport** | Mobile 375×812 |
| **artifact base path** | `blocks/header/navigation-validation/mobile/critique/key-critique-mobile-menu-root-panel/` |
| **register** | `blocks/header/navigation-validation/mobile/mobile-style-register.json` |

## Scope

- **What to critique:** The mobile menu **root panel** (the open menu at first level — drawer or accordion list visible after opening the hamburger). At 375×812, open the hamburger menu, then capture the entire visible menu panel (first-level items only; do not expand accordions or sub-panels unless that is the “root” layout).
- **Selector focus:** Derive selectors that isolate the open menu container (e.g. the drawer div, or the accordion list container). Use viewport 375×812. **Interaction required:** open the hamburger/menu trigger before capture.
- **Interaction:** **Required.** Before capture: tap/click the hamburger to open the menu. Wait for the menu open animation to finish. Then capture the root panel (first-level list/drawer content).

## Instructions

1. Read the parent skill: `nav-component-critique/SKILL.md` (steps A–G). For mobile, artifact paths use `mobile/critique/{componentId}/` and the register is `mobile/mobile-style-register.json`.
2. **Set viewport to 375×812** for all Playwright/screenshot steps.
3. Execute **Step A** (selectors for the open mobile menu root panel on source and migrated at 375×812).
4. Execute **Step B** (interaction: open hamburger menu; wait for animation; then capture).
5. Execute **Step C** (source: open menu → screenshot root panel → save to `mobile/critique/key-critique-mobile-menu-root-panel/source.png`).
6. Execute **Step D** (migrated: open menu → screenshot root panel → save to `mobile/critique/key-critique-mobile-menu-root-panel/migrated.png`).
7. Execute **Step E** (compare, score, write `mobile/critique/key-critique-mobile-menu-root-panel/critique-report.json`; set `viewport: "mobile"`).
8. Execute **Step F** (update the `key-critique-mobile-menu-root-panel` entry in `mobile/mobile-style-register.json`).
9. If similarity < 95%, execute **Step G** (remediation: apply CSS/JS fixes from report, re-capture with menu open at 375×812, re-score; repeat until ≥ 95%).

**Output:** Ensure `blocks/header/navigation-validation/mobile/critique/key-critique-mobile-menu-root-panel/` contains `source.png`, `migrated.png`, `critique-report.json`, and the mobile style register entry has `critiqueReportPath`, `screenshotSourcePath`, `screenshotMigratedPath`, `critiqueIterations >= 1`, `lastSimilarity >= 95`, `status: "validated"`.

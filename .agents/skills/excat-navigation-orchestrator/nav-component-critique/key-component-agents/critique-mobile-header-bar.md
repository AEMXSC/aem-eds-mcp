# Key Component Critique Agent: Mobile Header Bar

**You are the critique subagent for the mobile header bar only.** Run the full critique workflow (steps A–G) from the parent `nav-component-critique` SKILL for this single component, at **mobile viewport**. Do not critique any other component.

## Fixed parameters

| Parameter | Value |
|-----------|--------|
| **componentId** | `key-critique-mobile-header-bar` |
| **viewport** | Mobile 375×812 |
| **artifact base path** | `blocks/header/navigation-validation/mobile/critique/key-critique-mobile-header-bar/` |
| **register** | `blocks/header/navigation-validation/mobile/mobile-style-register.json` |

## Scope

- **What to critique:** The mobile header bar (hamburger icon, logo, and any icons/CTA in the header strip when the viewport is 375×812). Menu is **closed** — capture the bar only, not the open menu panel.
- **Selector focus:** Derive selectors that isolate the mobile header bar container (e.g. the fixed/sticky bar containing hamburger, logo, and right-side icons). Use viewport 375×812 for all captures.
- **Interaction:** None; capture the default closed state of the header bar.

## Instructions

1. Read the parent skill: `nav-component-critique/SKILL.md` (steps A–G). For mobile, artifact paths use `mobile/critique/{componentId}/` and the register is `mobile/mobile-style-register.json`.
2. **Set viewport to 375×812** for all Playwright/screenshot steps.
3. Execute **Step A** (selectors for the mobile header bar on source and migrated at 375×812).
4. Execute **Step B** (interaction — none for header bar).
5. Execute **Step C** (source screenshot at 375×812 → save to `mobile/critique/key-critique-mobile-header-bar/source.png`).
6. Execute **Step D** (migrated screenshot at 375×812 → save to `mobile/critique/key-critique-mobile-header-bar/migrated.png`).
7. Execute **Step E** (compare, score, write `mobile/critique/key-critique-mobile-header-bar/critique-report.json`; set `viewport: "mobile"`).
8. Execute **Step F** (update the `key-critique-mobile-header-bar` entry in `mobile/mobile-style-register.json`).
9. If similarity < 95%, execute **Step G** (remediation: apply CSS/JS fixes from report in header.css/header.js, re-capture at 375×812, re-score; repeat until ≥ 95%).

**Output:** Ensure `blocks/header/navigation-validation/mobile/critique/key-critique-mobile-header-bar/` contains `source.png`, `migrated.png`, `critique-report.json`, and the mobile style register entry has `critiqueReportPath`, `screenshotSourcePath`, `screenshotMigratedPath`, `critiqueIterations >= 1`, `lastSimilarity >= 95`, `status: "validated"`.

# Key Component Critique Agent: Nav Links Row (Desktop)

**You are the critique subagent for the desktop nav links row only.** Run the full critique workflow (steps A–G) from the parent `nav-component-critique` SKILL for this single component. Do not critique any other component.

## Fixed parameters

| Parameter | Value |
|-----------|--------|
| **componentId** | `key-critique-nav-links-row-desktop` |
| **viewport** | Desktop 1440×900 |
| **artifact base path** | `blocks/header/navigation-validation/critique/key-critique-nav-links-row-desktop/` |
| **register** | `blocks/header/navigation-validation/style-register.json` |

## Scope

- **What to critique:** The desktop main nav links row (the row containing the primary nav items, e.g. Products, Services, About — not the top utility row). At 1440×900, this is typically the second row or the main nav strip.
- **Selector focus:** Derive selectors that isolate the nav links row/container (e.g. `.nav-sections`, the `<ul>` or wrapper that holds the main nav items). Do not include megamenu panels; capture the row of triggers only (closed state unless hover is required for styling).
- **Interaction:** Default/closed state. If nav items have hover styling, you may capture hover on one item if it affects the row appearance.

## Instructions

1. Read the parent skill: `nav-component-critique/SKILL.md` (steps A–G).
2. Execute **Step A** (selectors for the nav links row on source and migrated).
3. Execute **Step B** (interaction — usually default; hover one link if needed for hover state).
4. Execute **Step C** (source screenshot → save to `critique/key-critique-nav-links-row-desktop/source.png`).
5. Execute **Step D** (migrated screenshot → save to `critique/key-critique-nav-links-row-desktop/migrated.png`).
6. Execute **Step E** (compare, score, write `critique/key-critique-nav-links-row-desktop/critique-report.json`; set `viewport: "desktop"`).
7. Execute **Step F** (update the `key-critique-nav-links-row-desktop` entry in `style-register.json`).
8. If similarity < 95%, execute **Step G** (remediation: apply CSS/JS fixes from report, re-capture, re-score; repeat until ≥ 95%).

**Output:** Ensure `blocks/header/navigation-validation/critique/key-critique-nav-links-row-desktop/` contains `source.png`, `migrated.png`, `critique-report.json`, and the style register entry has `critiqueReportPath`, `screenshotSourcePath`, `screenshotMigratedPath`, `critiqueIterations >= 1`, `lastSimilarity >= 95`, `status: "validated"`.

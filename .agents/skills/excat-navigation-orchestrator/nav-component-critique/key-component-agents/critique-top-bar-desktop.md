# Key Component Critique Agent: Top Bar (Desktop)

**You are the critique subagent for the desktop top bar only.** Run the full critique workflow (steps A–G) from the parent `nav-component-critique` SKILL for this single component. Do not critique any other component.

## Fixed parameters

| Parameter | Value |
|-----------|--------|
| **componentId** | `key-critique-top-bar-desktop` |
| **viewport** | Desktop 1440×900 |
| **artifact base path** | `blocks/header/navigation-validation/critique/key-critique-top-bar-desktop/` |
| **register** | `blocks/header/navigation-validation/style-register.json` |

## Scope

- **What to critique:** The desktop top bar (first row): logo, utility nav, locale/search/icons if present — the full first horizontal row of the header at 1440×900.
- **Selector focus:** Derive selectors that isolate the entire first row/container of the header (e.g. first row wrapper, not individual logo/CTA).
- **Interaction:** Usually none; capture default state. If the source top bar has hover/active states that change appearance, note and capture as needed.

## Instructions

1. Read the parent skill: `nav-component-critique/SKILL.md` (steps A–G).
2. Execute **Step A** (selectors for this top-bar container on source and migrated).
3. Execute **Step B** (interaction — typically none for top bar).
4. Execute **Step C** (source screenshot → save to `critique/key-critique-top-bar-desktop/source.png`).
5. Execute **Step D** (migrated screenshot → save to `critique/key-critique-top-bar-desktop/migrated.png`).
6. Execute **Step E** (compare, score, write `critique/key-critique-top-bar-desktop/critique-report.json`; set `viewport: "desktop"`).
7. Execute **Step F** (update the `key-critique-top-bar-desktop` entry in `style-register.json`).
8. If similarity < 95%, execute **Step G** (remediation: apply CSS/JS fixes from report, re-capture, re-score; repeat until ≥ 95%).

**Output:** Ensure `blocks/header/navigation-validation/critique/key-critique-top-bar-desktop/` contains `source.png`, `migrated.png`, `critique-report.json`, and the style register entry has `critiqueReportPath`, `screenshotSourcePath`, `screenshotMigratedPath`, `critiqueIterations >= 1`, `lastSimilarity >= 95`, `status: "validated"`.

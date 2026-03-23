# 4 Key Component Critique Subagents

Step 14 of the navigation orchestrator **MANDATES** running critique for exactly 4 key components **in parallel** by invoking **4 subagents**, each with one of the instruction files below.

## Subagent instruction files (invoke one per parallel task)

| # | Instruction file | componentId | Viewport | Register |
|---|------------------|-------------|----------|----------|
| 1 | `critique-top-bar-desktop.md` | `key-critique-top-bar-desktop` | 1440×900 | style-register.json |
| 2 | `critique-nav-links-row-desktop.md` | `key-critique-nav-links-row-desktop` | 1440×900 | style-register.json |
| 3 | `critique-mobile-header-bar.md` | `key-critique-mobile-header-bar` | 375×812 | mobile-style-register.json |
| 4 | `critique-mobile-menu-root-panel.md` | `key-critique-mobile-menu-root-panel` | 375×812 | mobile-style-register.json |

## How the orchestrator must invoke them

- **In a single turn**, launch **4 concurrent subagent tasks** (e.g. 4 `mcp_task` tool calls).
- Each task receives **one** of the above `.md` files as its instruction set (e.g. via prompt or attachments).
- Each subagent runs the critique workflow (steps A–G from the parent `nav-component-critique/SKILL.md`) for **that component only**.
- Do **not** run the 4 sequentially; start all 4 together so they execute in parallel.

## Paths (relative to skill root or workspace)

- Desktop artifacts: `blocks/header/navigation-validation/critique/{componentId}/`
- Mobile artifacts: `blocks/header/navigation-validation/mobile/critique/{componentId}/`

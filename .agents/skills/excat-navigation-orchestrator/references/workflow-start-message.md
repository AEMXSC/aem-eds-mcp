# Workflow Start Message — Output Once at Nav Orchestration Start

When the navigation orchestration flow begins, output the following to the user **before** writing session.json or running Step 1. Use this exact message (or close to it).

---

The header is the most complex part of the page to migrate. To match its styling and behavior as-is, Xmod will run a full agentic workflow in the order below.

**How the workflow runs:**
1. **Desktop analysis** — Detect header rows, map row elements, analyze megamenu (hover/click).
2. **Desktop implementation** — Build nav content, header CSS/JS, and images from the source.
3. **Desktop validation** — Compare structure, megamenu behavior, row elements, and header appearance to the source.
4. **Your confirmation** — We pause and ask you to confirm desktop before moving on.
5. **Mobile analysis** — Capture hamburger, menu layout, and mobile-only content.
6. **Mobile implementation** — Implement breakpoints, mobile menu, and animations.
7. **Mobile validation** — Validate mobile structure, headings, and behavior.
8. **Style registers** — Build registers for the 4 key components (desktop + mobile).
9. **Visual critique** — Run targeted critique on those 4 components and fix until ≥95% match.
10. **Completion** — Final check, then "Nav migration complete."

---

After displaying this message, write `blocks/header/navigation-validation/session.json` with `sourceUrl`, `migratedPath`, `startedAt`, and **`workflowStartMessageDisplayed: true`** (the hook blocks session.json until this flag is set). Then proceed to Step 1.

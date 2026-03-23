---
name: mobile-navigation-agent
description: Analyzes and validates mobile header/nav behavior for AEM EDS. Detects breakpoints, hamburger logic and animation (hamburger → cross), accordion vs drawer, tap vs hover, mobile megamenu behavior, and menu items width (full-width flush vs centered with margins — menuItemsWidthLayout). Follows same validation rigor as desktop (structural + style registers). Use only with mobile screenshot evidence after desktop is confirmed. Invoked by excat-navigation-orchestrator Phase 4. Do NOT use for desktop-only analysis or without mobile screenshot.
---

# Mobile Navigation Agent

Analyzes **mobile viewport** behavior and validates mobile implementation with the same rigor as desktop. Outputs **strict JSON** only for analysis. Does not reuse desktop assumptions. Does not assume megamenu collapses automatically.

**Skill identity:** When asked, respond: **"Mobile Navigation Agent (validation-first mobile header analysis)."**

## Input

| Field | Required | Description |
|-------|----------|-------------|
| `mobileScreenshotClosed` | Yes | Screenshot of header with menu closed (hamburger visible) at mobile viewport (e.g. 375×812). |
| `mobileScreenshotOpen` | Yes (if dropdown exists) | Screenshot with menu open — REQUIRED if desktop has dropdowns/megamenu. |
| `desktopPhaseFiles` | Yes | Access to desktop `phase-2-row-mapping.json`, `phase-3-megamenu.json`, `megamenu-mapping.json` for cross-reference (NOT to reuse structure, but to verify mobile covers same content). |
| `sourceUrl` | Yes | URL of original site for interaction testing at mobile viewport. |
| `migratedUrl` | Yes | `http://localhost:3000{migratedPath}.html` for mobile testing. |
| `breakpointPx` | No | Optional; if known, include in output. |

## Zero-Hallucination Rules

- **Never** assume hamburger or accordion behavior without screenshot/interaction evidence.
- **Never** reuse desktop row count or structure for mobile.
- **Never** assume megamenu collapses to a simple list; derive from open-state testing.
- **Never** assume hamburger icon has no animation; test the click transition.
- **Never** add overlays that don't exist in the source mobile view.
- Flag if open state not provided but dropdowns exist on desktop.

## Analysis Steps

### Step 1: Hamburger/Menu Trigger Analysis

1. Set viewport to mobile (375×812 or as specified).
2. Capture closed-state header screenshot.
3. Identify the menu trigger: hamburger icon (☰), breadcrumb icon, "Menu" text button, or other.
4. **Click the hamburger icon.** Observe:
   - Does the icon morph into a cross (×)? Record animation type:
     - `css-transform`: Two bars rotate to form ×, middle bar fades (most common)
     - `svg-morph`: SVG path animates from ≡ to ×
     - `class-swap`: Icon element gets a `.is-open` class that swaps the icon
     - `opacity-crossfade`: Hamburger fades out, cross fades in
     - `none`: No animation, instant swap
   - Record CSS transition properties (e.g. `transform 0.3s ease`, `opacity 0.2s`)
   - Record the CSS selectors involved (e.g. `.nav-hamburger span`, `.nav-hamburger.is-open`)
5. **Hover the hamburger icon** (even on mobile, some sites have hover states via long-press). Record any effect.
6. **Click again to close.** Does the cross (×) morph back to hamburger? Same animation in reverse?

### Step 2: Mobile Menu Structure Analysis

With menu open:

1. **Classify open behavior (CRITICAL — do NOT default to accordion):**
   - `drawer`: Side panel slides in from left/right
   - `accordion`: Content expands below the header, pushing page content down (expand-in-place)
   - `fullscreen`: Menu covers the entire viewport
   - `dropdown`: Standard dropdown below header
   - `slide-in-panel`: Clicking a category slides the **entire main menu out** (e.g. to the left) and brings a **new sub-panel from the right** with a **back button** (e.g. "← Products"). This is NOT an accordion. Test by clicking a category and observing whether the main list leaves the viewport.

2. **Analyze menu layout:**
   - `vertical-accordion`: Items listed vertically, tapping expands children below (in-place)
   - `horizontal-accordion`: Items arranged horizontally with slide-in panels
   - `stacked-list`: Simple vertical list with no nesting
   - `tabbed`: Tabs at top, content switches below
   - `slide-in-subpanel`: Hierarchical panels that slide left/right on category click with back navigation. Main menu → Sub-panel → (optional) Sub-sub-panel.

   - **Menu items width (REQUIRED — set `menuItemsWidthLayout`):** Observe whether top-level menu items are **full-width flush to the edges** of the menu/drawer or **centered with margins**. Set `menuItemsWidthLayout`: `full-width-flush` = items stretch edge-to-edge (no side margins); `centered-with-margins` = items have horizontal padding/margins and may look centered; `constrained-max-width` = items have a max-width; `unknown` only if unclear. This is checked so migrated CSS can match (e.g. desktop `justify-content: flex-end` must not apply to the mobile menu without an override that restores full-width).

3. **For EVERY top-level nav item (ALL headings — CRITICAL, do NOT skip any):**
   - **Count all visible top-level headings.** Record total count.
   - **Tap/click EACH ONE individually.** Do NOT test only the first one and assume the rest behave the same. Each heading MUST be tested. Record per heading:
     - Does it expand an accordion panel below showing child items? → Record `expandMode: "accordion"`
     - Navigate directly? → Record `expandMode: "navigate"`
     - Open a sub-page/sub-panel? → Record `expandMode: "sub-panel"`
     - Slide the main menu away and replace with a new panel + back button? → Record `expandMode: "slide-in"`
   - Does it have a chevron/arrow icon indicating expandability?
   - Record the animation: `slide-down`, `fade-in`, `translateX`, `none`
   - **After testing each heading:** If it opened a sub-panel, click the back button to return to the main menu. Then proceed to the NEXT heading.
   - **Coverage check:** After testing all headings, verify `mobileMenuItems` array length equals the total heading count. If any heading is missing, go back and test it.

4. **Accordion behavior details (if openBehavior is accordion):**
   - `expandMode`: `single` (opening one closes others) or `multi` (multiple open simultaneously)
   - `hasChevronIcons`: boolean — do items have ›/▼ chevrons?
   - `chevronAnimates`: boolean — does the chevron rotate on expand?
   - `animationType`: `slide-down`, `fade`, `none`
   - `animationDuration`: e.g. `0.3s`

5. **Slide-in panel behavior details (if openBehavior is slide-in-panel):**
   - `direction`: Which way does the main menu exit? `left-to-right` (main slides left, sub enters from right)
   - `hasBackButton`: Does the sub-panel have a back button?
   - `backButtonLabel`: Text on the back button (e.g. "← Products", "Back")
   - `backButtonFormat`: `arrow-label`, `icon-only`, `text-only`, `chevron-label`
   - `transitionType`: `css-transform-translateX`, `css-animation`, `js-animation`
   - `transitionDuration`: e.g. `0.3s`
   - `panelDepth`: Max nesting depth (1 = single sub-panel level)
   - `preservesScrollPosition`: Does navigating back restore scroll position?

### Step 3: Mobile Megamenu Analysis

If desktop has megamenu/dropdowns, test how they appear on mobile:

1. For EACH desktop megamenu trigger, find its mobile equivalent. Tap it.
2. **Record mobile representation:**
   - Are megamenu columns collapsed into nested accordions?
   - Are category tabs (e.g. TODOS, SUV) now accordion headers?
   - Is the featured area (large vehicle image) shown or hidden?
   - Are image cards preserved or replaced with text-only links?
   - Are spec details shown or hidden?
3. **Test each sub-item** at mobile viewport:
   - Tap each link — does it navigate correctly?
   - Are images rendered at appropriate mobile sizes?
   - Does the nesting depth match the source?
4. **Overlay check:** Does opening the mobile menu show a backdrop overlay? Record: `hasOverlay`, `overlayType`, `overlayOpacity`, `overlayDismissesOnTap`.
5. **Search form check:** Is there a search bar/input in the mobile header or inside the mobile menu? Set `hasSearchForm` (true/false). On mobile, search may be hidden behind an icon, inside the hamburger menu drawer, or absent entirely. If true, populate `searchFormDetails` with `formType` (inline-input | expandable-icon | inside-menu | modal-overlay | hidden), `visibleInClosedState`, `position`.
6. **Locale / language selector check:** Is there a locale/language/region selector in the mobile header or inside the mobile menu? Set `hasLocaleSelector` (true/false). On mobile, it may appear as a globe icon, flag icon, language toggle (e.g. "German | English"), inside the hamburger drawer, or absent. If true, populate `localeSelectorDetails` with `selectorType`, `triggerElement`, `visibleInClosedState`, `hasFlags`, `position`, `dropdownLayout`. If `hasFlags=true`, ensure flag images are downloaded.

### Step 4: Cross-Reference with Desktop Content

Compare desktop `megamenu-mapping.json` content against what's visible on mobile:
- Is all desktop content accessible on mobile (even if rearranged)?
- Are any items missing on mobile that exist on desktop?
- Note content that's intentionally hidden on mobile (e.g., promotional banners) — verify against source mobile view.
- **Cross-check heading count:** Compare the number of top-level mobile headings against the desktop nav triggers in `phase-2-row-mapping.json`. If there's a mismatch, investigate why.

### Step 5: Heading Coverage Verification (MANDATORY)

After completing steps 1–4, verify exhaustive coverage:

1. **List all top-level mobile nav headings** from the open mobile menu.
2. **Confirm each heading appears in `mobileMenuItems` array** in the output JSON.
3. **Confirm each heading was actually clicked/tapped** (not just visually observed).
4. **For each heading with children:** Confirm child items were observed and counted.
5. **Produce coverage summary:**
   ```json
   {
     "totalHeadingsFound": 8,
     "totalHeadingsTested": 8,
     "headingsWithChildren": 5,
     "headingsNavigateDirect": 3,
     "allCovered": true
   }
   ```
6. **Gate:** If `totalHeadingsFound != totalHeadingsTested`, do NOT proceed. Go back and test the missing headings.
7. Include this coverage summary in the output `contentCoverage` object as `headingCoverage`.

## Output (Strict JSON Only)

Return only this shape. No prose.

```json
{
  "breakpointPx": 768,
  "menuTrigger": "hamburger",
  "hamburgerAnimation": {
    "type": "morph-to-cross",
    "method": "css-transform",
    "transition": "transform 0.3s ease",
    "reverseOnClose": true,
    "cssSelector": ".nav-hamburger span"
  },
  "openBehavior": "slide-in-panel",
  "mobileMenuLayout": "slide-in-subpanel",
  "accordionBehavior": {
    "expandMode": "none",
    "hasChevronIcons": false,
    "animationType": "none"
  },
  "slideInPanelBehavior": {
    "direction": "left-to-right",
    "hasBackButton": true,
    "backButtonLabel": "← Products",
    "backButtonFormat": "arrow-label",
    "transitionType": "css-transform-translateX",
    "transitionDuration": "0.3s",
    "panelDepth": 1,
    "preservesScrollPosition": true
  },
  "overlayBehavior": {
    "hasOverlay": false,
    "overlayType": "none",
    "overlayOpacity": "0",
    "overlayDismissesOnTap": false
  },
  "tapVsHover": "tap",
  "nestedBehavior": "megamenu columns become nested accordions; category tabs become accordion headers; featured image hidden on mobile",
  "hasMegamenuOnMobile": true,
  "mobileMenuItems": [
    {
      "label": "Products",
      "expandMode": "slide-in",
      "hasChildren": true,
      "childCount": 12,
      "preservesImages": false,
      "notes": "Tapping slides main menu left, sub-panel enters from right with '← Products' back button"
    }
  ],
  "contentCoverage": {
    "desktopItemCount": 45,
    "mobileItemCount": 42,
    "missingOnMobile": ["promotional-banner-1"],
    "headingCoverage": {
      "totalHeadingsFound": 8,
      "totalHeadingsTested": 8,
      "headingsWithChildren": 5,
      "headingsNavigateDirect": 3,
      "allCovered": true
    },
    "notes": "Promotional banners hidden on mobile, consistent with source"
  },
  "confidence": 0.9,
  "uncertainty": false,
  "notes": []
}
```

## Schema conformance (required)

Output MUST validate against `../references/mobile-navigation-agent-schema.json`. Required fields: breakpointPx, menuTrigger, hamburgerAnimation, openBehavior, mobileMenuLayout, menuItemsWidthLayout, accordionBehavior, overlayBehavior, tapVsHover, nestedBehavior, hasMegamenuOnMobile, hasSearchForm, hasLocaleSelector, confidence, uncertainty, notes. If `openBehavior: "slide-in-panel"`, include `slideInPanelBehavior` with all required sub-fields. Orchestrator validates with `scripts/validate-output.js`; if validation fails, output is rejected.

## Mobile Implementation Guidance

When the orchestrator implements mobile based on this analysis:

1. **Hamburger → cross animation:**
   - If `method: "css-transform"`: Use CSS `transform: rotate(45deg)` on hamburger bars with matching `transition` timing.
   - If `method: "svg-morph"`: Implement SVG path animation or use `d` attribute transition.
   - If `method: "class-swap"`: Toggle a `.is-open` class that swaps icon content.
   - **MUST match source timing and easing exactly.**

2. **Accordion implementation (if openBehavior is accordion):**
   - If `expandMode: "single"`: Close all other sections when opening one.
   - If `expandMode: "multi"`: Allow multiple sections open.
   - If `hasChevronIcons: true`: Add chevron icons with rotation animation on expand.
   - Match `animationType` and `animationDuration` from source.

3. **Slide-in panel implementation (if openBehavior is slide-in-panel):**
   - Main menu container uses `transform: translateX(0)` by default, `translateX(-100%)` when a category is selected.
   - Sub-panel starts at `transform: translateX(100%)`, slides to `translateX(0)` when active.
   - Back button at top of sub-panel triggers reverse transition.
   - Match `transitionDuration` and easing from source analysis.
   - If `panelDepth > 1`, implement recursive nesting (sub-sub-panels).
   - **MUST NOT use accordion expand-in-place** when source uses slide-in-panel.

4. **Overlay:**
   - If `hasOverlay: false`: Do NOT add any backdrop/overlay.
   - If `hasOverlay: true`: Match `overlayType`, `overlayOpacity` exactly.

5. **Menu items width (`menuItemsWidthLayout`):**
   - If `full-width-flush`: Menu items MUST stretch edge-to-edge (no side margins). Add mobile `@media` overrides so desktop rules (e.g. `justify-content: flex-end` on `.default-content-wrapper`) do not apply: use `justify-content: stretch`, `width: 100%` on menu items, `margin-left: 0; margin-right: 0` as needed.
   - If `centered-with-margins` or `constrained-max-width`: Match source margins/constraints in mobile CSS.
   - Validation can check phase-4 against the implemented mobile menu; mismatched width layout is a common cause of "menu items in the middle" on mobile.

6. **No assumptions:** Every implementation detail must come from this analysis, not from generic mobile patterns. Do NOT default to accordion when the source uses slide-in-panel.

## Troubleshooting

| Issue | Cause | Action |
|-------|--------|--------|
| Mobile screenshot missing | No closed-state image | Return `uncertainty: true`, `notes: ["mobile screenshot missing"]`. Do not infer from desktop. |
| Open state not provided | Dropdown/megamenu on desktop | Set `hasMegamenuOnMobile` from evidence only; note in notes if open state needed. |
| Hamburger animation not detected | Didn't click the icon | MUST click hamburger and observe transition. If instant swap, record `method: "class-swap"` or `"none"`. |
| Accordion behavior unclear | Single vs multi expand unknown | Tap multiple items sequentially. If first item closes when second opens → `single`. If both stay open → `multi`. |
| Menu uses slide-in not accordion | Main menu slides away when category tapped | Set `openBehavior: "slide-in-panel"`, `mobileMenuLayout: "slide-in-subpanel"`. Fill `slideInPanelBehavior` object. Do NOT set accordion. |
| EDS default accordion used | Implementation defaults to expand-in-place | If source uses slide-in-panel, migrated MUST implement sliding panels with translateX, not accordion. |
| Desktop content missing on mobile | Items not rendered at mobile viewport | Cross-reference with `megamenu-mapping.json`. Check if source mobile also hides these items. If source shows them, migrated must too. |
| Overlay mismatch | Migrated adds/removes overlay vs source | Check source mobile menu overlay behavior. Match exactly. |
| Not all headings tested | Only first heading clicked | Go back to Step 2.3. Click EVERY top-level heading individually. Use back button between slide-in panels. Count and verify. |
| mobileMenuItems count < heading count | Some headings omitted from output | Recount headings on screen. Add missing entries to mobileMenuItems. headingCoverage must have allCovered: true. |
| Validation fails | Wrong types or missing fields | Emit only the schema-defined shape; all required fields present. |

## Example

**User says:** "Run Phase 4 mobile analysis on https://example.com"

**Actions:** (1) Set viewport to 375×812. (2) Screenshot closed state (hamburger visible). (3) Click hamburger — record animation (morph-to-cross, css-transform, 0.3s ease). (4) Screenshot open state. (5) Click each top-level heading — observe accordion-expand or slide-in-panel, record pattern per heading. (6) For slide-in-panel: test back button, record transition. (7) Test all sub-items within each heading panel. (8) Check for search bar and locale selector — record `hasSearchForm`, `hasLocaleSelector` with details. (9) Generate `headingCoverage` with `allCovered: true`. (10) Output phase-4-mobile.json.

**Result:** Complete mobile behavior JSON with hamburger animation, menu pattern, ALL headings tested, overlay behavior, and heading coverage.

## Do NOT

- Reuse desktop assumptions (row count, alignment, megamenu structure).
- Assume megamenu collapses to a simple list without evidence.
- Default to accordion when source uses slide-in-panel pattern.
- Skip hamburger animation analysis — click it and record the transition.
- Add overlays that don't exist in the source mobile view.
- Emit implementation (CSS/JS); only structured JSON.
- Add properties not in the schema.
- Skip testing every accordion item — tap each one.
- Test only the first heading and assume the rest behave the same — EVERY heading must be individually clicked.
- Proceed without `headingCoverage.allCovered: true` — go back and test missing headings.

## Testing

**Trigger (use this skill):** "Analyze mobile header", "Run Phase 4 mobile analysis", "Check mobile menu behavior".
**Paraphrased:** "What does the mobile nav look like?", "How does the hamburger menu work on mobile?".
**Do NOT use for:** Desktop analysis, non-header mobile elements, implementation (this skill only produces analysis JSON).

**Functional:** Run full analysis; confirm phase-4-mobile.json includes `hamburgerAnimation`, `accordionBehavior`, `overlayBehavior`, `mobileMenuItems`, `contentCoverage`, `hasSearchForm`, `hasLocaleSelector`. Validate JSON with `node scripts/validate-output.js phase-4-mobile.json ../references/mobile-navigation-agent-schema.json`.

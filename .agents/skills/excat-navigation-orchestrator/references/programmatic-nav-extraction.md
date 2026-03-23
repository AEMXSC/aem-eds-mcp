# Programmatic Navigation Extraction

## Deep nesting support

The megamenu schema supports arbitrary nesting depth via recursive `subItems` in `megamenu-mapping-schema.json`. Each `panelItem` can have `subItems` that reference the same structure — so 7 levels (or more) are supported. The bottleneck is **how** we populate the mapping, not the schema.

## Problem: manual click-through

The current SKILL instructs: *"For EVERY item INSIDE each opened panel... hover it individually... click it... drill down until no further interaction is found."* For 339 items across 7 levels, that means hundreds of Playwright clicks and hovers — slow, brittle, and error-prone.

## Solution: extract from pre-rendered data when available

Many modern sites (React, Next.js, etc.) embed the full navigation tree in the page:

| Source | Location | How to extract |
|--------|----------|----------------|
| **Next.js** | `__NEXT_DATA__.props.pageProps.navigation` | `page.evaluate(() => JSON.parse(document.getElementById('__NEXT_DATA__').textContent).props.pageProps.navigation)` |
| **React / other** | DOM (hidden with CSS) | Traverse nav container; sub-panels often pre-rendered, just `display:none` or `visibility:hidden` |
| **SPA hydration** | `window.__INITIAL_STATE__`, `window.__NUXT__`, etc. | Check page source for JSON blobs; extract with `page.evaluate()` |

**One `page.evaluate()` call** can return the entire tree — all levels, all items — instead of clicking through every panel.

## Recommended flow

1. **Before any click-through:** Run `page.evaluate()` to check for:
   - `document.getElementById('__NEXT_DATA__')` → parse and look for `props.pageProps.navigation` (or similar)
   - `window.__INITIAL_STATE__`, `window.__NUXT__`, `window.__APOLLO_STATE__`, etc.
   - DOM: query nav container, recurse into child lists/panels; if structure is present (even hidden), extract it

2. **If full tree found:** Map the extracted JSON/DOM structure into `megamenu-mapping.json` shape. You still need to:
   - Record `hoverBehavior` / `clickBehavior` for triggers (one open per panel type is usually enough)
   - Add `panelLayoutDetails` with measured values (getBoundingClientRect) — open at least one panel per trigger for layout measurement
   - Fill `categoryTabs`, `featuredArea`, `specDetails` if present

3. **If NOT found (dynamic load-on-click):** Fall back to manual click-through as today. Some sites load sub-panels only on interaction; those require the full drill-down.

## Example: Next.js extraction

```javascript
// In Playwright/browser context
const nav = await page.evaluate(() => {
  const el = document.getElementById('__NEXT_DATA__');
  if (!el) return null;
  const data = JSON.parse(el.textContent);
  return data?.props?.pageProps?.navigation ?? null;
});
if (nav) {
  // Flatten or map to megamenu-mapping shape
  // One call, all 339 items, every nesting level
}
```

## What still requires interaction

Even with programmatic extraction:

- **Panel layout:** `panelLayoutDetails` (measuredLeft, measuredRight, viewportWidth, cssPosition, etc.) — open each panel type at least once to measure
- **Hover/click behavior:** Confirm trigger type (hover vs click) and overlay behavior
- **Featured areas, category tabs:** If the extracted tree doesn't include these, a minimal click-through may still be needed

## Summary

| Approach | When | Effort |
|----------|------|--------|
| **page.evaluate(__NEXT_DATA__)** | Next.js, data in page | 1 call |
| **page.evaluate(DOM traversal)** | Pre-rendered nav in DOM (hidden) | 1 call |
| **Manual click-through** | Dynamic load-on-click | N clicks (N = total items) |

Prefer programmatic extraction when the full tree is available; use manual drill-down only when necessary.

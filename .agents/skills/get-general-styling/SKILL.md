# Get General Styling — Design System Extraction Skill

## Purpose

Perform an exhaustive extraction of the original site's design system BEFORE any page migration begins. This ensures that all migrated pages render against the correct visual foundation from the start, rather than against generic EDS boilerplate defaults.

**This skill is a PREREQUISITE for page migration. Run it first.**

## When to Use

- At the very start of any new site migration, before migrating any pages
- When the user says: "migrate", "import", "convert" a site/page — suggest running this first
- When the user explicitly asks to extract design, styling, or CSS from a source site
- When `styles/styles.css` still contains EDS boilerplate defaults

## Scope

This skill extracts and maps **site-wide defaults only** — the visual foundation shared across most pages:

- ✅ CSS custom properties / variables
- ✅ Color palette (backgrounds, text, links, accents, borders)
- ✅ Typography (font families, sizes, weights, line heights, letter spacing, @font-face)
- ✅ Spacing system (margins, paddings, gaps, section spacing)
- ✅ Breakpoints and media queries
- ✅ Layout and container widths
- ✅ Borders, shadows, border-radius
- ✅ Transitions and interactive states (hover, focus)
- ❌ Block-specific styling (handled during block variant creation)
- ❌ Navigation/header/footer styling (handled by dedicated skills)

## Execution Checklist

Every category below is MANDATORY. Do not skip any. Mark each complete only after extraction AND validation.

```
- [ ] Phase 1: Collect raw CSS and computed styles
- [ ] Phase 2: Extract CSS custom properties
- [ ] Phase 3: Extract color palette
- [ ] Phase 4: Extract typography and @font-face
- [ ] Phase 5: Extract spacing system
- [ ] Phase 6: Extract breakpoints and media queries
- [ ] Phase 7: Extract layout and container widths
- [ ] Phase 8: Extract borders, shadows, and border-radius
- [ ] Phase 9: Extract transitions and interactive states
- [ ] Phase 10: Map to EDS custom properties
- [ ] Phase 11: Generate styles/styles.css and styles/fonts.css
- [ ] Phase 12: Validate with preview
```

---

## Phase 1: Collect Raw CSS and Computed Styles

This phase gathers ALL raw material. Everything else depends on this being thorough.

### 1.1 Navigate to the source site

**Tool:** `browser_navigate`

Navigate to the source URL, then wait for fonts, CSS, and lazy-loaded resources to fully load.

**Tool:** `browser_navigate`
```
url: {source URL}
```

**Tool:** `browser_wait_for`
```
time: 5
```

Why 5 seconds: some sites lazy-load CSS or use font services (TypeSquare, Google Fonts) that take a moment to deliver. Waiting too little means missing stylesheets.

### 1.1b Detect CJK / Japanese content

Run this immediately after navigation. The result determines behavior in later phases (font fallbacks, line-height ranges, font service detection).

**Tool:** `browser_evaluate`

```js
() => {
  const html = document.documentElement;
  const lang = (html.getAttribute('lang') || '').toLowerCase();
  const text = document.body?.innerText || '';

  // Detect CJK character ranges in page text
  const cjkChars = (text.match(/[\u3000-\u9FFF\uF900-\uFAFF\u{20000}-\u{2FA1F}]/gu) || []).length;
  const totalChars = text.replace(/\s/g, '').length || 1;
  const cjkRatio = cjkChars / totalChars;

  // Detect common CJK font services
  const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
  const links = Array.from(document.querySelectorAll('link[href]')).map(l => l.href);
  const all = [...scripts, ...links].join(' ');

  const fontServices = {
    typesquare: /typesquare/i.test(all),
    fontplus: /fontplus/i.test(all),
    googleFonts: /fonts\.googleapis/i.test(all),
    typekit: /use\.typekit|fonts\.adobe/i.test(all),
  };

  // Detect CJK font families in computed body style
  const bodyFont = getComputedStyle(document.body).fontFamily;
  const cjkFontPatterns = [
    'noto sans jp', 'noto serif jp', 'noto sans kr', 'noto sans sc', 'noto sans tc',
    'hiragino', 'yu gothic', 'yu mincho', 'meiryo', 'ms pgothic', 'ms pmincho',
    'malgun gothic', 'apple sd gothic', 'simhei', 'simsun', 'microsoft yahei',
    'source han', 'kozuka', 'ipa', 'kinto',
  ];
  const hasCjkFont = cjkFontPatterns.some(p => bodyFont.toLowerCase().includes(p));

  // Determine script type
  let scriptType = 'latin';
  if (lang.startsWith('ja') || (cjkRatio > 0.2 && hasCjkFont)) scriptType = 'japanese';
  else if (lang.startsWith('ko')) scriptType = 'korean';
  else if (lang.startsWith('zh')) scriptType = 'chinese';
  else if (cjkRatio > 0.3) scriptType = 'cjk-unspecified';

  return JSON.stringify({
    lang,
    scriptType,
    cjkRatio: Math.round(cjkRatio * 100) + '%',
    cjkCharCount: cjkChars,
    hasCjkFont,
    bodyFontFamily: bodyFont,
    fontServices,
  }, null, 2);
}
```

Save the returned JSON to `migration-work/cjk-detection.json` using the Write tool.

**Why this matters:**
- **Japanese/CJK sites** need different system font fallbacks (not Arial/Times)
- CJK fonts are much larger (~5-20MB), so they're typically loaded via font services with unicode-range subsetting
- CJK text needs taller `line-height` (1.7–2.0) vs Latin (1.4–1.6)
- Font weight availability is often limited (typically only 400 and 700)
- This detection result is used in Phase 4 (font fallback chains) and Phase 11 (output template)

### 1.2 Fetch all linked stylesheets and inline styles

This is a two-step process. First, discover all CSS sources. Then download each one.

**Step 1 — Discover CSS sources.** Tool: `browser_evaluate`

```js
() => {
  const result = { external: [], inline: [], fontLinks: [] };

  // External stylesheets
  document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
    result.external.push(link.href);
  });

  // Inline style blocks
  document.querySelectorAll('style').forEach((style, i) => {
    result.inline.push({ index: i, content: style.textContent });
  });

  // Preloaded fonts / font service links (capture separately for Phase 4)
  document.querySelectorAll('link[rel="preload"][as="font"], link[href*="fonts.googleapis"], link[href*="use.typekit"], link[href*="typesquare"], link[href*="webfont.fontplus"]').forEach(link => {
    result.fontLinks.push(link.href);
  });

  return JSON.stringify(result, null, 2);
}
```

Save the returned JSON to `migration-work/stylesheet-urls.json` using the Write tool.

**Step 2 — Download each external stylesheet.** Tool: `browser_evaluate`

Fetch all stylesheets from within the browser context (avoids CORS issues):

```js
async () => {
  const urls = [/* paste the external URLs array from Step 1 here */];
  const results = [];
  for (const url of urls) {
    try {
      const resp = await fetch(url);
      const text = await resp.text();
      results.push({ url, css: text, size: text.length });
    } catch (e) {
      results.push({ url, error: e.message, css: '' });
    }
  }
  return JSON.stringify(results);
}
```

**IMPORTANT:** The list of URLs must be pasted literally from the Step 1 output. Do not guess or abbreviate.

If any stylesheet fails to fetch (CORS, 404), note it but continue. Some stylesheets may be third-party (analytics, ad networks) and irrelevant.

**Step 3 — Assemble the corpus.** Tool: Write

Concatenate all fetched CSS (from external results) and all inline style block contents into a single file. Add a comment header before each source for traceability:

```
/* === SOURCE: https://example.com/styles/main.css === */
{css content}

/* === SOURCE: inline style block #0 === */
{inline content}
```

Save to `migration-work/raw-css-corpus.txt`.

### 1.3 Take a full-page screenshot for visual reference

**Tool:** `browser_take_screenshot`
```
fullPage: true
type: png
filename: migration-work/design-reference.png
```

### 1.4 Collect computed styles from representative elements

This runs a single large evaluation that samples every element type needed by later phases. Run it as one call to avoid multiple round-trips.

**Tool:** `browser_evaluate`

```js
() => {
  const get = (selector, props) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = { selector };
    props.forEach(p => { r[p] = cs.getPropertyValue(p).trim(); });
    return r;
  };

  const getAll = (selector, props, max = 3) => {
    return Array.from(document.querySelectorAll(selector)).slice(0, max).map((el, i) => {
      const cs = getComputedStyle(el);
      const r = { selector, index: i };
      props.forEach(p => { r[p] = cs.getPropertyValue(p).trim(); });
      return r;
    });
  };

  const COLOR = ['color', 'background-color', 'border-color'];
  const TYPO = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform'];
  const SPACING = ['margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right'];
  const LAYOUT = ['max-width', 'width', 'display', 'gap', 'position'];
  const DECOR = ['border-radius', 'box-shadow', 'border-width', 'border-style', 'border-color'];
  const TRANS = ['transition', 'transition-duration', 'transition-property', 'transition-timing-function'];
  const ALL = [...new Set([...COLOR, ...TYPO, ...SPACING, ...LAYOUT, ...DECOR, ...TRANS])];

  return JSON.stringify({
    body: get('body', ALL),
    headings: {
      h1: get('h1', [...TYPO, ...COLOR, ...SPACING]),
      h2: get('h2', [...TYPO, ...COLOR, ...SPACING]),
      h3: get('h3', [...TYPO, ...COLOR, ...SPACING]),
      h4: get('h4', [...TYPO, ...COLOR, ...SPACING]),
      h5: get('h5', [...TYPO, ...COLOR, ...SPACING]),
      h6: get('h6', [...TYPO, ...COLOR, ...SPACING]),
    },
    text: {
      p: get('p', [...TYPO, ...COLOR, ...SPACING]),
      li: get('li', [...TYPO, ...COLOR, ...SPACING]),
      small: get('small', [...TYPO, ...COLOR]),
      strong: get('strong', [...TYPO, ...COLOR]),
      em: get('em', [...TYPO]),
      blockquote: get('blockquote', [...TYPO, ...COLOR, ...SPACING, ...DECOR,
        'border-left-width', 'border-left-style', 'border-left-color']),
    },
    lists: {
      ul: get('ul', [...SPACING, 'list-style-type', 'padding-left']),
      ol: get('ol', [...SPACING, 'list-style-type', 'padding-left']),
    },
    codeElements: {
      codeInline: get('code', [...TYPO, ...COLOR, ...SPACING, 'background-color', 'border-radius',
        'padding-top', 'padding-bottom', 'padding-left', 'padding-right']),
      pre: get('pre', [...TYPO, ...COLOR, ...SPACING, ...DECOR, 'background-color',
        'overflow-x', 'white-space']),
    },
    hr: get('hr', ['border-top-width', 'border-top-style', 'border-top-color',
      'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
      'margin-top', 'margin-bottom', 'height', 'background-color', 'color']),
    tableElements: {
      table: get('table', ['border-collapse', 'border-spacing', 'width', ...SPACING]),
      th: get('th', [...TYPO, ...COLOR, ...SPACING, 'background-color', 'border-width',
        'border-style', 'border-color', 'text-align', 'vertical-align']),
      td: get('td', [...TYPO, ...COLOR, ...SPACING, 'border-width',
        'border-style', 'border-color', 'text-align', 'vertical-align']),
    },
    figure: {
      figure: get('figure', [...SPACING]),
      figcaption: get('figcaption', [...TYPO, ...COLOR, ...SPACING]),
    },
    links: {
      a: get('a:not(header a):not(nav a)', [...TYPO, ...COLOR, ...TRANS, 'text-decoration', 'text-decoration-color']),
      navLink: get('nav a, header a', [...TYPO, ...COLOR]),
    },
    buttons: getAll('button, .btn, [class*="cta"], [class*="button"], input[type="submit"]', [...TYPO, ...COLOR, ...DECOR, ...SPACING, ...TRANS, 'cursor']),
    containers: getAll('main, [role="main"], [class*="container"], [class*="wrapper"]', [...LAYOUT, ...SPACING]),
    sections: getAll('main > div, main > section, section', [...SPACING, ...COLOR, ...LAYOUT], 5),
    cards: getAll('[class*="card"], [class*="teaser"]', [...DECOR, ...SPACING, ...COLOR]),
    inputs: getAll('input:not([type="hidden"]), select, textarea', [...TYPO, ...COLOR, ...DECOR, ...SPACING]),
    images: get('img', ['border-radius', 'max-width', 'width', 'height', 'object-fit']),
    header: get('header, [role="banner"]', [...COLOR, ...LAYOUT, 'height', 'min-height']),
    nav: get('nav', [...COLOR, ...LAYOUT, 'height']),
    footer: get('footer, [role="contentinfo"]', [...COLOR, ...LAYOUT, ...SPACING]),
    selection: (() => {
      const testEl = document.createElement('span');
      testEl.textContent = 'test';
      testEl.style.position = 'absolute';
      testEl.style.opacity = '0';
      document.body.appendChild(testEl);
      const sel = getComputedStyle(testEl, '::selection');
      const result = { color: sel.color, 'background-color': sel.backgroundColor };
      testEl.remove();
      return result;
    })(),
    globals: (() => {
      // Commonly missed global properties
      const html = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      const result = {};

      // Scroll behavior
      result.scrollBehavior = html.scrollBehavior; // 'smooth' or 'auto'

      // Font smoothing / antialiasing
      result.webkitFontSmoothing = body.webkitFontSmoothing || body.getPropertyValue('-webkit-font-smoothing');
      result.mozOsxFontSmoothing = body.getPropertyValue('-moz-osx-font-smoothing');
      result.textRendering = body.textRendering;

      // Box sizing
      result.boxSizing = body.boxSizing;

      // Body overflow (common: overflow-x hidden to prevent horizontal scroll on mobile)
      result.overflowX = body.overflowX;
      result.overflowY = body.overflowY;

      // Accent color (form elements: checkboxes, radios, range sliders)
      result.accentColor = body.accentColor;

      // Color scheme
      result.colorScheme = html.colorScheme || body.colorScheme;

      // Header position (sticky/fixed)
      const header = document.querySelector('header, [role="banner"]');
      if (header) {
        const hcs = getComputedStyle(header);
        result.headerPosition = hcs.position;
        result.headerZIndex = hcs.zIndex;
      }

      // Check for ::placeholder styling on first input
      const input = document.querySelector('input[type="text"], input[type="email"], input[type="search"], textarea');
      if (input) {
        const placeholder = getComputedStyle(input, '::placeholder');
        result.placeholder = {
          color: placeholder.color,
          opacity: placeholder.opacity,
          fontStyle: placeholder.fontStyle,
        };
      }

      // Link underline details
      const link = document.querySelector('main a, article a, a:not(header a):not(nav a)');
      if (link) {
        const lcs = getComputedStyle(link);
        result.linkUnderlineOffset = lcs.textUnderlineOffset;
        result.linkDecorationThickness = lcs.textDecorationThickness;
        result.linkDecorationStyle = lcs.textDecorationStyle;
      }

      // Input focus styles (for later reference)
      // Note: can't trigger :focus in evaluate, this is captured in Phase 9.4

      return result;
    })(),
  }, null, 2);
}
```

Save the returned JSON to `migration-work/computed-styles.json` using the Write tool.

**If any selector returns `null`** (element not found on this page), that is fine — it means that element type is not present on the sampled page. Note it and move on. If critical elements like `body`, `h2`, `p`, or `a` return null, navigate to a different page on the same site that has more content and re-run.

### 1.5 Extract CSS custom properties from the live DOM

This captures variables that are actually active on the page, including those injected by JavaScript or font services at runtime (which may not appear in the static CSS files).

**Tool:** `browser_evaluate`

```js
() => {
  const vars = {};

  // Method 1: Read from computed style on :root
  const rootStyles = getComputedStyle(document.documentElement);
  for (const prop of rootStyles) {
    if (prop.startsWith('--')) {
      vars[prop] = rootStyles.getPropertyValue(prop).trim();
    }
  }

  // Method 2: Also check body (some sites put vars on body)
  const bodyStyles = getComputedStyle(document.body);
  for (const prop of bodyStyles) {
    if (prop.startsWith('--') && !vars[prop]) {
      vars[prop] = bodyStyles.getPropertyValue(prop).trim();
    }
  }

  return JSON.stringify({
    count: Object.keys(vars).length,
    variables: vars,
  }, null, 2);
}
```

Save to `migration-work/live-css-variables.json` using the Write tool.

### Phase 1 validation

Before proceeding, verify ALL of these:
- [ ] `migration-work/raw-css-corpus.txt` exists and is non-empty (check file size with Bash `ls -lh`)
- [ ] `migration-work/stylesheet-urls.json` lists at least 1 external stylesheet
- [ ] `migration-work/computed-styles.json` has non-null data for `body`, at least 2 heading levels, `p`, and `a`
- [ ] `migration-work/live-css-variables.json` exists (may have 0 variables — that is valid for sites that don't use CSS variables)
- [ ] `migration-work/cjk-detection.json` exists with `scriptType` determined
- [ ] `migration-work/design-reference.png` screenshot captured

**Do NOT proceed if `raw-css-corpus.txt` is empty or `computed-styles.json` is missing body/heading data. Navigate to a content-rich page on the site and re-run steps 1.4 and 1.5.**

---

## Phase 2: Extract CSS Custom Properties

Combine variables from two sources: the live DOM (Phase 1.5) and the raw CSS files (static declarations that may not be active on the current page, e.g., dark mode themes or alternate states).

### 2.1 Parse variables from raw CSS corpus

**Tool:** Grep

Search the raw CSS corpus for CSS variable declarations. Run these searches:

```
pattern: --[a-zA-Z][\w-]*\s*:
path: migration-work/raw-css-corpus.txt
output_mode: content
```

This returns all lines containing CSS variable declarations. The context around them reveals which selector they belong to (`:root`, `body`, `html`, `[data-theme]`, etc.).

For a more targeted extraction, also search for the rule blocks that typically contain variables:

```
pattern: :root\s*\{
path: migration-work/raw-css-corpus.txt
output_mode: content
-A: 50
```

This captures up to 50 lines after each `:root {` to get the full variable block. Repeat for `html\s*\{` and `body\s*\{` if the first search showed variables on those selectors.

### 2.2 Merge with live DOM variables

Read `migration-work/live-css-variables.json` (from Phase 1.5). This contains variables that are actually computed and active on the page.

**Merge strategy:**
- Live DOM variables take precedence (they show the resolved, active values)
- Static CSS variables fill in anything not present in the live DOM (theme variants, unused states)
- Note any variable that appears in static CSS but NOT in the live DOM — it may be for a theme or media query and is still worth capturing

### 2.3 Resolve variable references

Some variables reference other variables: `--brand-blue: var(--primary-color)`. For each variable whose value contains `var(--...)`:
1. Look up the referenced variable in the merged set
2. Record both the reference and the resolved value
3. If the reference cannot be resolved, note it as unresolved

### 2.4 Write output

**Tool:** Write

Save to `migration-work/extracted-variables.json` with this structure:

```json
{
  "count": 42,
  "source": "merged from live DOM + raw CSS",
  "variables": {
    "--primary-color": { "value": "#003366", "source": "live-dom", "selector": ":root" },
    "--text-color": { "value": "#333333", "source": "raw-css", "selector": ":root" },
    "--hover-color": { "value": "var(--primary-color)", "resolved": "#003366", "source": "raw-css", "selector": ":root" }
  },
  "unresolved": []
}
```

### Validation

- [ ] All `--var-*` declarations from `:root` / `html` / `body` captured from raw CSS
- [ ] Live DOM variables merged in (Phase 1.5 data included)
- [ ] Variables referencing other variables have a `resolved` value
- [ ] Any unresolved references are listed in the `unresolved` array
- [ ] Total count documented

---

## Phase 3: Extract Color Palette

### 3.1 Collect colors from computed styles

Read `migration-work/computed-styles.json` and extract every `color`, `background-color`, and `border-color` value. Build a deduplicated list.

**Tool:** Read `migration-work/computed-styles.json`, then parse all color values from every entry.

Record each color with its context:
```json
{ "value": "rgb(0, 51, 102)", "hex": "#003366", "usedBy": ["body color", "h2 color"], "category": "text" }
```

### 3.2 Collect colors from CSS variables

Read `migration-work/extracted-variables.json`. Any variable whose value is a color (hex, rgb, rgba, hsl, hsla, or a named color) should be added to the palette.

### 3.3 Scan raw CSS for additional colors

**Tool:** Grep — run these searches against `migration-work/raw-css-corpus.txt`:

Search for hex colors:
```
pattern: #[0-9a-fA-F]{3,8}
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 100
```

Search for rgb/rgba:
```
pattern: rgba?\([^)]+\)
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 100
```

Search for hsl/hsla:
```
pattern: hsla?\([^)]+\)
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 50
```

Search for gradients:
```
pattern: (linear|radial|conic)-gradient\([^;]+
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 20
```

### 3.4 Extract hover states via Playwright

Hover states cannot be read from static CSS or computed styles without interaction. Follow this exact sequence:

**Step 1 — Get a snapshot to find element refs.**

**Tool:** `browser_snapshot`

Look in the snapshot output for link (`a`) and button elements. Note their `ref` values.

**Step 2 — Read pre-hover color of a body link (not nav link).**

**Tool:** `browser_evaluate`

```js
() => {
  const link = document.querySelector('main a, article a, .content a, a:not(header a):not(nav a):not(footer a)');
  if (!link) return JSON.stringify({ error: 'no body link found' });
  const cs = getComputedStyle(link);
  return JSON.stringify({
    element: 'body-link-before-hover',
    color: cs.color,
    backgroundColor: cs.backgroundColor,
    textDecoration: cs.textDecorationLine || cs.textDecoration,
  });
}
```

**Step 3 — Hover the link.**

**Tool:** `browser_hover`

```
ref: {ref value of a body link from the snapshot}
element: body link
```

**Step 4 — Read post-hover color while still hovered.**

**Tool:** `browser_evaluate`

```js
() => {
  const link = document.querySelector('main a:hover, article a:hover, .content a:hover, a:not(header a):not(nav a):not(footer a):hover');
  if (!link) {
    // Fallback: just read the first link's current state (should still be hovered)
    const fallback = document.querySelector('main a, article a, .content a');
    if (!fallback) return JSON.stringify({ error: 'no link found' });
    const cs = getComputedStyle(fallback);
    return JSON.stringify({
      element: 'body-link-after-hover',
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      textDecoration: cs.textDecorationLine || cs.textDecoration,
    });
  }
  const cs = getComputedStyle(link);
  return JSON.stringify({
    element: 'body-link-after-hover',
    color: cs.color,
    backgroundColor: cs.backgroundColor,
    textDecoration: cs.textDecorationLine || cs.textDecoration,
  });
}
```

**Step 5 — Repeat for a button element** (only if a **real** button exists on the page — i.e., a button with non-transparent background-color AND not an icon font. Skip this step if the only buttons found were transparent-background icon elements).

Use the same hover-then-evaluate pattern:
1. Read button pre-hover styles (background-color, color, border-color)
2. `browser_hover` on the button ref
3. Read button post-hover styles

If no real button was found, set `button` to `null` in the interactions output (not derived from link hover states).

**Step 6 — Extract hover rules from raw CSS as backup.**

**Tool:** Grep

```
pattern: :hover\s*\{[^}]*
path: migration-work/raw-css-corpus.txt
output_mode: content
-A: 3
head_limit: 30
```

This catches hover rules that may not be testable via Playwright (e.g., elements not visible on the sampled page).

### 3.5 Categorize the palette

Group all collected colors into categories using these **concrete heuristics**:

#### Automatic assignments (no judgment needed)

These come directly from computed styles — no ambiguity:

| Category | Exact source | Fallback |
|----------|-------------|----------|
| **Background (main)** | `computed-styles.body.background-color` | `#ffffff` |
| **Text (primary)** | `computed-styles.body.color` | `#333333` |
| **Link (default)** | `computed-styles.links.a.color` | Same as brand primary |
| **Link (hover)** | Hover state captured in Phase 3.4, Step 4 | 15% darker than link default |
| **Link hover text-decoration** | Hover state captured in Phase 3.4, Step 4 | `underline` |

#### Heuristic: Primary brand color

Use this decision tree in order — stop at the first match:

1. **Check button background.** If `computed-styles.buttons[0].background-color` is a non-neutral, non-white, non-black color → that is the primary brand color. (Buttons are the strongest intentional brand signal.)
2. **Check heading color.** If `computed-styles.headings.h1.color` or `h2.color` is different from body text AND is not black/near-black → that is the primary brand color.
3. **Check link color.** If `computed-styles.links.a.color` is not a generic blue (#0000ff, #0066cc, #0000ee) → it's likely the primary brand color.
4. **Check CSS variables.** If `extracted-variables.json` contains a variable named `--primary`, `--brand`, `--accent`, or `--main-color` → use its resolved value.
5. **Frequency analysis.** From `allUniqueColors`, exclude neutrals (see below). The most frequent remaining color is the primary brand.

**What counts as "neutral":** Any color where the R, G, B channels are within 30 of each other (i.e., grayscale or near-grayscale). In hex: `#000`–`#333` (dark neutrals), `#666`–`#999` (medium neutrals), `#ccc`–`#fff` (light neutrals). Also white (`#fff`, `#ffffff`), black (`#000`, `#000000`), and `transparent`.

#### Heuristic: Secondary brand color

1. If a second non-neutral color appears on hover states, secondary buttons, or links that differ from the primary → that is secondary.
2. If only one non-neutral color exists site-wide → set secondary to `null` (no secondary brand).
3. If two non-neutral colors exist → the one NOT used on primary CTA buttons is secondary.

#### Heuristic: Background (light)

1. Check `computed-styles.sections` — look for any section with a `background-color` that is lighter than body background but not identical to it. Common values: `#f5f5f5`, `#f8f8f8`, `#fafafa`, `#f0f0f0`, `rgb(245,245,245)`.
2. If no distinct light background found → use the body background color with 3% darkened lightness.
3. If `extracted-variables.json` contains `--light-bg`, `--bg-light`, `--gray-100`, or similar → use that.

#### Heuristic: Background (dark)

1. Check `computed-styles.sections` for any section with a dark background (lightness < 30% in HSL).
2. Check `computed-styles.footer.background-color` — footers often use the dark background.
3. If no dark section found → use the body text color (often works as `--dark-color` in EDS).

#### Heuristic: Text (secondary)

1. Check `computed-styles.text.small.color` — if lighter than body text, that's text-secondary.
2. Check `computed-styles.figure.figcaption.color` — captions often use secondary text.
3. If `extracted-variables.json` contains `--text-muted`, `--gray-600`, `--secondary-text` → use that.
4. If no distinct secondary text found → set to body text color with 40% reduced opacity (approximate with a lighter gray).

#### Heuristic: Text (heading)

1. If `computed-styles.headings.h1.color` equals body text color → heading color is the same; set to `null` (no separate heading color needed).
2. If h1/h2 color differs from body text → that's the heading text color.
3. Common pattern: headings use the brand primary color as text.

#### Heuristic: Border (default)

1. Check `computed-styles.cards[*].border-color` — card borders are the most representative.
2. Check `computed-styles.inputs[*].border-color` — input borders are a close second.
3. If neither exists, check `computed-styles.tableElements.th.border-color`.
4. If nothing found → `#dddddd` (safe default).

#### Heuristic: Button colors

A button counts as "detected" only if ALL of these are true:
- `computed-styles.buttons` array is non-empty
- `buttons[0].background-color` is **not** `transparent`, `rgba(0,0,0,0)`, or any fully-transparent value
- `buttons[0].font-family` is **not** an icon font (e.g., `custom-icons`, `FontAwesome`, `Material Icons`)

If a real button is detected:
1. `primaryBg` = `computed-styles.buttons[0].background-color`
2. `primaryText` = `computed-styles.buttons[0].color`
3. `primaryHoverBg` = button hover state from Phase 3.4, Step 5. If not captured → darken primaryBg by 10-15%.

If NO real button is detected (no buttons found, or only transparent/icon-font elements matched) → set `buttons` to `null` in color-palette.json. Do NOT derive button background colors from link text colors — that is a color-role mismatch (link `color` is a text property, button `background-color` is a fill property). The CSS template will use its built-in fallback (`var(--link-color)` / `var(--link-hover-color)`) which keeps values connected to the design tokens via CSS variables.

### 3.6 Write output

**Tool:** Write

Save to `migration-work/color-palette.json`:

```json
{
  "brand": {
    "primary": "#003366",
    "secondary": "#0066cc"
  },
  "backgrounds": {
    "main": "#ffffff",
    "light": "#f5f5f5",
    "dark": "#1a1a2e"
  },
  "text": {
    "primary": "#333333",
    "secondary": "#666666",
    "heading": "#003366"
  },
  "links": {
    "default": "#0066cc",
    "hover": "#004499",
    "hoverTextDecoration": "underline"
  },
  "borders": {
    "default": "#dddddd",
    "focus": "#0066cc"
  },
  "buttons": null,
  "gradients": [],
  "allUniqueColors": ["#003366", "#0066cc", "#333333", "#666666", "#ffffff", "#f5f5f5", "#dddddd"]
}
```

### Validation

- [ ] Body background color captured (non-null)
- [ ] Body text color captured (non-null)
- [ ] Link default color captured
- [ ] Link hover color captured (via Playwright hover sequence, not guessed)
- [ ] At least one brand/accent color identified
- [ ] Button colors captured (if real buttons with non-transparent background exist), or set to `null` if only transparent/icon-font buttons found
- [ ] All unique colors listed in `allUniqueColors` array
- [ ] Each color has a category assignment

---

## Phase 4: Extract Typography and @font-face

### 4.1 Font families

From `computed-styles.json`, extract `font-family` for:
- `body` → maps to `--body-font-family`
- `h1`–`h6` → maps to `--heading-font-family`
- `code, pre` → maps to `--fixed-font-family`

#### Heuristic: "Same as body" test for heading font

Compare `computed-styles.headings.h2.font-family` with `computed-styles.body.font-family`:

1. **Exact match** (same string after trimming) → `sameAsBody: true`, set `--heading-font-family: var(--body-font-family)`.
2. **First font name matches** (e.g., body is `'Noto Sans JP', sans-serif` and h2 is `'Noto Sans JP', 'Hiragino Kaku Gothic', sans-serif`) → `sameAsBody: true`. Fallback differences don't matter.
3. **Different first font name** → `sameAsBody: false`, set `--heading-font-family` to the heading font stack.

Use h2 as the representative heading (most common heading level on most pages). If h1 uses a different font from h2-h6, note it as a per-level override, not the shared heading font.

#### Heuristic: Fixed font family

1. Check `computed-styles.codeElements.codeInline.font-family` and `computed-styles.codeElements.pre.font-family`.
2. If found → use the extracted value.
3. If `code` and `pre` elements don't exist on the page → set `--fixed-font-family` to `'Menlo, Consolas, "Liberation Mono", monospace'` (safe default).
4. Mark as `"detected": false` in the JSON if no code elements were sampled.

### 4.2 Font sizes

From computed styles, extract `font-size` for:
- `body` → maps to `--body-font-size-m`
- `h1` → maps to `--heading-font-size-xxl`
- `h2` → maps to `--heading-font-size-xl`
- `h3` → maps to `--heading-font-size-l`
- `h4` → maps to `--heading-font-size-m`
- `h5` → maps to `--heading-font-size-s`
- `h6` → maps to `--heading-font-size-xs`

#### Heuristic: Deriving body-font-size-s and body-font-size-xs

These are NOT separate elements — they're size tiers for body text. Derive them as follows:

1. **Check `computed-styles.text.small.font-size`** — if `<small>` exists and is smaller than body, use it for `--body-font-size-s`.
2. **Check `computed-styles.figure.figcaption.font-size`** — captions are often `body-font-size-s`.
3. **Check `computed-styles.footer.font-size`** (via the footer's font-size, if available from computed-styles) — footer text is often smaller.
4. **If none found**, derive by subtracting from body font-size:
   - `--body-font-size-s` = body font-size minus 2px (e.g., body=16px → s=14px)
   - `--body-font-size-xs` = body font-size minus 4px (e.g., body=16px → xs=12px)
5. **If the site uses rem/em**, convert to px using body font-size as reference, then back to the same unit.

#### Heuristic: Missing heading levels

If some heading levels (h4, h5, h6) are not found on the sampled page:

1. Calculate the **scale ratio** between known heading levels. Example: if h1=32px, h2=28px, h3=24px → the scale is approximately -4px per level.
2. Extrapolate missing levels using the same ratio.
3. **Floor:** No heading should be smaller than `--body-font-size-m`. If extrapolation yields a heading smaller than body text, use body text size as the minimum.
4. Mark extrapolated sizes as `"estimated": true` in the JSON.

### 4.3 Font weights and line heights

Extract `font-weight` and `line-height` for body and each heading level.

#### Heuristic: Shared heading weight vs per-level overrides

1. Check weights for all available headings (h1-h6).
2. If **all heading weights are the same** (e.g., all 700) → use a single shared value in the `h1,h2,h3,h4,h5,h6` rule.
3. If **h1 differs from h2-h6** (common: h1=700, h2-h6=600) → use h2 weight as the shared value, add an `h1` override.
4. If **weights vary significantly** across levels → use the most common weight as shared, add overrides for exceptions.

#### Heuristic: Line-height interpretation

Computed `line-height` returns in pixels (e.g., `"25.6px"`). Convert to a unitless ratio:

```
unitless-line-height = parsed line-height px / parsed font-size px
```

Example: line-height `25.6px` with font-size `16px` → `25.6 / 16 = 1.6`.

Use the unitless value in the output (better for scaling). Round to 2 decimal places.

### 4.3b Detect responsive typography (mobile vs desktop heading sizes)

The computed styles from Phase 1.4 were captured at whatever viewport width the browser was at (typically desktop). If the source site uses responsive typography (different heading sizes at different breakpoints), the `:root` block needs **mobile values** as the base, with desktop overrides in a `@media` block.

**Step 1 — Check if the site has responsive typography.**

**Tool:** Grep — search the raw CSS corpus for heading-related rules inside media queries:

```
pattern: @media[^{]*\{[^}]*h[1-6]
path: migration-work/raw-css-corpus.txt
output_mode: content
-A: 5
head_limit: 30
multiline: true
```

Also search for font-size changes in media queries:

```
pattern: @media.*\{[\s\S]*?font-size
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 20
multiline: true
```

If NO heading-related rules appear inside media queries → the site does NOT use responsive typography. Skip to 4.4. In the CSS template, use the extracted values as-is and DELETE the `@media` block for heading size overrides.

**Step 2 — If responsive typography IS detected, resize to mobile and re-measure.**

**Tool:** `browser_resize`
```
width: 375
height: 812
```

Wait for the layout to reflow:

**Tool:** `browser_wait_for`
```
time: 2
```

**Tool:** `browser_evaluate`

```js
() => {
  const TYPO = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing'];
  const get = (sel, props) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = { selector: sel };
    props.forEach(p => { r[p] = cs.getPropertyValue(p).trim(); });
    return r;
  };

  return JSON.stringify({
    viewportWidth: window.innerWidth,
    body: get('body', TYPO),
    h1: get('h1', TYPO),
    h2: get('h2', TYPO),
    h3: get('h3', TYPO),
    h4: get('h4', TYPO),
    h5: get('h5', TYPO),
    h6: get('h6', TYPO),
    p: get('p', TYPO),
  }, null, 2);
}
```

Save the result to `migration-work/typography-mobile.json` using the Write tool.

**Step 3 — Restore desktop viewport.**

**Tool:** `browser_resize`
```
width: 1440
height: 900
```

**Step 4 — Compare mobile vs desktop values.**

Read both `migration-work/computed-styles.json` (desktop) and `migration-work/typography-mobile.json` (mobile). For each heading level:
- If the mobile font-size differs from the desktop font-size → the site HAS responsive typography
- Record which values change and which stay the same

**Step 5 — Update typography.json.**

Add a `responsive` block to `migration-work/typography.json`:

```json
{
  "responsive": {
    "hasResponsiveTypography": true,
    "mobileViewportWidth": "375px",
    "mobileSizes": {
      "body": { "fontSize": "14px" },
      "h1": { "fontSize": "24px" },
      "h2": { "fontSize": "20px" },
      "h3": { "fontSize": "18px" },
      "h4": { "fontSize": "16px" },
      "h5": { "fontSize": "15px" },
      "h6": { "fontSize": "14px" }
    },
    "desktopSizes": {
      "body": { "fontSize": "16px" },
      "h1": { "fontSize": "32px" },
      "h2": { "fontSize": "28px" },
      "h3": { "fontSize": "24px" },
      "h4": { "fontSize": "20px" },
      "h5": { "fontSize": "18px" },
      "h6": { "fontSize": "16px" }
    }
  }
}
```

If `hasResponsiveTypography` is `true`:
- The `:root` block in `styles/styles.css` should use the **mobile** heading sizes
- The `@media (width >= {desktopBreakpoint})` block should override with **desktop** heading sizes
- Body font-size should also use mobile value in `:root` and desktop value in `@media`, if they differ

If `hasResponsiveTypography` is `false`:
- Use the extracted values directly in `:root`
- DELETE the `@media` block for heading size overrides entirely

### 4.4 @font-face declarations

**Tool:** Grep — search for @font-face blocks:

```
pattern: @font-face\s*\{
path: migration-work/raw-css-corpus.txt
output_mode: content
-A: 12
head_limit: 50
```

This captures each `@font-face` block plus up to 12 lines of its contents (font-family, src, weight, style, display, unicode-range).

For each `@font-face` found, record:
- `font-family` name (the string inside quotes)
- `src` URLs (woff2, woff, ttf, otf formats)
- `font-weight` (400, 700, etc.)
- `font-display` (swap, block, auto, etc.)
- `font-style` (normal, italic)
- `unicode-range` (critical for CJK/Japanese subsetted fonts)

### 4.5 Detect external font service references

**Tool:** Read `migration-work/stylesheet-urls.json` and check the `fontLinks` array from Phase 1.2.

Also search the raw CSS and HTML for font service URLs:

**Tool:** Grep

```
pattern: fonts\.googleapis|use\.typekit|typesquare|webfont\.fontplus|fonts\.adobe
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 10
```

And check if any font service scripts are loaded:

**Tool:** `browser_evaluate`

```js
() => {
  const scripts = Array.from(document.querySelectorAll('script[src]'));
  const fontScripts = scripts.filter(s =>
    s.src.match(/typekit|typesquare|fontplus|fonts\.googleapis|webfont/i)
  ).map(s => s.src);

  const fontLinks = Array.from(document.querySelectorAll('link[href*="font"], link[href*="typekit"], link[href*="typesquare"]'))
    .map(l => ({ rel: l.rel, href: l.href }));

  return JSON.stringify({ fontScripts, fontLinks }, null, 2);
}
```

### 4.6 CJK / Japanese font considerations

**Read `migration-work/cjk-detection.json`** from Phase 1.1b. If `scriptType` is `japanese`, `korean`, `chinese`, or `cjk-unspecified`, the following special rules apply:

#### 4.6.1 System font fallback chains for CJK

CJK sites MUST NOT use `Arial` or `Times New Roman` as the system fallback — those fonts lack CJK glyphs and will cause tofu (□□□) characters. Use the correct platform-native CJK fonts:

**Japanese (sans-serif) — use this order:**
```
'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Yu Gothic Medium', 'Yu Gothic', 'Meiryo', sans-serif
```

**Japanese (serif/mincho) — use this order:**
```
'Hiragino Mincho ProN', 'Yu Mincho', 'MS PMincho', serif
```

**Korean (sans-serif):**
```
'Apple SD Gothic Neo', 'Malgun Gothic', 'NanumGothic', sans-serif
```

**Chinese Simplified (sans-serif):**
```
'PingFang SC', 'Microsoft YaHei', 'SimHei', sans-serif
```

**Chinese Traditional (sans-serif):**
```
'PingFang TC', 'Microsoft JhengHei', sans-serif
```

When building `--body-font-family` and `--heading-font-family`, append the correct CJK system fallback chain AFTER the web font name. Example for a Japanese site using Noto Sans JP via TypeSquare:

```css
--body-font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Yu Gothic Medium', 'Yu Gothic', 'Meiryo', sans-serif;
```

#### 4.6.2 Line-height expectations for CJK

CJK characters are taller and denser than Latin. If the computed `line-height` for body text is:
- **Below 1.5** — flag as potentially too tight for CJK. The extracted value may come from a Latin-only section. Look for CJK-heavy paragraphs and re-measure
- **1.5–1.7** — normal for CJK headings
- **1.7–2.0** — normal for CJK body text
- **Above 2.0** — valid, some Japanese sites use very open spacing

Record the body line-height as-is (don't "correct" it), but note in the JSON if it seems atypically low for CJK.

#### 4.6.3 Font weight availability

CJK web fonts are expensive to serve. Most services only provide a subset of weights:
- **Typical:** 400 (regular) and 700 (bold) only
- **Premium:** 100, 300, 400, 500, 700, 900

If the site's computed `font-weight` for headings is 600 but the font service only provides 400 and 700, the browser will map 600 → 700. Record the computed weight as-is, but note the available weights from the @font-face or font service configuration.

#### 4.6.4 Unicode-range in @font-face

CJK fonts are typically split into multiple @font-face blocks with different `unicode-range` values for subsetting. When capturing @font-face blocks in 4.4, preserve ALL of them — do not deduplicate by font-family name alone. Each range covers a different subset of characters.

Common Japanese unicode ranges:
- `U+3000-303F` — CJK punctuation
- `U+3040-309F` — Hiragana
- `U+30A0-30FF` — Katakana
- `U+4E00-9FFF` — CJK Unified Ideographs (most kanji)
- `U+F900-FAFF` — CJK Compatibility Ideographs
- `U+FF00-FFEF` — Fullwidth Latin, halfwidth katakana

#### 4.6.5 Font service replication

**TypeSquare:** Loads fonts via a `<script>` tag. The script downloads font files based on a project ID. You CANNOT self-host these fonts (license restriction). The migration must keep the TypeSquare `<script>` in `head.html`. Record the exact `<script>` tag for Phase 11.

**FONTPLUS:** Similar to TypeSquare — script-based loading. Keep the original `<script>` tag.

**Google Fonts (Noto Sans JP, etc.):** Can be loaded via `<link>` in `head.html` or `@import` in `fonts.css`. Both work. Prefer `<link>` for performance.

**Self-hosted CJK fonts:** Possible but results in large files (5–20MB total). Only use if the source site self-hosts. Ensure `unicode-range` subsetting is preserved.

### 4.7 Write output

**Tool:** Write

Save to `migration-work/typography.json`:

```json
{
  "body": {
    "fontFamily": "'Noto Sans JP', sans-serif",
    "fontSize": "16px",
    "fontWeight": "400",
    "lineHeight": "1.75",
    "letterSpacing": "0px"
  },
  "headings": {
    "fontFamily": "'Noto Sans JP', sans-serif",
    "sameAsBody": true,
    "sizes": {
      "h1": { "fontSize": "32px", "fontWeight": "700", "lineHeight": "1.3", "marginBottom": "16px" },
      "h2": { "fontSize": "28px", "fontWeight": "700", "lineHeight": "1.3", "marginBottom": "12px" },
      "h3": { "fontSize": "24px", "fontWeight": "600", "lineHeight": "1.4", "marginBottom": "8px" },
      "h4": { "fontSize": "20px", "fontWeight": "600", "lineHeight": "1.4", "marginBottom": "8px" },
      "h5": { "fontSize": "18px", "fontWeight": "600", "lineHeight": "1.5", "marginBottom": "4px" },
      "h6": { "fontSize": "16px", "fontWeight": "600", "lineHeight": "1.5", "marginBottom": "4px" }
    }
  },
  "fixed": {
    "fontFamily": "monospace",
    "detected": false
  },
  "fontFaces": [
    {
      "family": "Noto Sans JP",
      "src": "url('...') format('woff2')",
      "weight": "400",
      "style": "normal",
      "display": "swap",
      "unicodeRange": "U+3000-9FFF"
    }
  ],
  "externalServices": {
    "googleFonts": null,
    "typekit": null,
    "typesquare": "https://typesquare.com/...",
    "fontplus": null
  },
  "loadingMechanism": "typesquare-cdn",
  "cjk": {
    "isCjk": true,
    "scriptType": "japanese",
    "systemFallbackChain": "'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Yu Gothic Medium', 'Yu Gothic', 'Meiryo', sans-serif",
    "fullBodyFontFamily": "'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Yu Gothic Medium', 'Yu Gothic', 'Meiryo', sans-serif",
    "availableWeights": [400, 700],
    "unicodeRangeSubsets": 12,
    "lineHeightNote": "1.75 is typical for Japanese body text",
    "fontServiceScript": "<script src=\"https://typesquare.com/3/tsst/script/XXXXX.js\" charset=\"utf-8\"></script>"
  }
}
```

**If the site is NOT CJK** (scriptType is `latin`), omit the entire `cjk` block from the JSON.

### Validation

- [ ] Body font family identified (non-null, not just "serif" or "sans-serif" unless that's genuinely what the site uses)
- [ ] Heading font family identified (or noted as same as body with `sameAsBody: true`)
- [ ] All 6 heading sizes extracted (h1-h6). If some heading levels don't exist on the page, note them as "not found on sampled page" but attempt to extrapolate from the scale
- [ ] Body font sizes captured: m (base), s (smaller text), xs (fine print)
- [ ] Line heights captured for body and each heading level
- [ ] Font weights captured for body and headings
- [ ] @font-face declarations captured OR external font service documented
- [ ] Font loading mechanism explicitly documented: "self-hosted", "google-fonts", "typekit", "typesquare", "fontplus", or "system-fonts-only"
- [ ] **Responsive check:** If Step 4.3b detected responsive typography, `typography.responsive` block is present with mobile AND desktop sizes
- [ ] **Responsive check:** If responsive, `:root` heading sizes will use mobile values (not desktop)
- [ ] **CJK check:** If `cjk-detection.json` shows a CJK site, the `cjk` block is present in `typography.json`
- [ ] **CJK check:** System fallback chain uses platform-native CJK fonts (NOT Arial/Times New Roman)
- [ ] **CJK check:** `fullBodyFontFamily` includes both web font + CJK system fallbacks
- [ ] **CJK check:** Font service `<script>` or `<link>` tag captured verbatim if applicable
- [ ] **CJK check:** unicode-range subsetting noted if @font-face blocks use it

---

## Phase 5: Extract Spacing System

### 5.1 Collect all spacing values from computed styles

Read `migration-work/computed-styles.json`. For every entry that has margin or padding properties, extract the pixel values. Build a flat list of all spacing values.

Parse values as follows:
- `"16px"` → `16`
- `"0px"` → `0` (include — shows intentional zero spacing)
- `"1.5em"` → convert using the element's font-size as reference (or note as `em`-based)
- `"auto"` → skip (not a spacing token)

Organize by context:

```json
{
  "sectionVertical": {
    "paddingTop": ["40px", "60px", "80px"],
    "paddingBottom": ["40px", "60px", "80px"],
    "marginTop": ["0px"],
    "marginBottom": ["0px"]
  },
  "headings": {
    "h1": { "marginTop": "0px", "marginBottom": "16px" },
    "h2": { "marginTop": "32px", "marginBottom": "12px" },
    "h3": { "marginTop": "24px", "marginBottom": "8px" }
  },
  "paragraph": { "marginBottom": "16px" },
  "containerHorizontal": { "paddingLeft": "24px", "paddingRight": "24px" }
}
```

### 5.1b Measure section spacing from the live page

The computed-styles `sections` entry (Phase 3) samples only a few elements using generic selectors (`main > div`, `main > section`, `section`). These may not capture the actual section containers on CMS-heavy sites. Use the per-section data from **Phase 7, Step 7.2** (which walks the real DOM structure) for a more accurate picture.

If Phase 7 has already run, read its output. If not, run the following to collect section-level vertical spacing across ALL visible sections:

**Tool:** `browser_evaluate`

```js
() => {
  // Reuse the same section-parent detection as Phase 7
  const findSectionParent = () => {
    for (const sel of ['main', '[role="main"]', 'main > div', 'main > section']) {
      const el = document.querySelector(sel);
      if (el && el.children.length >= 2) return el;
    }
    for (const sel of [
      '[class*="Grid"] > [class*="Grid"]',
      '[class*="container"] > [class*="Grid"]',
      '.root [class*="Grid"]',
    ]) {
      const candidates = document.querySelectorAll(sel);
      for (const c of candidates) {
        if (c.children.length >= 3) return c;
      }
    }
    return document.querySelector('main') || document.body;
  };

  const parent = findSectionParent();
  const sections = [];
  Array.from(parent.children).forEach((el, i) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    sections.push({
      index: i,
      marginTop: cs.marginTop,
      marginBottom: cs.marginBottom,
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
    });
  });

  // Compute statistics
  const vals = (prop) => sections.map(s => parseFloat(s[prop]) || 0);
  const mode = (arr) => {
    const freq = {};
    arr.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const median = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const marginTops = vals('marginTop');
  const marginBottoms = vals('marginBottom');
  const paddingTops = vals('paddingTop');
  const paddingBottoms = vals('paddingBottom');

  return JSON.stringify({
    sectionCount: sections.length,
    sections,
    stats: {
      marginTop: { mode: mode(marginTops), median: median(marginTops), values: [...new Set(marginTops)].sort((a,b)=>a-b) },
      marginBottom: { mode: mode(marginBottoms), median: median(marginBottoms), values: [...new Set(marginBottoms)].sort((a,b)=>a-b) },
      paddingTop: { mode: mode(paddingTops), median: median(paddingTops), values: [...new Set(paddingTops)].sort((a,b)=>a-b) },
      paddingBottom: { mode: mode(paddingBottoms), median: median(paddingBottoms), values: [...new Set(paddingBottoms)].sort((a,b)=>a-b) },
    }
  }, null, 2);
}
```

**Interpretation:**

- If the **mode** of `marginTop` and `marginBottom` is `0` → most sections have no vertical spacing at the section level. The `sectionPaddingVertical` token should be `0px`, and any non-zero values are exceptions (handled per-section, not as a global default).
- If the mode is non-zero (e.g., `40`) → that's the standard section spacing.
- If values vary widely with no clear mode → use the **median** and note as irregular.

### 5.2 Scan raw CSS for spacing patterns

**Tool:** Grep

Search for common spacing properties to catch values not on the sampled page:

```
pattern: (margin|padding|gap)\s*:\s*[^;]+
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 60
```

### 5.3 Identify the spacing scale

Collect all unique numeric spacing values (deduplicated, sorted ascending).

#### Heuristic: Detecting the scale base

1. Parse all spacing values to numbers (strip `px`). Exclude `0`.
2. Find the **Greatest Common Divisor (GCD)** of the 5 most frequent values. This is likely the scale base.
   - If GCD = 4 → **4px base scale** (values: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96)
   - If GCD = 8 → **8px base scale** (values: 8, 16, 24, 32, 48, 64, 96)
   - If GCD = 5 or 10 → **5px/10px base** (less common but valid)
   - If GCD = 1 → **Irregular** (no consistent scale)
3. **Tolerance:** Allow ±1px rounding. If extracted values are `[7, 15, 23, 31, 47]`, these are likely `[8, 16, 24, 32, 48]` with sub-pixel rounding. Round each value to the nearest scale step and note the original.

#### Heuristic: Assigning key spacing tokens

| Token | How to determine | Fallback |
|-------|-----------------|----------|
| `sectionPaddingVertical` | Use the **mode** of `marginTop` + `paddingTop` values from Step 5.1b (live section measurement). If the mode is `0` across most sections, use `0px` — this indicates the site uses tight section spacing or utility classes. Only use a non-zero value if it is the **dominant** pattern. If sections have varying padding with no clear mode, use the **median**. | `40px` |
| `headingMarginTop` | `computed-styles.headings.h2.margin-top`. Use h2 (most representative). | `0.8em` |
| `headingMarginBottom` | `computed-styles.headings.h2.margin-bottom`. | `0.25em` |
| `paragraphMarginBottom` | `computed-styles.text.p.margin-bottom`. | `0.25em` |
| `containerPaddingHorizontal` | Use the value from Phase 7, Step 7.3.2 (innermost content-constraining container padding). This is more accurate than `computed-styles.containers[0].padding-left` which may match an outer non-constraining container. Only fall back to `computed-styles.containers[0]` if Phase 7 data is not yet available. | `24px` |
| `gap` | Most common `gap` value from `computed-styles.sections` or `containers`. If not set (no flex/grid), use `16px`. | `16px` |

**em vs px:** If the source site uses `em` values for heading/paragraph margins (common), keep them as `em` — they scale better. Only convert to `px` if the site uses explicit pixel values.

### 5.4 Write output

**Tool:** Write

Save to `migration-work/spacing.json`:

```json
{
  "scale": [0, 4, 8, 16, 24, 32, 48, 64],
  "scaleBase": "8px",
  "tokens": {
    "sectionPaddingVertical": "0px",
    "headingMarginTop": "32px",
    "headingMarginBottom": "12px",
    "paragraphMarginBottom": "16px",
    "containerPaddingHorizontal": "15px",
    "gap": "16px"
  },
  "sectionSpacingDetail": {
    "marginTopMode": "0px",
    "marginBottomMode": "0px",
    "paddingTopMode": "0px",
    "paddingBottomMode": "0px",
    "hasVariance": true,
    "exceptionalValues": ["40px"],
    "note": "Most sections have 0px margin/padding. One section has 40px margin-top."
  },
  "allValues": ["0px", "4px", "8px", "12px", "15px", "16px", "24px", "32px", "40px", "48px", "64px", "80px"]
}
```

**Key: `sectionSpacingDetail`**

This object captures per-section spacing variance discovered in Step 5.1b:

| Field | Description |
|-------|-------------|
| `marginTopMode` | The most common `margin-top` across all visible sections |
| `marginBottomMode` | The most common `margin-bottom` across all visible sections |
| `paddingTopMode` | The most common `padding-top` across all visible sections |
| `paddingBottomMode` | The most common `padding-bottom` across all visible sections |
| `hasVariance` | `true` if any section differs from the mode |
| `exceptionalValues` | Non-zero values that differ from the mode (for awareness) |
| `note` | Human-readable summary |

The CSS template uses `sectionPaddingVertical` (the mode) as the global `main > .section` margin. If this is `0px`, sections are tightly stacked and any spacing comes from inner content, not section wrappers.

### Validation

- [ ] Section top/bottom spacing captured using **live section measurement** (Step 5.1b), not just computed-styles samples
- [ ] `sectionSpacingDetail` recorded with mode, variance flag, and exceptional values
- [ ] `sectionPaddingVertical` reflects the **mode** (most common value), not a single sample or fallback
- [ ] Heading margins captured for at least h2 and h3
- [ ] Paragraph bottom margin captured
- [ ] `containerPaddingHorizontal` sourced from Phase 7 innermost container (not a generic container match)
- [ ] Spacing scale pattern identified (or explicitly noted as irregular)
- [ ] All unique spacing values listed in `allValues`

---

## Phase 6: Extract Breakpoints and Media Queries

Breakpoints can ONLY be extracted from the raw CSS. Computed styles are viewport-specific and reveal nothing about breakpoints.

### 6.1 Extract all @media rules from raw CSS

**Tool:** Grep

Search for all media query declarations:

```
pattern: @media[^{]+
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 100
```

### 6.2 Extract pixel values from media queries

From the grep results, extract all pixel values. These patterns will appear:

- `min-width: 768px` → breakpoint at 768px (mobile-first, desktop starts here)
- `max-width: 767px` → breakpoint at 768px (desktop-first, mobile is below this)
- `min-width: 1024px and max-width: 1279px` → range breakpoint

**Tool:** Grep — a more targeted search for just the numeric values:

```
pattern: (min|max)-width\s*:\s*\d+
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 100
```

### 6.3 Deduplicate and sort

From the extracted values, build a unique sorted list. Typical results look like:

```
[480, 600, 768, 900, 1024, 1200, 1440]
```

### 6.4 Identify the approach

#### Heuristic: Mobile-first vs Desktop-first

1. Count how many media queries use `min-width` vs `max-width` from the grep results.
2. **If min-width count > max-width count by 2x or more** → mobile-first.
3. **If max-width count > min-width count by 2x or more** → desktop-first.
4. **If roughly equal** → mixed.
5. **If 0 of both** → non-responsive site (no breakpoints). Document this explicitly.

### 6.5 Map to purpose

#### Heuristic: Assigning the "desktop" breakpoint

The **desktop breakpoint** is the single most important one — it determines when EDS switches from mobile to desktop layout. Use this decision tree:

1. **Find the breakpoint with the highest `matchCount`** (most media query rules). This is usually the primary layout breakpoint.
2. **If two breakpoints are close in count**, prefer the one in the 768px–1024px range (that's the tablet-to-desktop transition).
3. **Cross-reference with the content max-width** from Phase 7. The desktop breakpoint should be LESS than the content max-width. Example: if content max-width is 1200px (or the pixel equivalent of a percentage-based max-width like 85%), the desktop breakpoint is likely 768px or 1024px (not 1200px, which would be the wide breakpoint). If the content max-width is percentage-based, use the `contentMaxWidthPx` value from layout.json for comparison.

#### Heuristic: Mapping to EDS breakpoints

EDS uses two main breakpoints in `styles/styles.css`:
- **900px** — the primary mobile/desktop switch (the `@media (width >= 900px)` block)
- This is used for `:root` variable overrides and section layout

Decision logic for `edsMapping.desktopBreakpoint` (the value to use in all `@media` rules in `styles/styles.css` and block CSS):

1. **If the site's primary desktop breakpoint is 768px** → set `desktopBreakpoint` to `900px`. The 132px difference is negligible — EDS's 900px captures the same intent.
2. **If the site's primary desktop breakpoint is 900px–1024px** → set `desktopBreakpoint` to the site's value. It's close enough to EDS default to replace it directly.
3. **If the site's primary desktop breakpoint is >1024px** → this is probably a "wide" breakpoint, not desktop. Look for a lower breakpoint (tablet) that serves as the real mobile/desktop split.
4. **If the site's primary desktop breakpoint is <768px** (e.g., 600px) → set `desktopBreakpoint` to `900px` and note the discrepancy.

**IMPORTANT:** `desktopBreakpoint` is the **CSS-ready value** — the exact pixel value to use in `@media (width >= Xpx)` throughout the project. It is NOT the raw site value. The raw site value is stored separately in `siteRawDesktopBreakpoint` for reference only. Every `@media` rule in `styles/styles.css` and in block CSS files MUST use `desktopBreakpoint`, never `siteRawDesktopBreakpoint`.

| Breakpoint range | Typical purpose | EDS mapping |
|-----------------|----------------|-------------|
| 320–480px | Small → large mobile | No EDS equivalent needed |
| 481–767px | Large mobile → tablet | No EDS equivalent needed |
| 768–1024px | Tablet → desktop | → `desktopBreakpoint` (the CSS-ready value used in all `@media` rules) |
| 1025–1279px | Desktop → wide | → secondary breakpoint (optional) |
| 1280px+ | Wide → ultra-wide | → for content max-width only |

### 6.6 Write output

**Tool:** Write

Save to `migration-work/breakpoints.json`:

```json
{
  "approach": "mobile-first",
  "breakpoints": [
    { "value": "480px", "purpose": "small-mobile", "matchCount": 12 },
    { "value": "768px", "purpose": "tablet", "matchCount": 45 },
    { "value": "1024px", "purpose": "desktop", "matchCount": 38 },
    { "value": "1280px", "purpose": "wide-desktop", "matchCount": 8 }
  ],
  "edsMapping": {
    "siteRawDesktopBreakpoint": "1024px",
    "desktopBreakpoint": "1024px",
    "note": "Site uses 1024px for desktop. This is in the 900-1024px range, so we use the site's value directly as the CSS-ready breakpoint."
  },
  "rawMediaQueries": ["(min-width: 480px)", "(min-width: 768px)", "(min-width: 1024px)", "(min-width: 1280px)"]
}
```

### Validation

- [ ] All unique breakpoint pixel values listed and sorted
- [ ] Desktop breakpoint identified
- [ ] Tablet breakpoint identified (if exists)
- [ ] Mobile breakpoint identified (if exists)
- [ ] Mobile-first vs desktop-first approach noted
- [ ] At least 1 breakpoint found (if 0 found, the site may not be responsive — document this)
- [ ] `desktopBreakpoint` is the CSS-ready value (not the raw site value) and is stored in `edsMapping.desktopBreakpoint`
- [ ] `siteRawDesktopBreakpoint` stores the original site value for reference

---

## Phase 7: Extract Layout and Container Widths

This phase identifies how the source site constrains content width, pads content areas, and nests containers. The goal is to produce layout values that replicate the source site's content-centering strategy — **not just the rendered pixel values**, but the underlying mechanism (percentage-based max-width, fixed pixel max-width, padding-only constraint, etc.).

### 7.1 Collect from computed styles

Read `migration-work/computed-styles.json`. Extract from these entries:

- `containers` → `max-width`, `width`, `padding-left`, `padding-right`
- `header` → `max-width`, `height`, `min-height`
- `nav` → `height`
- `sections` → `max-width`, `display`, `gap`

### 7.2 Deep-measure content containers via Playwright

Computed styles from Phase 3 may show `max-width: none` if the constraint is on a deeper nested container. This step walks into the actual DOM to find the **innermost element that constrains content width** and measures its properties precisely.

**Tool:** `browser_evaluate`

```js
() => {
  const cs = (el) => el ? getComputedStyle(el) : null;

  // --- Header / Nav ---
  const headerHeight = (() => {
    const h = document.querySelector('header, [role="banner"]');
    return h ? Math.round(h.getBoundingClientRect().height) : null;
  })();
  const navHeight = (() => {
    const n = document.querySelector('nav');
    return n ? Math.round(n.getBoundingClientRect().height) : null;
  })();

  // --- Find the main content area ---
  // Try common patterns: <main>, [role="main"], first large container child of body
  const mainEl = document.querySelector('main, [role="main"]')
    || document.querySelector('[class*="content"]')
    || document.body;
  const mainRect = mainEl.getBoundingClientRect();
  const mainCs = cs(mainEl);

  // --- Walk visible sections and their inner containers ---
  //
  // Strategy: Find the main structural wrapper, then iterate its
  // visible children (the "sections"). For each section, walk
  // inward to find the innermost container that constrains width
  // (via max-width, a narrower rendered width, or horizontal padding).
  //
  // We collect layout props for EVERY visible section so that
  // Phase 5 and the CSS template can reason about variance.

  // Heuristic: find the element whose direct children are the
  // page-level "sections". This is typically <main>, <main> > div,
  // or a deep grid/container wrapper.
  const findSectionParent = () => {
    // Try standard selectors first
    for (const sel of [
      'main',
      '[role="main"]',
      'main > div',
      'main > section',
    ]) {
      const el = document.querySelector(sel);
      if (el && el.children.length >= 2) return el;
    }
    // AEM / CMS patterns: look for a grid wrapper with many children
    for (const sel of [
      '[class*="Grid"] > [class*="Grid"]',
      '[class*="container"] > [class*="Grid"]',
      '.root [class*="Grid"]',
    ]) {
      const candidates = document.querySelectorAll(sel);
      for (const c of candidates) {
        if (c.children.length >= 3) return c;
      }
    }
    return mainEl;
  };

  const sectionParent = findSectionParent();
  const viewportWidth = window.innerWidth;

  const sections = [];
  Array.from(sectionParent.children).forEach((section, i) => {
    const sCs = cs(section);
    if (sCs.display === 'none') return;

    const sectionData = {
      index: i,
      tag: section.tagName,
      className: (section.className || '').substring(0, 120),
      width: sCs.width,
      maxWidth: sCs.maxWidth,
      paddingTop: sCs.paddingTop,
      paddingBottom: sCs.paddingBottom,
      paddingLeft: sCs.paddingLeft,
      paddingRight: sCs.paddingRight,
      marginTop: sCs.marginTop,
      marginBottom: sCs.marginBottom,
      backgroundColor: sCs.backgroundColor,
      innerContainers: []
    };

    // Walk inward to find content-constraining containers
    const walkInner = (el, depth) => {
      if (depth > 6) return;
      Array.from(el.children).slice(0, 12).forEach(child => {
        const childCs = cs(child);
        if (childCs.display === 'none') return;
        const mw = childCs.maxWidth;
        const hasMW = mw !== 'none' && mw !== '0px';
        const hasPad = childCs.paddingLeft !== '0px' || childCs.paddingRight !== '0px';
        const ml = childCs.marginLeft;
        const mr = childCs.marginRight;
        const centered = (ml === 'auto' || mr === 'auto')
          || (ml === mr && ml !== '0px');

        if (hasMW || hasPad || centered) {
          sectionData.innerContainers.push({
            depth,
            tag: child.tagName,
            className: (child.className || '').substring(0, 80),
            renderedWidth: Math.round(child.getBoundingClientRect().width),
            maxWidth: mw,
            paddingLeft: childCs.paddingLeft,
            paddingRight: childCs.paddingRight,
            marginLeft: ml,
            marginRight: mr,
          });
        }
        walkInner(child, depth + 1);
      });
    };

    walkInner(section, 0);
    sections.push(sectionData);
  });

  return JSON.stringify({
    viewportWidth,
    headerHeight,
    navHeight,
    main: {
      renderedWidth: Math.round(mainRect.width),
      maxWidth: mainCs.maxWidth,
      paddingLeft: mainCs.paddingLeft,
      paddingRight: mainCs.paddingRight,
    },
    sectionCount: sections.length,
    sections,
  }, null, 2);
}
```

### 7.3 Analyze section-level layout patterns

From the Step 7.2 output, build a summary of the content-constraining strategy.

#### 7.3.1 Identify max-width type (percentage vs pixel)

For each section's `innerContainers`, look at the `maxWidth` property:

- **Percentage-based** (e.g., `85%`, `90%`): Record the percentage AND the computed `renderedWidth` at the measured viewport. Example: `maxWidth: "85%"` → `renderedWidth: 1224` at 1440px viewport.
- **Pixel-based** (e.g., `1200px`, `1140px`): Record directly.
- **None** (no `maxWidth` on any inner container): The section is full-bleed with no content constraint — content fills the viewport.

**Decision logic for `contentMaxWidth`:**

1. Collect all unique `maxWidth` values from the innermost constraining container of each section (the first `innerContainer` in each section's array, or the section itself if it has `maxWidth`).
2. If the **majority** of sections share the same `maxWidth` → use that as `contentMaxWidth`.
3. **If the shared value is a percentage** (e.g., `85%`): set `contentMaxWidth` to the percentage string (e.g., `"85%"`), AND record `contentMaxWidthPx` as the computed pixel equivalent at the measured viewport. Both go into `layout.json`.
4. **If the shared value is a pixel value** (e.g., `1200px`): set `contentMaxWidth` to that value. `contentMaxWidthPx` is the same value.
5. **If sections have mixed or no max-width**: use the most common rendered content width (rounded to nearest 10px) as `contentMaxWidth` in pixels, and note `"contentMaxWidthType": "measured"`.

#### 7.3.2 Identify inner container padding

For the innermost content-constraining containers identified above:

1. Collect all unique `paddingLeft` / `paddingRight` values.
2. Use the **mode** (most frequent) as `containerPadding.left` / `containerPadding.right`.
3. If all inner containers have `0px` padding but sections themselves have padding, use the section-level padding instead.
4. **Cross-validate:** The rendered content width should approximately equal `(max-width constraint) - paddingLeft - paddingRight`. If it doesn't, the padding source may be at a different nesting level — walk up.

#### 7.3.3 Detect nested container pattern

Some sites constrain content through multiple nested layers (e.g., `max-width: 85%` on an outer container, then another `max-width: 85%` on an inner one, yielding ~72% effective width).

1. For each section, count how many levels of `innerContainers` exist with a non-`none` `maxWidth`.
2. If **2 or more** levels have `maxWidth` constraints → record as `nestedContainers: true` in layout.json.
3. Record the effective innermost `renderedWidth` as `nestedContentWidth`.
4. If nested containers are detected, compute the **effective percentage** for the narrow constraint:
   - If both levels use percentage max-width: multiply them (e.g., `85% × 85% = 72.25%`)
   - If one level is pixel-based and the other percentage-based: convert to a single effective percentage relative to the viewport at the reference width (1440px), or use the pixel value directly.
   - Record this as `nestedEffectiveMaxWidth` in layout.json (e.g., `"72.25%"` or `"1015px"`).
5. **CSS generation note:** When `nestedContainers: true`, the CSS template MUST generate a `.section.narrow` variant that applies the tighter constraint. EDS uses a single `main > .section > div` container, so the default CSS maps to the **outermost** content constraint. Sections that originally had double nesting should use `Section Metadata` with `style | narrow` to get the tighter width.
6. During page migration, any section identified as having double-nested containers should receive `Section Metadata` with `style | narrow` (or `style | light, narrow` if it also has a background style).

#### 7.3.4 Detect full-bleed sections

A section is "full-bleed" when:
- The section itself has `maxWidth: none` or no `maxWidth`
- The section has `padding: 0` on all sides
- The section spans the full viewport width
- Background color is applied at the section level (not the inner container)

If **all or most** sections are full-bleed (content is constrained only by inner containers, not the section wrapper):
- Set `sectionLayout: "full-bleed"` in layout.json
- This means `main > .section` should NOT have horizontal padding or margin — only `main > .section > div` should constrain width.

If sections themselves have max-width or padding:
- Set `sectionLayout: "constrained"`

### 7.4 Scan raw CSS for max-width patterns

**Tool:** Grep

```
pattern: max-width\s*:\s*[^;]+
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 30
```

Look for values like `1200px`, `1140px`, `1280px`, `1440px`, or percentage values like `85%`, `90%`, `80%`. Record both pixel and percentage max-width values found.

### 7.5 Determine desktop container padding

The container padding may differ between mobile and desktop. From Step 7.2, the measurement was taken at one viewport width. To check for responsive padding changes:

1. Check the raw CSS corpus for media-query-scoped padding values on container-like selectors.
2. If the Phase 6 breakpoints show a desktop breakpoint, check whether any padding rules apply above that breakpoint.
3. If no responsive padding difference is found in the CSS, use the same padding for both mobile and desktop (do NOT invent a `32px` desktop override).

**Tool:** Grep

```
pattern: (padding-left|padding-right|padding)\s*:\s*[^;]+
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 40
```

Cross-reference any padding values found with the container padding from Step 7.3.2. Only record a separate `desktopContainerPadding` if there is explicit CSS evidence for a different value at a larger breakpoint.

### 7.6 Write output

**Tool:** Write

Save to `migration-work/layout.json`:

```json
{
  "contentMaxWidth": "85%",
  "contentMaxWidthPx": "1224px",
  "contentMaxWidthType": "percentage",
  "nestedContainers": false,
  "nestedContentWidth": null,
  "nestedEffectiveMaxWidth": null,
  "sectionLayout": "full-bleed",
  "headerHeight": "162px",
  "navHeight": "64px",
  "containerPadding": { "left": "15px", "right": "15px" },
  "desktopContainerPadding": null,
  "mainDisplay": "block",
  "sectionGap": "0px",
  "commonMaxWidths": ["85%", "1200px"],
  "note": "Site uses full-bleed sections with percentage-based inner container max-width (85%). Content is centered via auto margins on the inner container."
}
```

**Field descriptions:**

| Field | Description |
|-------|-------------|
| `contentMaxWidth` | The max-width value as written in CSS (may be `%` or `px`) |
| `contentMaxWidthPx` | The computed pixel equivalent at the measured viewport width |
| `contentMaxWidthType` | `"percentage"`, `"pixel"`, or `"measured"` |
| `nestedContainers` | Whether content is constrained through 2+ nested max-width layers |
| `nestedContentWidth` | The innermost effective content width if nested (else `null`) |
| `nestedEffectiveMaxWidth` | The CSS `max-width` value to apply on `.section.narrow > div` (e.g., `"72.25%"`). Computed by multiplying nested percentage constraints. `null` if `nestedContainers` is `false`. |
| `sectionLayout` | `"full-bleed"` (sections span viewport, inner div constrains) or `"constrained"` (sections themselves are narrowed) |
| `containerPadding` | Horizontal padding on the content-constraining container |
| `desktopContainerPadding` | Different padding at desktop breakpoint, or `null` if same as mobile |

### Validation

- [ ] Content area max-width captured — either from CSS or measured rendered width
- [ ] `contentMaxWidthType` is set (`"percentage"`, `"pixel"`, or `"measured"`)
- [ ] If percentage-based max-width: both percentage string AND pixel equivalent recorded
- [ ] Header height captured → maps to `--nav-height`
- [ ] Container horizontal padding captured from the **innermost** content-constraining container (not a generic `[class*="container"]` match)
- [ ] `desktopContainerPadding` is `null` OR backed by CSS evidence (NOT a fabricated `32px` default)
- [ ] `sectionLayout` is set (`"full-bleed"` or `"constrained"`)
- [ ] `nestedContainers` is documented (true/false)
- [ ] If `nestedContainers` is true: `nestedEffectiveMaxWidth` is computed (e.g., `"72.25%"`) and `nestedContentWidth` recorded
- [ ] At least one max-width value found in raw CSS or computed styles

---

## Phase 8: Extract Borders, Shadows, and Border-Radius

### 8.1 Collect from computed styles

Read `migration-work/computed-styles.json`. Extract decoration properties from:

- `buttons` → `border-radius`, `box-shadow`, `border-width`, `border-style`, `border-color`
- `cards` → `border-radius`, `box-shadow`, `border-width`, `border-style`, `border-color`
- `inputs` → `border-radius`, `border-width`, `border-style`, `border-color`
- `images` → `border-radius`

### 8.2 Scan raw CSS for shadow and radius patterns

**Tool:** Grep — search for box-shadow values:

```
pattern: box-shadow\s*:\s*[^;]+
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 20
```

**Tool:** Grep — search for border-radius values:

```
pattern: border-radius\s*:\s*[^;]+
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 20
```

### 8.3 Categorize

#### Heuristic: Border-radius tier assignment

1. Collect all unique border-radius pixel values from computed-styles + grep results.
2. Parse to numbers, sort ascending, exclude `0`.
3. Assign tiers:

| Tier | Range | How to assign |
|------|-------|--------------|
| **small** | 1px–5px | The **smallest non-zero** value found. If only one value exists, it is both small and the default. |
| **medium** | 6px–12px | The **most common** non-zero value, if different from small. |
| **large** | 13px–30px | Any value in this range. Often used for modals, large cards. |
| **full** | 50%, 9999px, or values > 100px | Fully rounded. Check for values like `50%`, `9999px`, `100px`, `2.4em`. |

4. **If only one non-zero value exists** → set `small` to that value, set `medium` and `large` to `null`.
5. **If no border-radius found** → all tiers are `"0px"`. The site uses square corners.
6. **The `--border-radius` custom property** in `:root` should be set to the **most common** value (the one appearing most in buttons + cards + inputs).

#### Heuristic: Box-shadow tier assignment

1. Collect all unique box-shadow values from computed-styles + grep results.
2. Parse the **blur radius** (3rd numeric value in the shorthand: `offset-x offset-y blur spread color`).
3. Assign tiers:

| Tier | Blur radius | How to assign |
|------|------------|--------------|
| **subtle** | 0–5px | Smallest blur. Typically: `0 1px 3px rgba(0,0,0,0.1)`. |
| **medium** | 6–15px | Mid-range blur. Typically: `0 4px 12px rgba(0,0,0,0.15)`. |
| **strong** | 16px+ | Largest blur. Typically: `0 8px 30px rgba(0,0,0,0.2)`. |

4. **If only one shadow found** → assign to `subtle`.
5. **If `none` is the only value** → all tiers are `null`. The site does not use shadows. This is a valid result.
6. **`box-shadow: none`** in computed styles often means the element has no shadow — not that shadows don't exist on the site. Check grep results for shadows that may not be on the sampled page.

#### Heuristic: Default border style

1. From all `border-width + border-style + border-color` values across cards, inputs, and tables:
2. **Most frequent combination** = the "default" border.
3. If multiple distinct borders exist (e.g., `1px solid #ddd` on cards but `1px solid #ccc` on inputs), use the card border as default (cards are more prominent in EDS layouts).

### 8.4 Write output

**Tool:** Write

Save to `migration-work/decoration.json`:

```json
{
  "borderRadius": {
    "small": "4px",
    "medium": "8px",
    "large": "16px",
    "full": "9999px",
    "allValues": ["0px", "4px", "8px", "16px"]
  },
  "boxShadow": {
    "subtle": "0 1px 3px rgba(0,0,0,0.1)",
    "medium": "0 4px 12px rgba(0,0,0,0.15)",
    "allValues": ["0 1px 3px rgba(0,0,0,0.1)", "0 4px 12px rgba(0,0,0,0.15)"]
  },
  "borders": {
    "default": "1px solid #dddddd",
    "input": "1px solid #cccccc",
    "divider": "1px solid #eeeeee"
  }
}
```

### Validation

- [ ] Button border-radius captured (or noted as 0/none)
- [ ] Card/teaser border-radius captured (if cards exist on the page)
- [ ] Box-shadow patterns captured (if any exist; "none found" is a valid result)
- [ ] Input border style captured (if forms exist on the page)
- [ ] Border-radius scale documented
- [ ] All unique values listed

---

## Phase 9: Extract Transitions and Interactive States

### 9.1 Collect transition properties from computed styles

Read `migration-work/computed-styles.json`. Extract the `transition`, `transition-duration`, `transition-property`, and `transition-timing-function` values from `links.a` and `buttons` entries.

Common patterns:
- `"all 0.3s ease"` → duration: 0.3s, easing: ease
- `"color 0.2s, background-color 0.2s"` → duration: 0.2s, properties: color + background-color
- `"all 0s ease 0s"` → no transition (default/none)

#### Heuristic: Determining the default transition

The `--transition-duration` and `--transition-easing` custom properties should represent the **site-wide default** — the transition applied to most interactive elements. Use this decision tree:

1. **Collect all transition-duration values** from links AND buttons in computed-styles.
2. **Exclude `0s`** — this means "no transition" (browser default).
3. **If all remaining values are the same** (e.g., all `0.3s ease`) → use that.
4. **If values differ** (e.g., links use `0.2s` and buttons use `0.3s`) → use the **link transition**, since links are more numerous and the link transition defines the general feel of the site.
5. **If computed styles show `0s` for everything** → check the grep results from 9.2. The site may declare transitions in CSS but they didn't compute on the sampled elements.
6. **If truly no transitions found anywhere** → set `--transition-duration` to `0.2s` and `--transition-easing` to `ease` (safe, unobtrusive default), and note `"detected": false` in the JSON.

#### Heuristic: Transition easing function

| Computed value | Simplified name | When to use |
|---------------|----------------|-------------|
| `ease` | ease | Default; good for most transitions |
| `ease-in-out` | ease-in-out | Smoother; common on premium sites |
| `ease-out` | ease-out | Common for entrance animations |
| `ease-in` | ease-in | Common for exit animations |
| `linear` | linear | Rarely used for UI; usually for progress bars |
| `cubic-bezier(...)` | custom | Preserve the exact value |

If multiple easing functions are found, use the one on links (same reasoning as duration).

### 9.2 Scan raw CSS for transition and animation rules

**Tool:** Grep

```
pattern: transition\s*:[^;]+
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 30
```

Also search for keyframe animations (for awareness — not mapped to EDS variables, but noted):

```
pattern: @keyframes\s+[\w-]+
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 20
```

### 9.3 Extract hover states via Playwright

If not already done in Phase 3.4, or if additional elements need testing, follow this sequence. If Phase 3.4 already captured link and button hover states, skip to 9.4.

**Link hover — full sequence:**

1. **Tool:** `browser_snapshot` — find a body link ref (look for `a` elements in `main` content, not nav/header)

2. **Tool:** `browser_evaluate` — capture pre-hover state:
```js
(el) => {
  const cs = getComputedStyle(el);
  return JSON.stringify({
    state: 'before-hover',
    color: cs.color,
    backgroundColor: cs.backgroundColor,
    textDecoration: cs.textDecorationLine,
    borderBottomColor: cs.borderBottomColor,
    opacity: cs.opacity,
  });
}
```
Set `ref` to the link's ref value. Set `element` to "body link".

3. **Tool:** `browser_hover` — `ref: {link ref}`, `element: "body link"`

4. **Tool:** `browser_evaluate` — capture post-hover state (same code as step 2, same ref)

5. Diff the before/after to identify what changed.

**Button hover — full sequence:**

Repeat steps 1-5 using a button element ref. Capture `backgroundColor`, `color`, `borderColor`, `boxShadow`, `transform` (some buttons scale on hover).

### 9.4 Extract focus-visible styles

Focus styles are important for accessibility. Test by tabbing to an element.

**Tool:** `browser_press_key`
```
key: Tab
```

Then immediately read the focused element's styles:

**Tool:** `browser_evaluate`

```js
() => {
  const focused = document.activeElement;
  if (!focused || focused === document.body) return JSON.stringify({ error: 'no focused element' });
  const cs = getComputedStyle(focused);
  return JSON.stringify({
    element: focused.tagName + (focused.className ? '.' + focused.className.split(' ')[0] : ''),
    outline: cs.outline,
    outlineColor: cs.outlineColor,
    outlineWidth: cs.outlineWidth,
    outlineOffset: cs.outlineOffset,
    outlineStyle: cs.outlineStyle,
    boxShadow: cs.boxShadow,
  });
}
```

Press Tab a few more times and re-evaluate to sample focus styles on different element types (links, buttons, inputs).

### 9.5 Scan raw CSS for focus/hover rules as backup

**Tool:** Grep

```
pattern: :focus(-visible)?\s*\{[^}]*
path: migration-work/raw-css-corpus.txt
output_mode: content
-A: 3
head_limit: 20
```

### 9.6 Write output

**Tool:** Write

Save to `migration-work/interactions.json`:

```json
{
  "transitions": {
    "default": "all 0.3s ease",
    "duration": "0.3s",
    "easing": "ease",
    "properties": ["color", "background-color", "border-color", "box-shadow"]
  },
  "hoverStates": {
    "link": {
      "before": { "color": "#0066cc", "textDecoration": "none" },
      "after": { "color": "#004499", "textDecoration": "underline" },
      "changes": ["color", "textDecoration"]
    },
    "button": null
  },
  "focusStyles": {
    "outline": "2px solid #0066cc",
    "outlineOffset": "2px",
    "boxShadow": "none"
  },
  "animations": ["fadeIn", "slideUp"]
}
```

### Validation

- [ ] Link hover color change captured (before + after)
- [ ] Button hover state captured (before + after) if real buttons exist, or set to `null` if only transparent/icon-font buttons found
- [ ] Transition duration and easing captured
- [ ] Focus/focus-visible outline styles captured
- [ ] Hover rules from raw CSS captured as backup
- [ ] All changed properties documented per element type

---

## Phase 10: Map to EDS Custom Properties

Take all extracted data and map to EDS variable names. Use this mapping table:

### Colors
```css
--background-color: /* body background-color */
--light-color: /* light section background, e.g., light gray */
--dark-color: /* dark section background or border color */
--text-color: /* body text color */
--link-color: /* link color */
--link-hover-color: /* link hover color */
```

### Typography
```css
--body-font-family: /* body font-family (include fallbacks) */
--heading-font-family: /* heading font-family (include fallbacks) */
--fixed-font-family: /* code/monospace font-family */

--body-font-size-m: /* body font-size */
--body-font-size-s: /* smaller body text (e.g., captions) */
--body-font-size-xs: /* smallest body text (e.g., fine print) */

--heading-font-size-xxl: /* h1 font-size */
--heading-font-size-xl: /* h2 font-size */
--heading-font-size-l: /* h3 font-size */
--heading-font-size-m: /* h4 font-size */
--heading-font-size-s: /* h5 font-size */
--heading-font-size-xs: /* h6 font-size */
```

### Layout
```css
--nav-height: /* header/nav height */
```

### Additional custom properties

If the source site uses tokens that don't map to standard EDS variables, create new custom properties following the EDS naming pattern:
```css
--brand-primary: /* primary brand color */
--brand-secondary: /* secondary brand color */
--border-radius: /* default border-radius */
--section-spacing: /* vertical space between sections */
--transition-duration: /* default transition speed */
```

### Base element styles (beyond variables)

EDS does not use CSS variables for every property. Many base element styles are set directly. Map these from `computed-styles.json`:

**Headings** — from `computed-styles.headings.*`:
| Property | Source | EDS target |
|----------|--------|------------|
| `font-weight` | `headings.h2.font-weight` (use h2 as default, override per-level if they differ) | `h1,h2,h3,h4,h5,h6 { font-weight }` |
| `line-height` | `headings.h2.line-height` | `h1,h2,h3,h4,h5,h6 { line-height }` |
| `margin-top` | `headings.h2.margin-top` | `h1,h2,h3,h4,h5,h6 { margin-top }` |
| `margin-bottom` | `headings.h2.margin-bottom` | `h1,h2,h3,h4,h5,h6 { margin-bottom }` |
| Individual overrides | If h1 has a different weight or line-height than h2-h6 | Separate `h1 { font-weight: 700 }` rule |

**Paragraphs & block elements** — from `computed-styles.text.p`:
| Property | Source | EDS target |
|----------|--------|------------|
| `margin-top` | `text.p.margin-top` | `p,dl,ol,ul,pre,blockquote { margin-top }` |
| `margin-bottom` | `text.p.margin-bottom` | `p,dl,ol,ul,pre,blockquote { margin-bottom }` |

**Lists** — from `computed-styles.lists.*`:
| Property | Source | EDS target |
|----------|--------|------------|
| `list-style-type` | `lists.ul.list-style-type` | `ul { list-style-type }` (only if non-default) |
| `padding-left` | `lists.ul.padding-left` | `ul, ol { padding-left }` |
| `li margin-bottom` | `text.li.margin-bottom` | `li { margin-bottom }` (only if non-zero) |

**Blockquote** — from `computed-styles.text.blockquote`:
| Property | Source | EDS target |
|----------|--------|------------|
| `border-left` | `blockquote.border-left-width/style/color` | `blockquote { border-left }` |
| `padding-left` | `blockquote.padding-left` | `blockquote { padding-left }` |
| `font-style` | `blockquote.font-style` | `blockquote { font-style }` (only if italic) |
| `color` | `blockquote.color` | `blockquote { color }` (only if different from body) |

**Inline code** — from `computed-styles.codeElements.codeInline`:
| Property | Source | EDS target |
|----------|--------|------------|
| `background-color` | `codeInline.background-color` | `code { background-color }` |
| `padding` | `codeInline.padding-*` | `code { padding }` |
| `border-radius` | `codeInline.border-radius` | `code { border-radius }` |
| `font-size` | `codeInline.font-size` | `code { font-size }` |

**Pre (code blocks)** — from `computed-styles.codeElements.pre`:
| Property | Source | EDS target |
|----------|--------|------------|
| `padding` | `pre.padding-*` | `pre { padding }` |
| `border-radius` | `pre.border-radius` | `pre { border-radius }` |
| `background-color` | `pre.background-color` | `pre { background-color }` |

**Horizontal rule** — from `computed-styles.hr`:
| Property | Source | EDS target |
|----------|--------|------------|
| `border-top` | `hr.border-top-*` | `hr { border }` |
| `margin` | `hr.margin-top/bottom` | `hr { margin }` |
| `background-color` | `hr.background-color` | `hr { background-color }` (only if visible/non-default) |

**Tables** — from `computed-styles.tableElements.*`:
| Property | Source | EDS target |
|----------|--------|------------|
| `border-collapse` | `table.border-collapse` | `table { border-collapse }` |
| `th background` | `th.background-color` | `th { background-color }` |
| `th/td border` | `th.border-*` | `th, td { border }` |
| `th/td padding` | `th.padding-*` | `th, td { padding }` |
| `th text-align` | `th.text-align` | `th { text-align }` |
| `th font-weight` | `th.font-weight` | `th { font-weight }` |

**Images** — from `computed-styles.images`:
| Property | Source | EDS target |
|----------|--------|------------|
| `max-width` | `images.max-width` | `main img { max-width }` |
| `border-radius` | `images.border-radius` | `main img { border-radius }` (only if non-zero) |
| `object-fit` | `images.object-fit` | `main img { object-fit }` (only if not `fill`) |

**Figure/figcaption** — from `computed-styles.figure.*`:
| Property | Source | EDS target |
|----------|--------|------------|
| `figure margin` | `figure.margin-*` | `figure { margin }` |
| `figcaption font-size` | `figcaption.font-size` | `figcaption { font-size }` |
| `figcaption color` | `figcaption.color` | `figcaption { color }` (only if different from body) |

**Rule for "only if different":** Many of these elements inherit from `body`. Only add an explicit CSS rule if the extracted value is DIFFERENT from the body or parent default. For example, if `li` has the same `color` as `body`, do not add a `li { color }` rule.

### Validation

- [ ] Every standard EDS variable has a mapped value
- [ ] Additional custom properties created for site-specific tokens
- [ ] All values are valid CSS (no typos, proper units)
- [ ] Base element styles mapped from computed-styles.json
- [ ] Heading font-weight checked per level (h1 may differ from h2-h6)
- [ ] Paragraph/blockquote margins mapped
- [ ] Table styles mapped (if tables exist on the source site)
- [ ] `hr` styles mapped (if horizontal rules exist)
- [ ] Only non-inherited, non-default values produce explicit CSS rules

---

## Phase 11: Generate Output Files

### 11.1 Generate `styles/styles.css`

**CRITICAL:** Read the existing `styles/styles.css` BEFORE writing. The boilerplate has a specific structure that EDS depends on. You must preserve that structure and replace values — not rewrite from scratch.

**Step 1 — Read the boilerplate:**

**Tool:** Read `styles/styles.css`

**Step 2 — Read all extraction outputs:**

**Tool:** Read these files (all produced by earlier phases):
- `migration-work/color-palette.json` → colors for `:root`
- `migration-work/typography.json` → font families, sizes, weights, line heights
- `migration-work/spacing.json` → margins, paddings, section spacing
- `migration-work/breakpoints.json` → media query values
- `migration-work/layout.json` → container widths, nav height
- `migration-work/decoration.json` → border-radius, box-shadow, borders
- `migration-work/interactions.json` → hover states, transitions, focus styles
- `migration-work/extracted-variables.json` → any site-specific CSS variables

**Step 3 — Write the updated file.**

**Tool:** Write to `styles/styles.css`

Below is the **complete template**. Every `{PLACEHOLDER}` must be replaced with the actual extracted value from the corresponding JSON file. The source for each value is noted in comments.

```css
/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* === Design tokens extracted from: {SOURCE_URL} === */
/* === Extraction date: {TIMESTAMP} === */

:root {
  /* colors — source: color-palette.json */
  --background-color: {color-palette.backgrounds.main};
  --light-color: {color-palette.backgrounds.light};
  --dark-color: {color-palette.backgrounds.dark};
  --text-color: {color-palette.text.primary};
  --link-color: {color-palette.links.default};
  --link-hover-color: {color-palette.links.hover};
  --overlay-background-color: {color-palette.backgrounds.light, with ~50% opacity if available, else same as --light-color};

  /* fonts — source: typography.json (+ typography.cjk if CJK site) */
  /* IMPORTANT: If typography.cjk.isCjk is true, use typography.cjk.fullBodyFontFamily instead of
     typography.body.fontFamily. This includes the web font + CJK system fallback chain.
     If NOT a CJK site, use typography.body.fontFamily and append the -fallback font name. */
  --body-font-family: {IF CJK: typography.cjk.fullBodyFontFamily — ELSE: typography.body.fontFamily, {body-font-name}-fallback, sans-serif};
  --heading-font-family: {IF CJK and sameAsBody: var(--body-font-family) — IF CJK and different: heading web font + CJK fallback chain — ELSE: typography.headings.fontFamily, {heading-font-name}-fallback, sans-serif};
  --fixed-font-family: {typography.fixed.fontFamily — or 'Menlo, Consolas, "Liberation Mono", monospace' if not detected};

  /* body sizes (mobile-first: these are mobile values) — source: typography.json */
  --body-font-size-m: {typography.body.fontSize};
  --body-font-size-s: {typography.body.fontSize minus ~2-3px, or from smaller text detected};
  --body-font-size-xs: {typography.body.fontSize minus ~4-5px, or from fine print detected};

  /* heading sizes (mobile-first) — source: typography.json */
  /*
   * If typography.responsive.hasResponsiveTypography is TRUE:
   *   Use typography.responsive.mobileSizes here (mobile values as base)
   *   Desktop overrides go in the @media block below
   *
   * If typography.responsive.hasResponsiveTypography is FALSE:
   *   Use typography.headings.sizes directly (single set of values)
   *   DELETE the @media block for heading size overrides
   */
  --heading-font-size-xxl: {IF responsive: typography.responsive.mobileSizes.h1.fontSize — ELSE: typography.headings.sizes.h1.fontSize};
  --heading-font-size-xl: {IF responsive: typography.responsive.mobileSizes.h2.fontSize — ELSE: typography.headings.sizes.h2.fontSize};
  --heading-font-size-l: {IF responsive: typography.responsive.mobileSizes.h3.fontSize — ELSE: typography.headings.sizes.h3.fontSize};
  --heading-font-size-m: {IF responsive: typography.responsive.mobileSizes.h4.fontSize — ELSE: typography.headings.sizes.h4.fontSize};
  --heading-font-size-s: {IF responsive: typography.responsive.mobileSizes.h5.fontSize — ELSE: typography.headings.sizes.h5.fontSize};
  --heading-font-size-xs: {IF responsive: typography.responsive.mobileSizes.h6.fontSize — ELSE: typography.headings.sizes.h6.fontSize};

  /* nav heights — source: layout.json */
  --nav-height: {layout.navHeight or layout.headerHeight — MUST be extracted from Phase 7.2};
  --breadcrumbs-height: 34px; /* EDS internal default — breadcrumbs are generated by EDS, not extracted from source. Record as "eds-default" provenance, not "extracted". Adjust later if breadcrumbs render at a different height. */
  --header-height: var(--nav-height);

  /* site-specific tokens — source: extracted-variables.json, color-palette.json, decoration.json, interactions.json */
  /* Only include these if values were found. Delete any line where the extraction returned null/none. */
  --brand-primary: {color-palette.brand.primary};
  --brand-secondary: {color-palette.brand.secondary};
  --border-color: {color-palette.borders.default};
  --border-radius: {decoration.borderRadius.small or the most common border-radius};
  --box-shadow: {decoration.boxShadow.subtle or 'none' if no shadows found};
  --section-spacing: {spacing.tokens.sectionPaddingVertical — use the mode from Step 5.1b; may be '0px' if sections are tightly stacked};
  --transition-duration: {interactions.transitions.duration};
  --transition-easing: {interactions.transitions.easing};
}

/* fallback fonts — source: typography.json */
/*
 * Generate a fallback @font-face for each custom web font used in --body-font-family
 * and --heading-font-family. Use size-adjust to match the web font's metrics.
 *
 * CHOOSING THE CORRECT SYSTEM FALLBACK:
 *
 * For LATIN (non-CJK) sites:
 *   - Sans-serif web fonts → src: local('Arial')
 *   - Serif web fonts → src: local('Times New Roman')
 *   - Monospace web fonts → src: local('Courier New')
 *
 * For JAPANESE sites (typography.cjk.scriptType === 'japanese'):
 *   - Sans-serif (gothic) → src: local('Hiragino Kaku Gothic ProN'), local('Yu Gothic Medium'), local('Meiryo')
 *   - Serif (mincho) → src: local('Hiragino Mincho ProN'), local('Yu Mincho')
 *   NOTE: The -fallback @font-face is LESS critical for CJK since the full system
 *   fallback chain is already in --body-font-family. But it still helps with CLS
 *   (Cumulative Layout Shift) if the web font loads late.
 *
 * For KOREAN sites: src: local('Apple SD Gothic Neo'), local('Malgun Gothic')
 * For CHINESE SIMPLIFIED: src: local('PingFang SC'), local('Microsoft YaHei')
 * For CHINESE TRADITIONAL: src: local('PingFang TC'), local('Microsoft JhengHei')
 *
 * If you cannot determine size-adjust, use 100% as default.
 * For CJK fonts, size-adjust is typically 95%-105% relative to the system CJK font.
 */
@font-face {
  font-family: {body-font-name}-fallback;
  size-adjust: {calculated percentage, e.g. 99.5%};
  src: local('{system fallback — see table above for correct font by script type}');
}

/* Only include a second fallback if heading font differs from body font */
@font-face {
  font-family: {heading-font-name}-fallback;
  size-adjust: {calculated percentage};
  src: local('{system fallback}');
}

/* Responsive adjustments — source: breakpoints.json, typography.json → responsive */
/*
 * CONDITIONAL: Only include this @media block if typography.responsive.hasResponsiveTypography is true.
 * If the site does NOT have responsive typography (same sizes at all breakpoints), DELETE this entire @media block.
 *
 * When included:
 * - The :root block above uses MOBILE values (from typography.responsive.mobileSizes)
 * - This @media block overrides with DESKTOP values (from typography.responsive.desktopSizes)
 * - The breakpoint value comes from breakpoints.edsMapping.desktopBreakpoint (never hardcoded)
 */
@media (width >= {breakpoints.edsMapping.desktopBreakpoint}) {
  :root {
    /* body sizes — desktop values from typography.responsive.desktopSizes */
    --body-font-size-m: {typography.responsive.desktopSizes.body.fontSize — only if different from mobile};
    --body-font-size-s: {desktop smaller text size};
    --body-font-size-xs: {desktop fine print size};

    /* heading sizes — desktop values from typography.responsive.desktopSizes */
    --heading-font-size-xxl: {typography.responsive.desktopSizes.h1.fontSize};
    --heading-font-size-xl: {typography.responsive.desktopSizes.h2.fontSize};
    --heading-font-size-l: {typography.responsive.desktopSizes.h3.fontSize};
    --heading-font-size-m: {typography.responsive.desktopSizes.h4.fontSize};
    --heading-font-size-s: {typography.responsive.desktopSizes.h5.fontSize};
    --heading-font-size-xs: {typography.responsive.desktopSizes.h6.fontSize};
  }
}

body {
  display: none;
  margin: 0;
  background-color: var(--background-color);
  color: var(--text-color);
  font-family: var(--body-font-family);
  font-size: var(--body-font-size-m);
  line-height: {typography.body.lineHeight — CJK sites typically use 1.7-2.0; if extracted value is below 1.5 on a CJK site, verify against CJK-heavy paragraphs before using};
  letter-spacing: {typography.body.letterSpacing — omit this line if '0px' or 'normal'};
}

body.appear {
  display: block;
}

header {
  height: var(--header-height);
}

header .header,
footer .footer {
  visibility: hidden;
}

header .header[data-block-status="loaded"],
footer .footer[data-block-status="loaded"] {
  visibility: visible;
}

@media (width >= {breakpoints.edsMapping.desktopBreakpoint}) {
  body[data-breadcrumbs] {
    --header-height: calc(var(--nav-height) + var(--breadcrumbs-height));
  }
}

h1,
h2,
h3,
h4,
h5,
h6 {
  margin-top: {spacing.headings.h2.marginTop — MUST be extracted; if not found, record as defaulted and use '0.8em'};
  margin-bottom: {spacing.headings.h2.marginBottom — MUST be extracted; if not found, record as defaulted and use '0.25em'};
  font-family: var(--heading-font-family);
  font-weight: {typography.headings.sizes.h2.fontWeight — MUST be extracted; if not found, record as defaulted and use '600'};
  line-height: {typography.headings.sizes.h2.lineHeight — MUST be extracted; if not found, record as defaulted and use '1.25'};
  scroll-margin: 40px;
}

h1 { font-size: var(--heading-font-size-xxl); }
h2 { font-size: var(--heading-font-size-xl); }
h3 { font-size: var(--heading-font-size-l); }
h4 { font-size: var(--heading-font-size-m); }
h5 { font-size: var(--heading-font-size-s); }
h6 { font-size: var(--heading-font-size-xs); }

/* Per-heading overrides — source: computed-styles.headings.h1-h6 */
/* ONLY include these if a specific heading level has a DIFFERENT font-weight, line-height,
   or margin than the shared rule above. Check each level against h2 (used as the shared default).
   If all levels match h2, DELETE this entire block. Common case: h1 is bolder (700) while h2-h6 are 600. */
h1 {
  font-weight: {headings.h1.font-weight — ONLY if different from shared rule above; otherwise omit};
  line-height: {headings.h1.line-height — ONLY if different; otherwise omit};
}
/* Repeat for h3-h6 only if they differ from the shared defaults. Delete any empty rule. */

p,
dl,
ol,
ul,
pre,
blockquote {
  margin-top: {spacing.paragraph.marginTop — MUST be extracted from computed-styles.text.p; if not found, record as defaulted};
  margin-bottom: {spacing.paragraph.marginBottom — MUST be extracted from computed-styles.text.p; if not found, record as defaulted};
}

code,
pre {
  font-size: var(--body-font-size-s);
}

/* inline code — source: computed-styles.codeElements.codeInline */
/* Only include this block if the source site styles inline <code> differently from surrounding text.
   If codeInline returned null or has no background-color, OMIT this entire block. */
code:not(pre code) {
  background-color: {codeElements.codeInline.background-color — omit block if transparent or not found};
  padding: {codeElements.codeInline padding values — e.g. '2px 4px'};
  border-radius: {codeElements.codeInline.border-radius — e.g. '3px'};
}

pre {
  padding: {codeElements.pre.padding-top — or '16px'};
  border-radius: {decoration.borderRadius.medium or '8px'};
  background-color: var(--light-color);
  overflow-x: auto;
  white-space: pre;
}

/* blockquote — source: computed-styles.text.blockquote */
/* Only include if blockquote has distinctive styling (border-left, italic, different color).
   If blockquote returned null, OMIT this entire block. */
blockquote {
  border-left: {blockquote.border-left-width} {blockquote.border-left-style} {blockquote.border-left-color — omit line if no left border};
  padding-left: {blockquote.padding-left — omit line if '0px'};
  font-style: {blockquote.font-style — omit line if 'normal'};
  color: {blockquote.color — omit line if same as body text color};
}

/* horizontal rule — source: computed-styles.hr */
/* Only include if hr was found on the page. If hr returned null, OMIT this entire block. */
hr {
  border: 0;
  border-top: {hr.border-top-width} {hr.border-top-style} {hr.border-top-color — e.g. '1px solid #ddd'};
  margin: {hr.margin-top} 0 {hr.margin-bottom} 0;
}

/* lists — source: computed-styles.lists */
/* Only include if list styling differs from browser defaults.
   Default padding-left is ~40px. Only set if different. */
ul, ol {
  padding-left: {lists.ul.padding-left — omit block if '40px' or default};
}

/* Only include li margin if the source site spaces list items apart */
li {
  margin-bottom: {text.li.margin-bottom — omit block entirely if '0px'};
}

/* tables — source: computed-styles.tableElements */
/* Only include if tables exist on the source site. If tableElements.table returned null, OMIT all table rules. */
table {
  border-collapse: {tableElements.table.border-collapse — usually 'collapse'};
  width: {tableElements.table.width — e.g. '100%'};
}

th, td {
  border: {tableElements.th.border-width} {tableElements.th.border-style} {tableElements.th.border-color};
  padding: {tableElements.th.padding-top} {tableElements.th.padding-right} {tableElements.th.padding-bottom} {tableElements.th.padding-left};
  text-align: {tableElements.td.text-align — usually 'left'; omit if 'left'};
  vertical-align: {tableElements.td.vertical-align — omit if 'middle' or default};
}

th {
  background-color: {tableElements.th.background-color — omit line if transparent};
  font-weight: {tableElements.th.font-weight — omit if same as body or '700' (default for th)};
}

/* figure/figcaption — source: computed-styles.figure */
/* Only include if figures exist on the source site. If figure.figure returned null, OMIT. */
figure {
  margin: {figure.figure.margin-* values — e.g. '1em 0'};
}

figcaption {
  font-size: {figure.figcaption.font-size — e.g. 'var(--body-font-size-s)' or a concrete value};
  color: {figure.figcaption.color — omit line if same as body text color};
}

main > div {
  margin: {spacing.tokens.sectionPaddingVertical — from extraction} {spacing.tokens.containerPaddingHorizontal — from extraction};
}
/* NOTE: The 'main > div' rule above is the EDS fallback for unsectioned content.
   The section rules below (main > .section) take precedence for sectioned pages. */

input,
textarea,
select,
button {
  font: inherit;
}

/* links — source: color-palette.json, interactions.json */
a:any-link {
  color: var(--link-color);
  text-decoration: {interactions.hoverStates.link.before.textDecoration — usually 'none'};
  overflow-wrap: break-word;
  transition: color var(--transition-duration, 0.2s) var(--transition-easing, ease);
}

a:hover {
  color: var(--link-hover-color);
  text-decoration: {interactions.hoverStates.link.after.textDecoration — usually 'underline'};
}

/* buttons — source: color-palette.json, decoration.json, interactions.json */
/*
 * CONDITIONAL: Use ONE of the two blocks below depending on whether
 * color-palette.buttons is null or has values.
 */

/* === IF color-palette.buttons is NOT null (real buttons detected) === */
a.button:any-link,
button {
  box-sizing: border-box;
  display: inline-block;
  max-width: 100%;
  margin: 12px 0;
  border: {decoration.borders.default — e.g. '2px solid transparent'};
  border-radius: {decoration.borderRadius for buttons — e.g. '2.4em'};
  padding: 0.5em 1.2em;
  font-family: var(--body-font-family);
  font-style: normal;
  font-weight: {typography.body.fontWeight for buttons — usually '500' or '600'};
  line-height: 1.25;
  text-align: center;
  text-decoration: none;
  background-color: {color-palette.buttons.primaryBg};
  color: {color-palette.buttons.primaryText};
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background-color var(--transition-duration, 0.2s) var(--transition-easing, ease);
}

a.button:hover,
a.button:focus,
button:hover,
button:focus {
  background-color: {color-palette.buttons.primaryHoverBg};
  cursor: pointer;
}

button:disabled,
button:disabled:hover {
  background-color: var(--light-color);
  cursor: unset;
}

a.button.secondary,
button.secondary {
  background-color: unset;
  border: 2px solid currentcolor;
  color: var(--text-color);
}

/* === IF color-palette.buttons IS null (no real buttons detected) === */
/* a.button:any-link stays link-like — no border, background, or border-radius */
a.button:any-link {
  color: var(--link-color);
  font-weight: 500;
  text-decoration: none;
}

a.button:hover,
a.button:focus {
  color: var(--link-hover-color);
  text-decoration: {interactions.hoverStates.link.after.textDecoration — usually 'underline'};
}

/* native button elements get minimal styling */
button {
  font: inherit;
  border: none;
  background-color: transparent;
  color: var(--link-color);
  cursor: pointer;
}

button:hover,
button:focus {
  color: var(--link-hover-color);
}

button:disabled,
button:disabled:hover {
  color: var(--light-color);
  cursor: unset;
}

/* === END conditional === */

main img {
  max-width: 100%;
  width: auto;
  height: auto;
  border-radius: {decoration.borderRadius for images — omit this line if '0px' or not found};
}

.icon {
  display: inline-block;
  height: 24px;
  width: 24px;
}

.icon img {
  height: 100%;
  width: 100%;
}

/* sections — source: spacing.json, layout.json */
/*
 * CONDITIONAL: Use ONE of the two blocks below depending on the value of
 * layout.sectionLayout ("full-bleed" vs "constrained") and layout.contentMaxWidthType.
 *
 * Read layout.json and spacing.json to determine which block to use.
 */

/* === IF layout.sectionLayout is "full-bleed" (sections span viewport, inner div constrains) === */
/* This is common on CMS sites where outer section wrappers are full-width and an inner
   container handles the max-width constraint. */
main > .section {
  margin: {spacing.tokens.sectionPaddingVertical — MUST be extracted from Phase 5.1b live section measurement} 0;
}

main > .section > div {
  max-width: {layout.contentMaxWidth — MUST be extracted from Phase 7; use the raw value e.g. '85%' or '1200px'};
  margin: auto;
  padding: 0 {spacing.tokens.containerPaddingHorizontal — MUST be extracted from Phase 7 innermost container};
}

main > .section:first-of-type {
  margin-top: 0;
}

/*
 * Desktop padding override: Only include this @media block if layout.desktopContainerPadding
 * is NOT null (i.e., there is CSS evidence for a different padding at desktop).
 * If layout.desktopContainerPadding is null, DELETE this entire @media block.
 * Do NOT fabricate a 32px desktop override — use only values backed by source CSS evidence.
 */
@media (width >= {breakpoints.edsMapping.desktopBreakpoint}) {
  main > .section > div {
    padding: 0 {layout.desktopContainerPadding.left — ONLY if not null};
  }
}

/*
 * Narrow section variant: Only include if layout.nestedContainers is true.
 * This replicates the double-nested container pattern from the source site.
 * Sections with Section Metadata style "narrow" get a tighter inner width.
 * If layout.nestedContainers is false, DELETE this entire block.
 */
main > .section.narrow > div {
  max-width: {layout.nestedEffectiveMaxWidth — e.g. '72.25%' — computed in Phase 7.3.3};
}

/* section metadata */
main .section.light,
main .section.highlight {
  background-color: var(--light-color);
  margin: 0;
  padding: {spacing.tokens.sectionPaddingVertical — from extraction; use same value as section margin above} 0;
}

/* === IF layout.sectionLayout is "constrained" (sections themselves have max-width/padding) === */
/* Use this block when the source site constrains content at the section level, not an inner div. */
main > .section {
  max-width: {layout.contentMaxWidth — MUST be extracted from Phase 7};
  margin: {spacing.tokens.sectionPaddingVertical — MUST be extracted from Phase 5.1b} auto;
  padding: 0 {spacing.tokens.containerPaddingHorizontal — MUST be extracted from Phase 7};
}

main > .section > div {
  max-width: unset;
  margin: 0;
  padding: 0;
}

main > .section:first-of-type {
  margin-top: 0;
}

/* Desktop padding override — same rule as full-bleed: only if desktopContainerPadding is not null */
@media (width >= {breakpoints.edsMapping.desktopBreakpoint}) {
  main > .section {
    padding: 0 {layout.desktopContainerPadding.left — ONLY if not null};
  }
}

/*
 * Narrow section variant (constrained mode): Only include if layout.nestedContainers is true.
 * In constrained mode, the section itself constrains — so narrow overrides the section max-width.
 * If layout.nestedContainers is false, DELETE this entire block.
 */
main > .section.narrow {
  max-width: {layout.nestedEffectiveMaxWidth — e.g. '72.25%' or '1015px'};
}

/* section metadata */
main .section.light,
main .section.highlight {
  background-color: var(--light-color);
  margin: 0 auto;
  padding: {spacing.tokens.sectionPaddingVertical — from extraction} {spacing.tokens.containerPaddingHorizontal — from extraction};
}

/* === END conditional === */

/* focus styles — source: interactions.json */
/* Only include if the source site has custom focus styles. Delete if using browser defaults. */
:focus-visible {
  outline: {interactions.focusStyles.outline};
  outline-offset: {interactions.focusStyles.outlineOffset};
}
```

**How to use this template:**

1. For each `{placeholder}`, look up the value in the named JSON file
2. **CRITICAL — Provenance tracking:** As you resolve each placeholder, classify it as one of:
   - **`extracted`** — value came directly from computed styles, raw CSS, or Playwright measurement of the source site
   - **`derived`** — value was calculated from extracted values (e.g., body-font-size-s = body-font-size minus 2px)
   - **`defaulted`** — value could not be extracted and falls back to an EDS boilerplate or hardcoded default

   **Build a running list of defaulted values** as you work. Every defaulted value MUST be recorded in `migration-work/design-system-extracted.json` → `summary.defaultedValues` (see Phase 12.3). This is how future sessions know which values are real and which are placeholders.
3. If a comment says "omit this line if...", delete the entire CSS property line when the condition is met
4. If the source site has NO responsive typography (same sizes at all breakpoints), delete the `@media` block that adjusts `:root` heading sizes
5. Delete any site-specific `--brand-*` or `--border-*` or `--transition-*` variables that were not actually found during extraction — do not leave placeholders in the final output
6. **NEVER silently substitute a boilerplate default for a value that should have been extracted.** If a core value (colors, fonts, breakpoints, body typography) cannot be extracted, this is an extraction failure — investigate why before falling back.

**Common pitfall:** Do not leave any `{placeholder}` strings in the final file. Every value must be a real CSS value. If you cannot determine a value, first try to extract it from a different page on the source site. Only use a default as a last resort, and ALWAYS record it in the `defaultedValues` list.

### 11.2 Generate `styles/fonts.css`

If @font-face declarations were found in Phase 4, write them to `styles/fonts.css`. This file handles the actual web font loading — separate from the fallback `@font-face` entries in `styles.css` which only provide size-adjusted system font fallbacks.

**Template for self-hosted fonts:**

```css
/* Fonts extracted from: {SOURCE_URL} */
/* Source: typography.json → fontFaces array */

/* For each entry in typography.fontFaces, generate one @font-face block: */
@font-face {
  font-family: '{typography.fontFaces[n].family}';
  src: url('{typography.fontFaces[n].src}') format('{format: woff2, woff, etc.}');
  font-weight: {typography.fontFaces[n].weight};
  font-style: {typography.fontFaces[n].style};
  font-display: {typography.fontFaces[n].display — default to 'swap' if not specified};
  unicode-range: {typography.fontFaces[n].unicodeRange — only include if present, critical for CJK subsetted fonts};
}
```

**Template for CDN fonts (Google Fonts):**

```css
/* Fonts loaded from Google Fonts CDN */
@import url('https://fonts.googleapis.com/css2?family={font-name}:wght@{weights}&display=swap');
```

**For TypeSquare, FONTPLUS, Adobe Fonts (Typekit):** These services load via `<script>` or `<link>` tags in `<head>`, NOT via CSS `@import`. In this case:
- Leave `styles/fonts.css` empty or with a comment noting the service
- The actual loading happens in `head.html` (see 11.3)

### 11.3 Update `head.html` (if needed)

Read the existing `head.html` first. If external font services require `<link>` or `<script>` tags, add them.

**Tool:** Read `head.html`

Then add the font service tags. Examples:

```html
<!-- TypeSquare -->
<script src="https://typesquare.com/3/tsst/script/{PROJECT_ID}.js" charset="utf-8"></script>

<!-- FONTPLUS -->
<script src="https://webfont.fontplus.jp/accessor/script/face.js?{PARAMS}" charset="utf-8"></script>

<!-- Adobe Fonts (Typekit) -->
<link rel="stylesheet" href="https://use.typekit.net/{KIT_ID}.css">

<!-- Google Fonts (alternative to @import in fonts.css) -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family={font}&display=swap" rel="stylesheet">
```

**Also add `fonts.css` link if it has content:**

```html
<link rel="stylesheet" href="/styles/fonts.css">
```

### Validation

- [ ] `styles/styles.css` has been updated — NO `{placeholder}` strings remain in the file
- [ ] `:root` block contains all standard EDS variables with site-specific values
- [ ] Every `{placeholder}` was resolved to an actual CSS value or the EDS boilerplate default was kept
- [ ] `--body-font-family` is not `roboto` (unless the source site actually uses Roboto)
- [ ] `--heading-font-family` is not `roboto-condensed` (unless the source site actually uses Roboto Condensed)
- [ ] `--link-color` and `--link-hover-color` reflect the source site, not EDS blue defaults
- [ ] `--text-color` and `--background-color` reflect the source site
- [ ] Body `line-height` is from the source site (not the boilerplate `1.6` unless that matches)
- [ ] Heading `font-weight` is from the source site
- [ ] Heading/paragraph margins are from the source site
- [ ] Link hover `text-decoration` matches the source site behavior
- [ ] Button styles reflect the source site (border-radius, colors, hover state)
- [ ] Section max-width matches the source site's content container width (percentage or pixel, as extracted in layout.json)
- [ ] If `layout.contentMaxWidthType` is `"percentage"` → the CSS uses the percentage value (e.g., `85%`), not a pixel approximation
- [ ] Section margin reflects `spacing.tokens.sectionPaddingVertical` — if `0px`, sections are tightly stacked (not `40px` by default)
- [ ] Container padding matches the innermost constraining container (Phase 7), not a generic fallback
- [ ] Desktop padding `@media` block is ABSENT if `layout.desktopContainerPadding` is null (no fabricated `32px`)
- [ ] Correct section layout conditional used (`full-bleed` vs `constrained`) based on `layout.sectionLayout`
- [ ] Responsive `@media` block uses the source site's breakpoint (or is deleted if not responsive)
- [ ] Fallback `@font-face` entries use the correct system font for the font category
- [ ] `styles/fonts.css` created with @font-face or @import (or documented as CDN-loaded in head.html)
- [ ] `head.html` updated with font service tags if applicable
- [ ] No EDS boilerplate default values remain for properties where an extracted value was available
- [ ] **Provenance tracking:** Every CSS property that used a fallback/default has been added to the running `defaultedValues` list (for Phase 12.3)
- [ ] **Provenance tracking:** Verify the `defaultedValues` list is accurate — an empty list means every value was extracted, which should be confirmed, not assumed
- [ ] **Responsive typography:** If `typography.responsive.hasResponsiveTypography` is true, `:root` uses mobile sizes and `@media` block uses desktop sizes
- [ ] **Responsive typography:** If false, `@media` block for heading sizes is DELETED (not left with duplicate values)
- [ ] **Base elements:** Per-heading font-weight overrides included if h1 differs from h2-h6
- [ ] **Base elements:** Blockquote styled (border-left, padding-left, color) if blockquote was found on the source site
- [ ] **Base elements:** Inline `code` background/padding/radius set if the source site styles it
- [ ] **Base elements:** `hr` styled if horizontal rules were found on the source site
- [ ] **Base elements:** Table `th`/`td` borders and padding set if tables were found
- [ ] **Base elements:** Any base element block for a null/missing element type was OMITTED (not left with placeholders)
- [ ] **Base elements:** No rule was added for an element whose styles are identical to the inherited body defaults

### 11.4 Commonly Missed Items — Pre-flight Sweep

After writing `styles/styles.css`, run this sweep to catch items that are frequently overlooked. For each item, check the raw CSS corpus and computed styles. If found, add the corresponding CSS to `styles/styles.css`.

**Step 1 — Scan raw CSS for commonly missed patterns.**

Run these Grep searches against `migration-work/raw-css-corpus.txt`:

**Smooth scrolling:**
```
pattern: scroll-behavior\s*:\s*smooth
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 5
```
If found → add `html { scroll-behavior: smooth; }` to `styles/styles.css`

**Font smoothing / antialiasing:**
```
pattern: -webkit-font-smoothing|text-rendering|font-smooth|-moz-osx-font-smoothing
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 10
```
Also check `computed-styles.json → globals.webkitFontSmoothing` and `globals.textRendering`.
If the site uses antialiasing → add to body rule:
```css
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  /* only if textRendering is not 'auto': */
  text-rendering: optimizeLegibility;
}
```

**Box-sizing reset:**
```
pattern: box-sizing\s*:\s*border-box
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 10
```
If found on `*` or `html` → add at the top of `styles/styles.css` (before `:root`):
```css
*, *::before, *::after {
  box-sizing: border-box;
}
```
Note: The EDS boilerplate does NOT include a global box-sizing reset. Many modern sites do. If the source site uses it, add it — otherwise block layout calculations may differ.

**Prefers-reduced-motion:**
```
pattern: prefers-reduced-motion
path: migration-work/raw-css-corpus.txt
output_mode: content
-A: 5
head_limit: 10
```
If found → add at the end of `styles/styles.css`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Prefers-color-scheme (dark mode):**
```
pattern: prefers-color-scheme
path: migration-work/raw-css-corpus.txt
output_mode: content
-A: 15
head_limit: 30
```
If found → note the dark mode color overrides, but do NOT add them to `styles/styles.css` yet. Document in `migration-work/dark-mode-notes.txt` for future implementation. Dark mode is complex and should be a separate task.

**::placeholder styling:**
```
pattern: ::placeholder|::-webkit-input-placeholder|::-moz-placeholder
path: migration-work/raw-css-corpus.txt
output_mode: content
-A: 3
head_limit: 10
```
Also check `computed-styles.json → globals.placeholder`.
If the site styles placeholders → add:
```css
::placeholder {
  color: {placeholder color from extraction};
  opacity: {placeholder opacity, usually 1};
}
```

**Custom scrollbar:**
```
pattern: ::-webkit-scrollbar
path: migration-work/raw-css-corpus.txt
output_mode: content
-A: 5
head_limit: 15
```
If found → note for awareness but do NOT add custom scrollbar CSS by default (it's browser-specific and can cause issues). Document in a comment in `styles/styles.css` if the source site uses it.

**Text-wrap: balance for headings:**
```
pattern: text-wrap\s*:\s*balance
path: migration-work/raw-css-corpus.txt
output_mode: content
head_limit: 5
```
If found on headings → add to the shared heading rule:
```css
h1, h2, h3, h4, h5, h6 {
  text-wrap: balance;
}
```

**Link underline fine-tuning:**
Check `computed-styles.json → globals.linkUnderlineOffset` and `globals.linkDecorationThickness`.
If the source site uses `text-underline-offset` or `text-decoration-thickness` with non-default values → add to the `a:any-link` or `a:hover` rule:
```css
a:hover {
  text-underline-offset: {globals.linkUnderlineOffset — omit if 'auto'};
  text-decoration-thickness: {globals.linkDecorationThickness — omit if 'auto'};
}
```

**::selection styling:**
Check `computed-styles.json → selection`.
If the selection background-color is NOT the browser default (usually blue/`#0078d7`) → add:
```css
::selection {
  background-color: {selection.background-color};
  color: {selection.color};
}
```

**Accent-color for form elements:**
Check `computed-styles.json → globals.accentColor`.
If the site sets a custom `accent-color` (not `auto`) → add to body or `:root`:
```css
:root {
  accent-color: {globals.accentColor};
}
```

**Sticky/fixed header:**
Check `computed-styles.json → globals.headerPosition`.
If `sticky` or `fixed` → note for awareness (header styling is handled by a dedicated skill), but ensure `--nav-height` is accurate since sticky headers affect page layout.

**Step 2 — After scanning, update `styles/styles.css` with any findings.**

Use the Edit tool to add the relevant CSS rules to the appropriate locations in the file:
- Global resets (`box-sizing`) go at the very top, before `:root`
- Body-level properties (`font-smoothing`, `text-rendering`) go in the `body` rule
- Element-level properties (`::selection`, `::placeholder`, heading `text-wrap`) go after the base element rules
- Media queries (`prefers-reduced-motion`) go at the very end of the file

### 11.4 Validation

- [ ] Smooth scrolling: checked raw CSS, added if found
- [ ] Font smoothing: checked computed + raw, added if used
- [ ] Box-sizing reset: checked raw CSS, added if `* { box-sizing: border-box }` was found
- [ ] Prefers-reduced-motion: checked raw CSS, added if found
- [ ] Dark mode: checked raw CSS, documented in notes if found (not added to styles.css)
- [ ] Placeholder styling: checked computed + raw, added if custom
- [ ] Custom scrollbar: checked raw CSS, documented in comment if found
- [ ] Text-wrap balance: checked raw CSS, added to headings if found
- [ ] Link underline offset/thickness: checked computed, added if non-default
- [ ] Selection styling: checked computed, added if non-default
- [ ] Accent-color: checked computed, added if non-auto
- [ ] Sticky header: checked computed, noted for nav-height accuracy

---

## Phase 12: Validate with Preview

### 12.1 Preview a page

If a page has already been migrated, navigate to it in the preview. If not, create a minimal test page with representative content (headings h1–h6, paragraphs, links, a button-style link) and preview that.

### 12.2 Screenshot comparison

Take a screenshot of the preview and compare side-by-side with the source site screenshot from Phase 1. Check:
- [ ] Background color matches
- [ ] Text color matches
- [ ] Font family is correct (or reasonable fallback)
- [ ] Heading sizes are proportionally correct
- [ ] Link color matches
- [ ] Overall spacing feels similar
- [ ] Content width is constrained similarly (not noticeably wider or narrower)
- [ ] Section vertical spacing matches (tight vs spaced)
- [ ] Content horizontal padding matches (content doesn't touch viewport edges differently)

### 12.3 Write completion signal

**Tool:** Write

Save to `migration-work/design-system-extracted.json`:

```json
{
  "status": "complete",
  "sourceUrl": "{source URL}",
  "sourceDomain": "{domain, e.g. www.americanhome.co.jp}",
  "timestamp": "{ISO timestamp}",
  "desktopBreakpoint": "{the CSS-ready breakpoint value from breakpoints.json edsMapping.desktopBreakpoint, e.g. '900px'}",
  "summary": {
    "cssVariablesDefined": 28,
    "fontsIdentified": ["Noto Sans JP"],
    "fontLoadingMethod": "typesquare-cdn",
    "breakpointsMapped": 4,
    "colorsExtracted": 12,
    "hasResponsiveTypography": true,
    "extractedValues": [
      "--background-color",
      "--text-color",
      "--link-color",
      "--link-hover-color",
      "--body-font-family",
      "--heading-font-family",
      "--body-font-size-m",
      "--heading-font-size-xxl",
      "--nav-height"
    ],
    "derivedValues": [
      { "property": "--body-font-size-s", "derivedFrom": "--body-font-size-m minus 2px" },
      { "property": "--body-font-size-xs", "derivedFrom": "--body-font-size-m minus 4px" }
    ],
    "defaultedValues": [
      { "property": "--breadcrumbs-height", "value": "34px", "reason": "EDS internal default — breadcrumbs not present on source site" },
      { "property": "--fixed-font-family", "value": "Menlo, Consolas, monospace", "reason": "No code elements found on sampled pages" }
    ]
  },
  "filesWritten": [
    "styles/styles.css",
    "styles/fonts.css",
    "head.html"
  ]
}
```

**This file is the completion signal.** Other skills check for its existence to know whether design extraction has already been done. Fill in all values from the actual extraction results — do not use the example values above.

**CRITICAL — Provenance fields:**

| Field | Purpose |
|-------|---------|
| `extractedValues` | CSS properties whose values came directly from the source site (computed styles, raw CSS, or Playwright measurement). These are **trustworthy**. |
| `derivedValues` | CSS properties calculated from extracted values (e.g., font-size-s = body font-size minus 2px). These are **approximate**. |
| `defaultedValues` | CSS properties that could NOT be extracted and fell back to EDS boilerplate or hardcoded defaults. Each entry must include the `reason` for the fallback. These are **unreliable** and should be reviewed manually. |

**Rules for classification:**
- A value is `extracted` ONLY if it came from `computed-styles.json`, `raw-css-corpus.txt`, `live-css-variables.json`, or Playwright hover/focus/resize measurement.
- A value is `derived` if it was calculated from extracted values using the heuristics in this skill (e.g., extrapolated heading sizes, darkened hover colors).
- A value is `defaulted` if neither extraction nor derivation produced it, and a hardcoded fallback was used. **An empty `defaultedValues` array means every single CSS property was extracted or derived — this should be verified, not assumed.**
- The `desktopBreakpoint` field at the top level is a convenience for other skills that need to know which breakpoint to use in `@media` rules (e.g., block CSS, header CSS). It MUST match `breakpoints.json → edsMapping.desktopBreakpoint`.

### 12.4 Report

Output a brief summary to the user of:
- Total CSS variables defined
- Fonts identified and how they're loaded
- Number of breakpoints mapped
- Any values that could not be extracted (with reason)

---

## Output Files Summary

| File | Purpose |
|------|---------|
| `styles/styles.css` | Updated with all extracted design tokens |
| `styles/fonts.css` | @font-face declarations or @import statements |
| `head.html` | Updated if external font links needed |
| `migration-work/design-system-extracted.json` | **Completion signal** — other skills check this |
| `migration-work/cjk-detection.json` | CJK/Japanese detection result (script type, font services) |
| `migration-work/design-reference.png` | Visual reference screenshot |
| `migration-work/computed-styles.json` | Raw computed style data |
| `migration-work/raw-css-corpus.txt` | All CSS from source site |
| `migration-work/color-palette.json` | Categorized color palette |
| `migration-work/typography.json` | Font families, sizes, weights, responsive data |
| `migration-work/typography-mobile.json` | Mobile viewport heading sizes (only if responsive typography detected) |
| `migration-work/spacing.json` | Spacing scale, section spacing variance detail |
| `migration-work/breakpoints.json` | Media query breakpoints |
| `migration-work/layout.json` | Container widths (px or %), section layout pattern, nested containers, nav height |
| `migration-work/decoration.json` | Borders, shadows, radius |
| `migration-work/interactions.json` | Hover states, transitions |

## Failure Conditions

This skill has NOT completed successfully if:
- ❌ Any phase validation checklist has unchecked items
- ❌ `styles/styles.css` still contains boilerplate placeholder values for extracted properties
- ❌ Fonts were identified but no @font-face or @import was generated
- ❌ The preview shows obviously wrong colors or fonts
- ❌ No breakpoints were captured from a responsive source site
- ❌ `migration-work/design-system-extracted.json` was not written
- ❌ `design-system-extracted.json` has an empty `defaultedValues` array without explicit verification that every value was extracted
- ❌ `design-system-extracted.json` is missing the `desktopBreakpoint` field
- ❌ `@media` rules in `styles/styles.css` use a breakpoint value that doesn't match `breakpoints.json → edsMapping.desktopBreakpoint`
- ❌ Responsive typography was detected but `:root` uses desktop heading sizes instead of mobile sizes
- ❌ `typography-mobile.json` was not generated for a site with responsive typography
- ❌ CJK site detected but `--body-font-family` uses `Arial` or `Times New Roman` as fallback (will cause tofu characters)
- ❌ CJK site detected but font service `<script>` or `<link>` tag was not captured for `head.html`
## Design Foundation

### 3.1 CSS Custom Properties

Define your brand's design tokens in `styles/styles.css` under `:root`:

```css
:root {
  /* Colors */
  --background-color: #fff;
  --light-color: #f5f5f5;
  --dark-color: #1a1a2e;
  --text-color: #333;
  --link-color: #0066cc;
  --link-hover-color: #004499;

  /* Typography */
  --body-font-family: 'Inter', 'Helvetica Neue', helvetica, arial, sans-serif;
  --heading-font-family: 'Georgia', serif;
  --fixed-font-family: 'Roboto Mono', menlo, consolas, monospace;

  /* Font Sizes */
  --heading-font-size-xxl: 36px;
  --heading-font-size-xl: 28px;
  --heading-font-size-l: 24px;
  --heading-font-size-m: 20px;
  --heading-font-size-s: 18px;
  --heading-font-size-xs: 16px;
  --body-font-size-m: 16px;
  --body-font-size-s: 14px;
  --body-font-size-xs: 12px;

  /* Layout */
  --max-width-site: 1200px;
  --nav-height: 64px;
}

/* Scale up headings on desktop */
@media (width >= 900px) {
  :root {
    --heading-font-size-xxl: 48px;
    --heading-font-size-xl: 36px;
    --heading-font-size-l: 28px;
    --heading-font-size-m: 24px;
  }
}
```

### 3.2 Fonts

Define fonts in `styles/fonts.css` (loaded conditionally for performance):

```css
@font-face {
  font-family: 'MyFont';
  src: url('/fonts/myfont.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
```

Fonts are loaded conditionally by `scripts.js` — only on desktop (>= 900px) or when cached in `sessionStorage`. This prevents font-loading from blocking LCP on mobile.

### 3.3 Buttons

Links are auto-converted to buttons based on author formatting:
- `**[Link text](url)**` → `.button.primary` (strong wrapping)
- `*[Link text](url)*` → `.button.secondary` (em wrapping)
- `***[Link text](url)***` → `.button.accent` (strong + em wrapping)

Style all three variants in `styles/styles.css`.

### 3.4 Block-Level Design Tokens

Each block defines its own token file that centralizes all customizable values — colors, typography, spacing, borders, effects. This makes it easy to re-skin blocks without touching structural CSS.

```
blocks/{blockname}/
├── {blockname}.js              # Decoration logic
├── {blockname}.css             # Structural styles (uses tokens)
└── {blockname}-tokens.css      # Design tokens (all customizable values)
```

Token naming convention: `--{blockname}-{element}-{property}`

```css
/* cards-teaser-tokens.css */
:root {
  --cards-teaser-heading-font-size: 26px;
  --cards-teaser-heading-color: #4f0031;
  --cards-teaser-button-background: #d0006f;
  --cards-teaser-button-hover-background: #a80059;
  /* ... all visual values for the block */
}
```

Import tokens at the top of the structural CSS:
```css
/* cards-teaser.css */
@import url('./cards-teaser-tokens.css');

main .cards-teaser h2 {
  font-size: var(--cards-teaser-heading-font-size);
  color: var(--cards-teaser-heading-color);
}
```


**For the complete token architecture, naming conventions, and examples, read `references/design-tokens.md`.**
# Personalize the Demo Site via MCP — No Browser Required

**This is a BUILD scenario — the skill executes API calls, not instructions.**

```
My demo at main--refdemo--adobe-demopoc.aem.live needs these updates before the 2pm call:
- Hero headline: “Transform Patient Engagement with AI-Powered Content”
- Homepage sub-headline: “Purpose-built for Memorial Health System”
- Products page: rewrite all 3 product descriptions for healthcare context
Do it now. Do not open a browser.
```

**What the skill actually executes** (with `hlx-admin-mcp` connected):

1. `da_login` → checks token, re-authenticates via OAuth if expired
2. `da_whoami` → confirms identity before writing
3. `da_write` → updates hero headline → CDN preview triggered → published ✓
4. `da_write` → updates sub-headline → CDN preview triggered → published ✓
5. `da_get_source` → reads current products page to preserve structure
6. `da_write` × 3 → rewrites each product description with healthcare context → preview → published ✓
7. Returns confirmation: all 5 changes live, preview URLs for each

The customer sees a site that looks like it was built for them. It took one prompt.

**Time comparison:**
- Last year without MCP: Open da.live, navigate to each page, edit manually, click Sidekick preview, click publish — 15–20 minutes per page, over an hour for a full personalization pass
- With SuperSkills + MCP: One prompt, all pages updated and published in under 5 minutes. Run it while you review your notes for the call
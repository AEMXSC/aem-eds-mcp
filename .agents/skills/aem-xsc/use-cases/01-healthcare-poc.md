# Build a Custom Healthcare POC Before Tomorrow

**Trigger:** XSC needs a branded demo site built for a healthcare customer call.

**Execute immediately. Do not explain what you are about to do.**

---

## How do you want to build this?

```
How much time do you have before the call?
├── Tonight / overnight → YOLO Mode
│   AI builds everything autonomously. You sleep.
│   Wake up to: live preview URL, PageSpeed 100, Playwright screenshots,
│   DA content published, UE wired, decisions log.
│   Trade-off: AI picks branding defaults, repo, and block set.
│   You review in the morning — not before.
│   → Skip to YOLO Mode section at the bottom.
│
└── Now / I want to review decisions → Full Build (Steps 1–5)
    You stay present at key checkpoints:
    repo selection, branding, block list, pre-demo gates.
    Trade-off: Takes 4–6 hours with you watching.
    Best for: high-stakes CMO call, custom branding requirements,
    or first time building for this vertical.
    → Continue with Step 1 below.
```

---

## Step 1 — Scan existing assets in parallel before writing any code

Check all three simultaneously:
- `AdobeDevXSC` org: `blue-shield-ca`, `hillrom-baxter`, `baxter`, `stryker`, `stryker-da`
- `AEMXSC` org: `poc-cr-nationwide`, `poc-cr-nationwide-mutual`
- `aemdemos`: summit series with health-adjacent blocks

If a vertical match exists — clone it, adapt branding, skip to Step 4.
If no match — scaffold from `aemdemos/ise-boilerplate` and continue.

## Step 2 — Generate the GSD wave plan for all blocks

Identify the blocks needed for the healthcare narrative. For 3+ blocks, generate a parallel wave plan internally and execute it:

```
Wave 0 (parallel): /block-inventory + /block-collection-and-party
Wave 1 (parallel): /analyze-and-plan for every block simultaneously
Wave 2 (parallel): /building-blocks for every block simultaneously
  — Each block gets: JS + CSS + ue/models/blocks/<name>.json
Wave 3 (parallel): /code-review + /testing-blocks + /pagespeed-audit
```

## Step 3 — Wire DA + Universal Editor (dual authoring, no exceptions)

- `fstab.yaml` → DA content mount at `content.da.live/<org>/<repo>/`
- `component-definition.json`, `component-filters.json`, `component-models.json`
- Per-block UE model JSON for every block built in Wave 2
- DA content pages created in block table format
- Sidekick config in `tools/sidekick/config.json`

## Step 4 — Deploy

- Create GitHub repo, install `aem-code-sync` app, push code
- If helix-mcp configured: bulk preview all pages in one API call, poll job status until complete
- Otherwise: `da_write` each page → CDN preview triggered → published

## Step 4b — Build campaign pages (EPA demo setup)

Create `/campaign/` subfolder with 5 pages in DA:
- `/campaign/index` — campaign hub
- `/campaign/[service-1]` — adapt to vertical (healthcare: patient-programs)
- `/campaign/[service-2]` — adapt to vertical (healthcare: clinical-services)
- `/campaign/[service-3]` — adapt to vertical (healthcare: wellness-hub)
- `/campaign/contact` — CTA/conversion

Content tone: **formal US English** — this is the EPA "before" state. Do not make it casual or regional.

`da_write` all 5 pages. Confirm live on CDN before moving on.

**EPA prompt for the call (save this now):**
```
Update hero headlines and product descriptions across all pages
under /campaign/ to reflect [EMEA / APAC / LatAm] regional tone.
Show me a preview before applying.
```

## Step 5 — Pre-demo gates (all required before declaring done)

- [ ] `/pagespeed-audit` scores 100 on mobile and desktop
- [ ] Playwright Bash script: screenshots at 375px / 768px / 1280px — brand colors, layout, no console errors. Delete script after.
- [ ] All DA pages live and accessible via preview URL
- [ ] UE edit URL opens and annotations are visible on every block
- [ ] All 5 `/campaign/` pages live and accessible
- [ ] EPA prompt saved and ready to paste on the call

**Constraint:** COA requires DMwOA enabled — verify Showcase environment has it before promising it live.

**Time target:** 4–6 hours to first live preview with parallel wave execution.

---

## YOLO Mode — Wake Up With a Finished Site

**When to use:** You have the customer name, their industry, and optionally their existing site URL. You have a call tomorrow. You are done for the night.

**Give the AI this before you close your laptop:**

```
Customer: [name]
Vertical: [healthcare / insurance / pharma / etc.]
Existing site: [URL or "none"]
Key message for demo: [1 sentence — e.g. "patient portal modernization"]
Go. Wake me up when it's live.
```

*(GitHub org defaults to `AEMXSC`. DA org derived from `da_whoami`. No need to specify either.)*

**YOLO rules — AI executes all of these without stopping:**

```
Decision point                     → Rule
Repo scaffold                      → Always start from aemdemos/ise-boilerplate.
                                     Check AdobeDevXSC + AEMXSC orgs first for a
                                     vertical match — clone and adapt if found.
                                     ise-boilerplate ships with DA + UE wired,
                                     design tokens per block, AGENTS.md constraints.

AGENTS.md found in repo            → Read it before writing any code. Hard constraints
                                     in AGENTS.md override all defaults below.

GitHub org                         → Default: AEMXSC. Override only if XSC specifies.

DA org                             → Run da_whoami to derive. Never ask the XSC.

Authoring mode                     → Always DA + UE. Never DA-only. Never UE-only.
                                     ise-boilerplate handles both — no extra setup needed.

Every block built                  → Must produce exactly 4 files:
                                     {block}.js
                                     {block}.css
                                     {block}-tokens.css  (design tokens — ise-boilerplate pattern)
                                     ue/models/blocks/{block}.json  (UE annotations)

No exact vertical repo match       → Clone closest match, remap branding. Never wait.

No design spec + existing URL      → Run Playwright render on the live site first.
                                     Screenshot full page. Extract palette from computed
                                     styles and background colors — do not read raw HTML
                                     for colors on React/Tailwind/CSS-in-JS sites.
                                     Raw HTML will return nothing useful.

No design spec + no URL            → Default vertical palette:
                                     Healthcare: #003087 navy + #00A3E0 blue + white
                                     Insurance: #1A3C5E navy + #E87722 orange + white
                                     Pharma: #004B87 blue + #6CC04A green + white

Block list unclear                 → Default healthcare set: hero, stats, cards, tabs,
                                     accordion (FAQ), footer. Build all 5.

Block already exists in collection → Use it. Do not rebuild.

Custom fonts detected on live site → Check if self-hostable. If Google Fonts — inline
                                     the @font-face, preload the woff2. If licensed/
                                     proprietary — swap to closest system font and flag
                                     in report. Never load fonts from external CDN.

3rd party scripts on live site     → Do not copy analytics tags, chat widgets, cookie
                                     banners, or A/B testing scripts into the EDS build.
                                     EDS site is clean by design. Flag what was stripped.

pagespeed-audit below 100          → Fix inline in this order:
                                     1. Remove any runtime JS deps
                                     2. Convert images to WebP, add width/height attrs
                                     3. Lazy-load below-fold images
                                     4. Defer non-critical CSS
                                     Do not declare done below 100.

hlx-admin-mcp not responding       → Check if process is running. If not — fall back to
                                     da_update_source for all writes. Flag in report:
                                     "CDN cache not busted — XSC must manually preview
                                     each page in Sidekick before the call."

GitHub repo creation fails         → Check gh auth status first. If token expired,
                                     flag immediately — this blocks deploy entirely.
                                     Do not proceed to deploy step without confirmed
                                     GitHub access.

aem-code-sync not installed        → Flag in report. Site will not sync without it.
                                     Install URL: github.com/apps/aem-code-sync

Playwright screenshot fails        → Retry once. If still failing, skip and flag in report.

da_write fails                     → Retry with da_update_source + manual preview trigger.
                                     Do not stop the build.

5+ pages to publish                → Use helix-mcp bulk preview API —
                                     not individual da_write calls.
                                     POST /preview/{org}/{site}/main/*
                                     with all paths in one payload.
                                     Poll job status before declaring done.
                                     Fall back to individual da_write if
                                     HELIX_ADMIN_API_TOKEN not configured.

Any ambiguity                      → Make a decision. Log it. Keep going.

Campaign pages (EPA demo setup)   → Always build these as part of the site.
                                     Create /campaign/ subfolder with 5 pages:
                                       /campaign/index        ← campaign hub
                                       /campaign/[service-1]  ← adapt to vertical
                                       /campaign/[service-2]  ← adapt to vertical
                                       /campaign/[service-3]  ← adapt to vertical
                                       /campaign/contact      ← CTA/conversion
                                     Healthcare defaults:
                                       patient-programs, clinical-services,
                                       wellness-hub, contact
                                     Content tone: US English, formal (this is
                                     the EPA "before" state — do not make it
                                     casual or regional).
                                     Publish all 5 via da_write.
                                     These pages make the EPA demo runnable
                                     the moment the XSC opens Author URL.
```

**Wake-up report — output this when done:**

```
✓ Site live: [preview URL]
✓ PageSpeed: [mobile score] / [desktop score]
✓ Blocks built: [list]
✓ DA pages published: [list with preview URLs]
✓ UE edit URL: [url]
✓ Playwright screenshots: 375px / 768px / 1280px ✓

✓ EPA demo ready:
  Campaign pages (5): [preview URLs for /campaign/ pages]
  Content: [vertical]-appropriate, formal US English tone
  Author URL: https://author-<env>.adobeaemcloud.com
  EPA prompt (copy-paste on the call):
  "Update hero headlines and product descriptions across all pages
  under /campaign/ to reflect [EMEA / APAC / LatAm] regional tone.
  Show me a preview before applying."

Decisions made overnight:
- [repo cloned from X because Y]
- [brand palette derived from Z]
- [block X replaced with Block Collection equivalent]

Ready for your call. Open [preview URL].
```

**The XSC's line on the call:**
*"I had this built overnight. Here's your site — branded, PageSpeed 100, live on CDN. This is what your team would have spent 3 dev days on."*

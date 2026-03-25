# Omni-Channel Content Activation — Content Fragments + GraphQL

**Trigger:** XSC needs a live headless demo showing one CF delivered to multiple channels via GraphQL.

**Execute immediately. Do not explain what you are about to do.**

---

## Environment check — do this before anything else

**These must be true before a single file is written. Check them now.**

```
1. AEM as a Cloud Service org with Content Fragments enabled
   → Open AEM Author → Tools → Assets → Content Fragment Models
   → If the menu item is missing, CF is not enabled. Stop. This demo
     requires AEM CS with CF — not AEM Sites Trial, not Playground.

2. GraphQL Explorer accessible
   → https://author-<env>.adobeaemcloud.com/content/graphiql.html
   → If 404 or access denied, GraphQL endpoint is not provisioned.
     Stop and raise with your SE before building anything.

3. DMwOA enabled (for Step 5 asset delivery)
   → AEM Author → Assets → select any asset → "Copy URL"
   → If the button shows a single URL (not format options), DMwOA
     is NOT active. Proceed with Steps 1–4 only. Skip Step 5.
     Flag for the call — do not promise live DMwOA asset delivery.

4. Approval workflow configurable
   → AEM Author → Tools → Workflow → Models
   → Confirm you have edit access. Read-only = can't configure Step 7.
```

---

## How do you want to build this?

```
How much time do you have before the call?
├── Tonight / overnight → YOLO Mode
│   AI builds CF model, 3 sample fragments, 3 GraphQL queries,
│   3 channel previews, governance workflow, Playwright validation.
│   Wake up to: live GraphQL endpoints, screenshots of all 3
│   channels, compliance workflow verified.
│   Trade-off: AI picks field names and tone variants.
│   You review in the morning — not before.
│   → Skip to YOLO Mode section at the bottom.
│
└── Now / I want to review decisions → Full Build (Steps 1–7)
    You stay present at: CF model schema, tone variant copy,
    GraphQL query structure, governance rule configuration.
    Trade-off: 1–2 hours with you watching.
    Best for: technical architect audience, compliance-sensitive
    verticals (pharma, healthcare), or first CF demo.
    → Continue with Step 1 below.
```

---

## Step 1 — Build the Content Fragment model

Create the CF model schema with these fields:
- `headline` (single-line text)
- `body` (multi-line rich text)
- `cta` (single-line text)
- `channelOverrides` (nested fragment — per-channel tone variants)
- `complianceApproved` (boolean — blocks publish if false)

Write and commit the configuration files.

## Step 2 — Create 3 sample Content Fragments

One CF, three tone variants:
- **Patient-facing:** plain language, empathy-first, no clinical jargon
- **Clinical staff:** precise, abbreviated, protocol-aligned
- **Marketing/public site:** benefit-led, conversion-oriented

## Step 3 — Write GraphQL persisted queries (one per channel)

Each query returns only the fields that channel needs:
```graphql
# patient-portal query — full body + compliance flag
# mobile-app query — headline + cta only (card format)
# clinical-staff query — headline + body (dense, no CTA)
```
Test all three in AEM GraphQL Explorer before the demo.

## Step 4 — Build channel preview pages

Scaffold from `aemdemos/ise-boilerplate`. Read `AGENTS.md` before building any blocks.

Three simple renditions visible simultaneously:
- Patient portal card
- Mobile app tile
- Clinical staff alert banner

Same CF source. Three outputs. The demo moment is: edit one field → all three refresh.

Each channel block must produce 4 files:
`{block}.js` + `{block}.css` + `{block}-tokens.css` + `ue/models/blocks/{block}.json`

## Step 5 — Configure DMwOA asset delivery

Single asset URL → web crop, mobile crop, thumbnail served automatically. No rendition management.

## Step 6 — Visual validation

Playwright Bash script loads all 3 channel previews simultaneously, captures screenshots. Confirms the "one edit → three refreshes" moment works before the call. Run via `node validate-channels.js`, delete after.

## Step 7 — Wire the governance close

Configure one approval workflow: `complianceApproved = false` blocks all channel delivery. This is the close: *"One approval controls what goes live everywhere — patient-safe content cannot ship without compliance sign-off regardless of channel."*

## Step 8 — Build campaign pages (EPA demo setup)

Create `/campaign/` subfolder with 5 pages on the channel preview site:
- `/campaign/index` — campaign hub
- `/campaign/patient-portal` — patient-facing content
- `/campaign/mobile-app` — mobile-optimized content
- `/campaign/clinical-staff` — clinical staff content
- `/campaign/contact` — CTA/conversion

Content tone: **formal US English** — EPA "before" state.

`da_write` all 5 pages. This extends the demo: CF → 3 channels → EPA regional variants, all on the same call.

**EPA prompt for the call (save this now):**
```
Update hero headlines and product descriptions across all pages
under /campaign/ to reflect [EMEA / APAC / LatAm] regional tone.
Show me a preview before applying.
```

**Time target:** Full working demo with live GraphQL queries in 1–2 hours.

---

## YOLO Mode — Wake Up With a Live GraphQL Demo

**When to use:** Environment checks passed. You have AEM CS access. Call is tomorrow.

**Give the AI this before you close your laptop:**

```
AEM Author URL: https://author-<env>.adobeaemcloud.com
Vertical / industry: [healthcare / pharma / financial / etc.]
Key governance story: [e.g. "compliance blocks patient content"]
Go. Wake me up when the GraphQL queries are live.
```

**YOLO rules — AI executes all of these without stopping:**

```
Decision point                      → Rule
CF model field names unclear        → Use standard set: headline, body, cta,
                                      channelOverrides, complianceApproved. Always.
Tone variants unclear               → Default 3: patient-facing (plain language),
                                      clinical (precise/abbreviated), marketing
                                      (benefit-led). Adapt labels to vertical.
GraphQL query structure unclear     → Each query returns minimum fields for that
                                      channel. Never return all fields to all channels.
DMwOA not enabled                   → Skip Step 5. Build Steps 1–4 + 6–7 only.
                                      Flag in report — do not build around it.
Approval workflow edit access fails → Flag immediately. Step 7 requires edit access.
                                      Cannot substitute with a screenshot.
"One edit → three refresh" broken   → Debug before declaring done. This is the
                                      demo moment — do not skip it.
GraphQL Explorer 404                → Flag immediately. Build is blocked.

5+ pages to publish                → Use helix-mcp bulk preview API —
                                      not individual da_write calls.
                                      POST /preview/{org}/{site}/main/*
                                      with all paths in one payload.
                                      Poll job status before declaring done.
                                      Fall back to individual da_write if
                                      HELIX_ADMIN_API_TOKEN not configured.

Campaign pages (EPA demo setup)    → Build 5 EDS pages in /campaign/ on the
                                      channel preview site scaffolded in Step 4:
                                        /campaign/index
                                        /campaign/[channel-1]   ← patient portal
                                        /campaign/[channel-2]   ← mobile app
                                        /campaign/[channel-3]   ← clinical staff
                                        /campaign/contact
                                      Content: vertical-appropriate, formal US
                                      English (EPA "before" state).
                                      Publish all 5 via da_write.
                                      EPA prompt for the call:
                                      "Update all pages under /campaign/ to reflect
                                      [EMEA / APAC] regional tone. Preview first."
```

**Wake-up report — output this when done:**

```
✓ CF Model: [model name] — fields: [list]
✓ Sample fragments: 3 created (patient-facing / clinical / marketing)
✓ GraphQL endpoints live:
   patient-portal: [query URL] ✓
   mobile-app:     [query URL] ✓
   clinical-staff: [query URL] ✓
✓ Channel previews: Playwright screenshots of all 3 ✓
✓ "One edit → three refresh" validated ✓
✓ Compliance workflow: complianceApproved=false blocks all delivery ✓
⚠ DMwOA: [enabled / not enabled — skipped]

✓ EPA demo ready:
  Campaign pages (5): [preview URLs for /campaign/ pages]
  Content: [vertical]-appropriate, formal US English tone
  Author URL: https://author-<env>.adobeaemcloud.com
  EPA prompt (copy-paste on the call):
  "Update hero headlines and product descriptions across all pages
  under /campaign/ to reflect [EMEA / APAC / LatAm] regional tone.
  Show me a preview before applying."

Ready for your call. Demo sequence: CF model → fragment edit → all 3 channels refresh → EPA regional variants.
```

**The XSC's line on the call:**
*"Watch this — I change one field in the content fragment and all three channels update. Patient portal, mobile app, clinical staff alert. One source. One approval. Everywhere."*

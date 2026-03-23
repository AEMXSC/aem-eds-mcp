# AEM XSC Demo Plays — Scripts, Prompts & Talk Tracks

Full reference for all sales plays. Each section: value themes → environment → narrative arc → exact script → talk tracks → objection handling → wrap-up.

**Agent naming (current as of 2026):**
- Brand Experience Agent = umbrella for: ExMod Agent + Experience Production Agent + Developer Agent
- Content Advisor Agent = formerly "Discovery Agent"
- Content Optimization Agent (COA) = unchanged
- Governance Agent = unchanged

---

## ExMod

### Experience Modernization (ExMod) Agent

**Value:** Automates full website migration to AEM EDS/Cloud. Maps existing site blocks, imports content, applies styling — dramatically compressing migration timelines from months to days.

**This is a pre-sales qualifying tool, not just a demo.** Run the customer's site through the scoper before any ExMod conversation — required before requesting pricing, engineering support, or a full ExMod demo.

**Site Scope Analyzer:** `https://main--site-scope--aemsites.aem.live/`
**Intake Form:** `https://intake-form--site-scope--aemsites.aem.live/`

**Environment:** XSC Showcase with agents configured. ExMod works best on Author URLs.

**Primary audience:** IT architects, digital transformation leads, migration stakeholders.

**Narrative arc (30 min — technical validation):**
1. **The migration tax** — "A typical AEM site migration takes 6–18 months. Developer hours. Agency fees. Content freezes. Launch risk."
2. **Show the scoper — live on their URL** — "Let's analyze your site right now."
3. **ExMod analyzes, maps, and imports** — show the automated block detection, content mapping, and import pipeline.
4. **Result: working EDS site, minutes not months** — show the migrated page rendering live.
5. **Next step** — intake form for scoping + timeline estimate.

**Demo script:**

```
### Beat 1 — Run the Site Scope Analyzer (Do This Live)

Step 1: Go to https://main--site-scope--aemsites.aem.live/
Enter the customer's URL (or a relevant public site URL for discovery stage)
  → Tool analyzes the site: detects blocks, estimates migration complexity, surfaces key findings
  → Value: "In 60 seconds, we have a migration complexity assessment. No statement of work required yet."

Step 2: Walk through the scoper output
  → Show: number of unique block patterns detected, estimated page count, complexity rating
  → Value: "This is what would have taken a discovery workshop and 4 weeks of scoping. Done."

### Beat 2 — ExMod Agent in Action (XSC Showcase)

Scenario: A Fortune 500 retail brand has a legacy CMS site with 500 pages. Migration estimate
from their SI: 12 months, $2M. ExMod flips the equation.

Step 1: Open ExMod Agent in AEM Showcase
Prompt: "Analyze this page URL and identify all block patterns: [URL]"
  → Agent identifies: hero banner, product grid, accordion FAQ, video embed, navigation
  → Value: "What a developer team spends 2 weeks mapping, the agent identifies in seconds."

Step 2: Prompt for import
Prompt: "Import this page maintaining the detected block structure and apply EDS formatting"
  → Agent imports content, maps to EDS block structure, generates DA-ready HTML
  → Value: "Content migrated. Block structure preserved. Ready for an author to review in DA."

Step 3: Show result in AEM preview
  → Page renders in EDS with Lighthouse score: 100
  → Value: "Migrated page, same content, 100 Lighthouse score. That's the EDS guarantee."

⚠ Constraint: ExMod requires agents configured in the org manifest + Author URL (self-configuring).
  Do NOT run ExMod on Publish URL without explicit onboarding.
  Full ExMod engagement requires completion of the intake form BEFORE engineering resources are assigned.
```

**Talk track — IT Architect:**
> "Your migration estimate is based on manual developer work. ExMod changes the denominator. The agent does the block analysis, content mapping, and initial import. Your team reviews and refines — they don't start from scratch. Projects that were 12-month engagements become 6–8 week sprints."

**Talk track — CMO/Digital Leader:**
> "Every month your team isn't on AEM EDS is a month you're not getting 100 Lighthouse scores, not benefiting from AI agents, and not publishing at the speed your competitors are moving. ExMod takes the migration risk off the table — it's the reason 'we can't afford the migration' is no longer a blocker."

**Wrap-up:**
- Proof path: Complete intake form at `https://intake-form--site-scope--aemsites.aem.live/` → ExMod team provides scoping report + timeline estimate
- Ask: "How many pages are on your current site? What's the average update frequency? Do you have an existing sitemap we can feed the scoper?"

---

## ASO

### AEM Sites Optimizer (ASO) + Preflight

**Value themes:** SEO at scale, Core Web Vitals, authoring best practices, content governance, technical hygiene.

**Primary environments:**
- Early/generic: Frescopa on AEM Reference Demo Shared
- Custom: Customer URL onboarded into ASO (top 50–100 pages by traffic, no folder-path filtering)

**Narrative arc (20–30 min, retail CMO — early discovery):**
1. **The cost of invisible content** — "Your site has pages ranking on page 3 that could be page 1 with fixes your team doesn't know about."
2. **ASO finds what manual audits miss** — Live walk of opportunities list across SEO, content quality, and performance.
3. **One fix, immediate value** — Drill into a specific SEO opportunity; show the fix path and projected traffic value.
4. **Preflight catches it before it goes live** — Show Preflight running against a page before publish.
5. **Next step** — $0 trial with their own site onboarded.

**Demo script:**

```
### Beat 1 — Open ASO Dashboard

Scenario: A retail brand has 2,000+ pages. SEO team does quarterly audits. Meanwhile, product pages
with high commercial intent are silently bleeding rankings.

Step 1: Open Sites Optimizer in AEM
  → Show opportunity list — filter by "SEO" category
  → Value: "This surface didn't exist 12 months ago. Your team doesn't need a consultant to find these."

Step 2: Open top SEO opportunity
  → Show affected pages, projected traffic impact
  → Value: "This one fix, across these 14 pages, could recover an estimated X visitors/month."
  ⚠ Constraint: Dollar value projections are illustrative in demo mode. If projected value shows
    unrealistically low numbers, use "number of issues" view or note that methodology is being refined.

Step 3: Open a specific page opportunity → show the suggested fix inline
  → Value: "This is actionable — your author can fix this without a dev ticket."
```

```
### Beat 2 — Content Quality Opportunities

Step 1: Switch to "Content" category in opportunity list
  → Show broken links, missing metadata, duplicate title tags
  → Value: "These are governance gaps your CMS won't catch. ASO runs continuously."

Step 2: Show "Performance" category (Core Web Vitals)
  → Highlight LCP or CLS issues with specific pages called out
  → Value: "Google's ranking algorithm directly penalizes these scores. Here's your list, ranked by impact."
```

```
### Beat 3 — Preflight (if applicable)

Step 1: Open Preflight against a Frescopa page (or dedicated preflight demo instance)
  → Run a pre-publish check
  → Value: "Catches issues before they ever go live. Authors get real-time feedback, not post-publish fires."
  ⚠ Constraint: Show on Frescopa or a dedicated preflight instance. Avoid running against unstable customer URLs.
```

**Custom URL demo constraints:**
- Scripts scan top 50–100 pages by traffic only — not the full site
- Cannot filter by specific folder paths (e.g., `/products/` only)
- If `/careers` or internal pages dominate the top-traffic list: manually remove those rows from results before the demo; clarify in narrative that full onboarding allows more targeted analysis
- Demo onboarding: disable imports/audits at the end so long-running jobs don't continue after the demo

**Reporting choice:**
- Use **projected traffic value** when numbers are credible
- Use **"number of issues" view** when dollar values would be misleading (small site, low-traffic test pages)

**Customer results (use these numbers):**
- **Hershey Company**: +15% organic visibility; *"Key business metrics improve in weeks, little effort from marketing teams"*
- **PGA TOUR**: 3x faster UX and performance issue resolution
- **Wilson**: +24% CVR from best-performing A/B test variation
- Early customers: 400% page load improvement; 70% engagement boost

**Talk track — CMO:**
> "What you're looking at is a continuous SEO and content quality engine — not a quarterly audit. Every page on your site is evaluated against Google's current ranking signals, your brand standards, and accessibility requirements. You get a prioritized queue your authors can act on today, without a dev ticket. Hershey was seeing metric improvements in weeks."

**Talk track — IT / Architect:**
> "ASO doesn't require agent installation on your infrastructure. It runs against your published URLs. Onboarding takes under an hour. And uniquely — for AEM EDS sites, ASO can write the fix directly. No Jira ticket. No dev sprint. No wait."

**Talk track — SEO Tool Comparison:**
> "BrightEdge and Conductor monitor and recommend. Then someone opens a Jira ticket, it goes in the backlog, ships next quarter. ASO identifies the problem and for EDS sites, implements the fix directly. That's not a better SEO tool — that's a different category."

**Objection — "We already have Semrush/Ahrefs":**
> "Adobe is acquiring Semrush for $1.9B — closes H1 2026. After that, your Semrush data lives inside the same platform as your CMS and AI search optimizer. You'd be an early adopter of a platform advantage your competitors don't have yet. In the meantime, ASO does something Semrush can't: it publishes the fix."

**Objection — "We already have BrightEdge/Conductor":**
> "Those tools recommend. ASO acts. Who on your team takes that recommendation and actually implements it? How long does that handoff take? ASO closes the loop."

**Wrap-up:**
- Proof path: $0 ASO trial, customer URL onboarded — send the issues report as a leave-behind
- Send: On-demand webinar "Maximize Your Web Impact with AI-Powered Site Optimization"
- Ask: "How many pages is your team manually auditing today? How often? Who implements fixes — and how long does the handoff take?"

---

## AI Agents

### AEM AI Agents Deep-Dive

**Agent catalog (current 2026):**
- **Brand Experience Agent** (umbrella) → contains: ExMod + Experience Production + Developer Agents
- **Content Optimization Agent (COA)** — image variants, brand-safe crops, channel renditions
- **Content Advisor Agent** (formerly Discovery Agent) — brand-approved asset retrieval
- **Governance Agent** — policy enforcement, compliance, DRM
- **Experience Production Agent (EPA)** — multi-page content transformations
- **Developer Agent** — pipeline troubleshooting, CI/CD assistance
- **Experience Modernization (ExMod) Agent** — full site migration automation → see ExMod section above

**Availability constraint (hard):** AI Agents require **AEM as a Cloud Service + EDS only.** NOT available on AEM 6.5, AEM 6.5 LTS, On-Premises, or Managed Services. Use this as both a guardrail AND an AEMaaCS upsell lever.

**Fastest path to showing agents:** AEM Playground — `https://www.aem.live/developer/aem-playground` — no login, no provisioning, instant AI agent demos. Use this for any surprise or short-notice demo request.

**Cross-cutting environment rules:**
- Trial orgs: No Cloud Manager → Developer Agent broken; limited metadata → Content Advisor Agent incomplete
- AEM Playground: SCs can upload to personal folders + edit metadata; cannot create new workflows or metadata profiles (need admin)
- XSC Showcase / sandboxes: Preferred for all full, end-to-end agent flows

---

#### COA — Content Optimization Agent

**Value:** Asset variants at scale. Brand-safe crops. Multi-channel renditions without Creative Cloud roundtrips.

**Dependencies:** Requires Dynamic Media with OpenAPI (DMwOA) — NOT classic DM. Agents must be in org's manifest.

**Demo script:**

```
Scenario: Retail marketing team needs 12 asset variants for a new campaign — different channels,
different crops, different aspect ratios. Today that's 2–3 days in Creative Cloud.

Step 1: Open AEM Assets → trigger Content Optimization Agent
Prompt: "Show me all bike images with an outdoor background from the Frescopa collection"
  → Agent returns filtered asset list with thumbnails
  → Value: "This is semantic search across your DAM. No manual tagging required."

Step 2:
Prompt: "Create an Instagram-square version of the first asset, brand-safe crop, no text overlay"
  → Agent generates rendition; shows in new Assets UI with Copy URL button
  → Value: "Generated, stored, and delivery-ready in seconds. No Photoshop, no ticket, no waiting."

Step 3: Show governance — "What approval workflows are applied to these renditions?"
  → Value: "Brand compliance baked into the generation step — not bolted on afterward."

⚠ Constraint: If prompts work in Trial but not in XSC Showcase:
  - Suspect misconfigured manifest or missing DMwOA activation
  - Recommend verifying manifest and DMwOA settings — do NOT change the prompt to work around config issues
```

**Troubleshooting flag:** If COA doesn't respond to asset queries, check:
1. DMwOA enabled on the environment (not just classic DM)
2. Agents correctly listed in org manifest
3. Frescopa/WKND assets have DM renditions indexed

---

#### EPA — Experience Production Agent

**Value:** Multi-page content transformations at scale. Update text, restructure content, scale campaign changes.

**Environment logic:**
- Author URL: self-configuring, no manual onboarding needed ✅
- Publish URL: still requires explicit onboarding and configuration ⚠
- For XSC demos: always use Author URLs; call out that publish-URL path needs additional setup

**Demo script:**

```
Scenario: Brand refresh — product descriptions across 200 pages need tone updated from
formal to conversational. Today that's 6 weeks of content operations work.

Step 1: Open Experience Production Agent on Author URL
Prompt: "Update the hero headline on all Frescopa coffee product pages to emphasize 'freshness'
  and use a conversational tone. Show me a preview before applying."
  → Agent surfaces affected pages + proposed copy diff
  → Value: "Your content ops team reviews and approves — the agent does the heavy lifting."

Step 2: Approve and apply to 5 pages
  → Show pages updated, versioned, ready for review workflow
  → Value: "What took 6 weeks of manual work just took 3 minutes."

⚠ Constraint: EPA is scoped to Author URL for demo. Publish URL requires explicit onboarding — flag this if customer asks.
```

---

#### Governance Agent

**Value:** Policy enforcement at publish time. Brand, legal, accessibility, compliance — automated.

**Best environment:** XSC Showcase with admin access.

**Demo script:**

```
Scenario: New campaign assets going live. Legal hasn't approved the copy. Brand team hasn't
signed off on the imagery. In today's workflow, 1 in 10 launches has a compliance incident.

Step 1: Trigger Governance Agent on a page about to be published
Prompt: "Check this campaign page for brand compliance, accessibility issues, and unapproved
  imagery before publish"
  → Agent flags: 2 images without Brand Approved tag, 1 heading with unapproved promotional claim,
    missing alt text on hero image
  → Value: "This is your last line of defense — before the incident, not after."

Step 2: Show how each flag links to the policy that was violated
  → Value: "Audit trail is automatic. Compliance team gets a report. Legal gets evidence."

Step 3: Show the "approved" state — all flags cleared — publish unblocked
  → Value: "Speed without risk. Not one or the other."
```

---

#### Developer Agent

**Value:** Pipeline troubleshooting, deployment assistance, environment diagnostics.

**Hard constraint:** Requires Cloud Manager access. Does NOT work for self-registered Sites trial users.

**Demo environment:** XSC sandboxes with CM access. Never design this flow assuming trial org permissions.

**Demo script:**

```
Scenario: A developer is blocked — pipeline failed, no clear error message, release is today.

Step 1: Open Developer Agent in AEM (requires Cloud Manager access)
Prompt: "My pipeline failed 20 minutes ago on the 'code quality' step. What happened and
  what do I need to fix?"
  → Agent reads CM logs, surfaces the specific rule violation and the file + line number
  → Value: "Cuts debug time from hours to minutes. Junior devs get senior-level diagnostics."

Step 2:
Prompt: "What's the fix for the SonarQube rule that was violated?"
  → Agent provides the specific code change needed
  → Value: "Not just what's wrong — what to do about it."

⚠ Constraint: Only demo on environments where you have Cloud Manager access (XSC sandboxes).
  Never attempt this in a trial org — the agent will fail silently.
```

---

#### Content Advisor Agent (formerly Discovery Agent)

**Value:** Brand-approved asset retrieval. Finds only assets that have passed governance workflows.

**Key mechanic:** Prefers **manual workflow tags** (Brand Approved, Legal Approved) over AI smart tags.

**Setup required for full demo:** Approval workflow that adds "Brand Approved" tag → Demo prompt finds only tagged assets.

**Demo script:**

```
Scenario: Marketing team needs brand-approved summer campaign assets. DAM has 40,000 assets.
Sourcing brand-approved assets today means emailing the brand team and waiting 2 days.

Step 1: (Setup, pre-done) Show workflow that tags assets as "Brand Approved" after brand team review

Step 2: Open Content Advisor Agent
Prompt: "Find all brand-approved images of outdoor lifestyle scenes from the summer 2025
  campaign collection"
  → Agent returns only Brand Approved tagged assets — nothing unapproved surfaces
  → Value: "No one accidentally uses an unapproved asset. The governance is built into retrieval."

Step 3:
Prompt: "Which of these are also legal-approved for use in paid media in the EU?"
  → Agent filters further by "Legal Approved EU Paid Media" tag
  → Value: "This is the handshake between creative ops and legal — automated."

⚠ Constraint (trial orgs): SCs can't add metadata/tags in shared trial folders.
  Show concept but acknowledge limitation. For full demo, use XSC Showcase or sandbox with approval workflow pre-configured.
```

**Talk track — Marketing audience:**
> "Every asset returned by this agent has a human-reviewed stamp of approval. You're not browsing — you're retrieving from a curated, governed library. The agent knows what's approved because your own workflow told it. No AI guessing, no manual search, no legal risk."

---

## LLMO

### LLM Optimizer (LLMO)

**Value:** Optimize AEM content to be cited and ranked by LLMs (ChatGPT, Perplexity, Gemini, etc.). The emerging channel for AI-generated answers.

**Who owns demos:** XSC Tiger Team. File requests via XSC request process (product "Sites" until LLMO is fully catalogued).

**Demo environments:**
- External demos: `play.llmo.now` — shows Frescopa only, safe for external sharing
- Internal deep-dives: XSC Showcase IMS org
- Customer TBYB: customer trial org when eligible
- ⚠ Internal orgs show many brands — NEVER share externally

**Demo script (external, generic):**

```
Scenario: A brand's product pages answer common customer questions perfectly — but when
customers ask ChatGPT or Perplexity, competitor content gets cited, not theirs.

Step 1: Open play.llmo.now → Frescopa demo
  → Show current LLM citation score for a Frescopa product page
  → Value: "This is your brand's presence in AI-generated answers — a channel most brands
    aren't optimizing yet."

Step 2: Show LLMO recommendations for a page
  → Surface: missing structured data, thin answer content, poor LLM-readable heading structure
  → Value: "These are the same signals LLMs use to decide what to cite. We can measure them."

Step 3: Show before/after — apply an LLMO recommendation, re-score
  → Value: "Every improvement here is a better chance your brand gets cited instead of your competitor."
```

**LLMO "Optimize at Edge" — kill the dev bandwidth objection:**
> "Optimize at Edge rewrites your markup at the CDN layer — zero code changes at origin. Any website becomes agentic-ready in seconds. No dev ticket needed."

**Adobe.com customer zero results (October 2025):**
- Firefly page: **5x citation count increase in one week**
- Acrobat page: **200% LLM visibility increase**
- Adobe.com overall: **41% increase in LLM-referred traffic**
- Market context: **1,100% YoY increase in AI traffic to US retail sites** (Sept 2025 Adobe data)

**Trial access:** Free for AEM Cloud customers — up to 200 prompts, no barrier
**Product URL:** `https://llmo.now`
**Chrome extension:** Available for any site evaluation — no AEM instance required

**For TBYB motions:**
- Product is self-service; XSC provides guidance and triage — not manual operation
- Position SC/XSC as sherpas, not full-time operators
- Direct customers to the self-service quick start; escalate to Tiger Team only for blockers

**Objection — "LLM traffic isn't measurable yet":**
> "You're right that last-click attribution is still evolving. But LLMO gives you the leading indicators — content that LLMs prefer to cite. Teams that optimize now own the channel before their competitors figure out it exists."

---

## CSC

### Content Supply Chain: AEM + Workfront + Firefly/Express

**Value:** Campaign brief → work management → asset production → AEM delivery → measurement. AI and automation reduce cycle time and coordination cost.

**Storyline:** Show how a typical 6-week campaign cycle compresses to days.

**AEM as anchor:** Always keep AEM at the center — assets live in AEM Assets, pages publish from AEM Sites, approvals flow through AEM workflows.

**Demo script (30–45 min — new campaign launch):**

```
Scenario: A global retail brand launches a seasonal campaign. Today: brief in email,
assets in Box/Dropbox, approvals via Slack, publish dates missed. Goal: 4-week cycle → 4 days.

### Act 1 — Brief (Workfront, 5 min)
Step 1: Show campaign brief created as a Workfront project — brief document, assets needed, dates
  → Value: "Single source of truth for the campaign. No brief-by-email."
Step 2: Show automatic task routing to designers
  → Value: "Work assignment is automatic based on skills and availability."

### Act 2 — Asset Production (Firefly + AEM Assets, 10 min)
Step 1: Designer opens Firefly within Creative Cloud — pulls brief context from Workfront
  Prompt in Firefly: "Generate 5 lifestyle product shots for summer outdoor campaign,
    brand palette, no text overlay"
  → Firefly returns brand-consistent options
  → Value: "First draft in 30 seconds. Designer curates, doesn't create from scratch."

Step 2: Designer uploads approved assets to AEM Assets from Creative Cloud
  → Assets versioned, metadata auto-applied, DMwOA URLs generated
  → Value: "One place for every asset version. No more 'final_v3_USE_THIS_ONE.jpg'."

### Act 3 — AEM Sites Publishing (10 min)
Step 1: Author pulls approved assets into campaign landing page in AEM Sites
  → Show DMwOA "Copy URL" button — asset delivery URL for web, mobile, email in one place
  → Value: "No asset export for every channel. One URL adapts to every format."

Step 2: Experience Production Agent updates campaign copy across all regional variants
  Prompt: "Update the campaign headline on all 12 regional pages to 'Summer Collection — Now Live'"
  → Multi-page update in seconds
  → Value: "Content operations at scale. No ticket queue."

### Act 4 — Measurement (5 min)
Step 1: Show campaign performance linked back into Workfront
  → Value: "Campaign metrics loop back into the work management system. Next brief starts smarter."

⚠ Constraint: Leverage shared Firefly-enabled AEM sandbox.
  If Firefly integration isn't available in the demo env, show the workflow diagram and narrate the step.
```

**Variants:**
- **B2B version:** Replace "seasonal campaign" with "product launch / event" story. Emphasis on regulatory approval workflow (Legal Agent) before publish.
- **B2C version:** Emphasize speed-to-market and personalization at scale (regional variants, audience segments via RTCDP references).

**Talk track — CMO:**
> "Today your campaign cycle burns 60% of its time on coordination — waiting for approvals, chasing assets, republishing corrected copy. This workflow eliminates the coordination overhead. Your creative team creates. AEM delivers. Workfront tracks. The loop is closed."

---

## EDS

### AEM Sites Edge / Edge Delivery Services + XWalk

**Value themes:** Fastest page load in the industry. Author-friendly workflows. Modern dev stack. PageSpeed 100 by default.

**EDS authoring modes:**
- **DA (Document Authoring)** — Google Docs / SharePoint → da.live → AEM EDS. Business authors write in tools they know.
- **Universal Editor (XWalk)** — In-context WYSIWYG on the live page. Closest to traditional CMS authoring.
- **Both (ise-boilerplate default)** — Recommended for all new projects. Dual authoring = flexibility.

**Performance story:**
- EDS delivers Core Web Vitals score of 100 by architecture, not by optimization effort
- JavaScript is loaded only per-block — no framework overhead
- No build step = no deployment bottleneck

**Demo script (EDS speed story, 20 min):**

```
### Beat 1 — The Speed Proof
Step 1: Run PageSpeed Insights on customer's current site → show score (typically 40–70)
Step 2: Run PageSpeed Insights on an EDS-delivered page (Frescopa or ref demo)
  → Show score: 100
  → Value: "This isn't optimization work we did. This is what EDS ships by default."

### Beat 2 — Author Experience
Step 1: Open DA (da.live) — show a simple document being authored in browser
Step 2: Toggle to the live preview — instant render
  → Value: "Your authors don't need a CMS training certification. They write. EDS delivers."

Step 3 (if XWalk): Open Universal Editor — show in-context WYSIWYG edit on the live page
  → Value: "For authors who want WYSIWYG, XWalk gives them that — same backend, same performance."

### Beat 3 — Dev Velocity
Step 1: Show the EDS block structure — one JS file, one CSS file per component
  → Value: "No build pipeline. No framework lock-in. A new block is two files. Your dev team ships faster."
Step 2: Show aemcoder.adobe.io — AI-assisted block generation
  → Value: "We've added AI to the dev workflow too. Describe the block, get the code."
```

**Expectations to set:**
- SharePoint/Docs-based authoring (DA) vs native AEM WYSIWYG (XWalk): clearly distinguish, don't conflate
- Production-ready: EDS core is GA. XWalk (Universal Editor on EDS) is GA. DA is GA.
- Custom blocks require dev work; block collection provides a reference library.

**XWalk trial setup:** Relies on AEM UE trial environment. Trial org has limited permissions for custom block configuration.

---

## DMwOA

### AEM Assets + Dynamic Media with OpenAPI

**Value:** Content velocity and channel reuse. One asset, infinite delivery formats via DM URL parameters. Integration with WordPress, Adobe Express, Creative Cloud, and any 3rd-party tool.

**Status:** DMwOA is **GA** and can be enabled per-environment. New Assets UI includes "Copy URL" button when DMwOA is enabled — use this as a visual confirmation during demo.

**Demo script:**

```
Scenario: A brand delivers assets across web, mobile, email, paid media, and partner portals.
Today: 6 export formats, 6 folders, 6 upload processes. One asset change = 6 updates.

Step 1: Upload a product image to AEM Assets in a DMwOA-enabled environment
  → Show "Copy URL" button in new Assets UI
  → Value: "One URL. This single URL delivers the right format for every channel."

Step 2: Show URL parameters in action:
  - Original URL → full resolution desktop image
  - Add ?width=400 → mobile thumbnail
  - Add ?format=webp → WebP for web performance
  - Add ?crop=1:1 → square crop for Instagram
  → Value: "No export. No re-upload. No version management. The URL does the work."

Step 3: Show AEM asset selector embedded in WordPress admin
  → Author selects AEM asset from within WordPress → DMwOA URL auto-inserted
  → Value: "Your WordPress team uses AEM assets without ever leaving WordPress. No download, no upload."

Step 4: Show same asset in Adobe Express → Creative Cloud asset panel → AEM-sourced
  → Value: "Creative Cloud tools speak DMwOA natively. Your design team is already connected."

⚠ Constraint: For DMwOA demos, use AEM Shared Production Environment access patterns.
  If DMwOA isn't enabled on the demo env, show the URL parameter concept with a pre-built demo URL.
  Do NOT attempt to enable DMwOA live during a demo.
```

**Integration glue message:**
> "DMwOA turns your AEM DAM into a content API. Any system that can request a URL can consume your assets. Today we showed WordPress. The same pattern works for your mobile app, your email platform, your partner portal — any system your team uses."

---

## Cross-Play Objection Handling

| Objection | Response |
|---|---|
| "We're evaluating Sitecore / Contentful / Optimizely" | Lead with ASO + EDS performance story — these competitors can't match Core Web Vitals at scale without significant optimization investment |
| "AI feels risky — how does governance work?" | Lead with Governance Agent + Content Advisor Agent — show that AI operates within human-approved guardrails, not instead of them |
| "We don't have budget for a new CMS" | ASO is an add-on to your existing AEM — no migration required. LLMO trial is $0. Lead with quick wins. |
| "Our team can't handle another tool" | DA authoring is Google Docs / SharePoint — no new tool. UE is in-context editing. EDS reduces, not adds, tool complexity. |
| "We need to see this with our own content" | Propose customer URL onboarded into ASO or LLMO trial — fastest path to "their data, their problem" proof |

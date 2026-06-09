---
name: happy-path
description: >
  AEM Happy Path: migration scoring and customer POV generation for the XSC team.
  Trigger phrases: "run migration-score on <url>", "run customer-pov on <customer>",
  "migration score for <url>", "generate POV for <customer>", "happy path assessment",
  "m2c score", "EDS migration complexity", "list m2c candidates"
---

# Happy Path Skill

## Skill Source

Canonical skill definitions (always authoritative):
- Migration score: `https://raw.githubusercontent.com/AdobeDevXSC/skills/main/plugins/aem/edge-delivery-services/skills/migration-score/SKILL.md`
- Customer POV: `https://raw.githubusercontent.com/AdobeDevXSC/skills/main/plugins/aem/edge-delivery-services/skills/customer-pov/SKILL.md`

## MCP Servers (Optional — enhances speed, not required)

| Server | URL | Purpose |
|--------|-----|---------|
| **Happy Path MCP** | `https://happy-path-mcp-production.up.railway.app/mcp` | Pre-computed scoring (faster) |
| **Microsoft 365** | Built-in connector | SharePoint account data (M2C lists, ARR, scores) |

**If MCP tools are available:**
- `migration_score(url, customer_name?)` → JSON score object
- `migration_score_report(score_data, customer_name?)` → Markdown report

**If MCP tools are NOT available (e.g. Adobe Enterprise plan):** execute natively using WebFetch — see Path B below.

**Microsoft 365 MCP tools used:**
- `sharepoint_search(query, site?)` → find files/pages
- `sharepoint_folder_search(site, path?)` → browse document libraries
- `read_resource(url)` → download file content

---

## Command: `run migration-score on <url>`

Matches the `migration-score` skill from [AdobeDevXSC/skills](https://github.com/AdobeDevXSC/skills).

### Step 0 — Check for existing score
If `migration_score_output` is already in context for this customer, extract it and skip to Step 3.

### Step 1 — Score the site

**Path A — Happy Path MCP available:**
```
migration_score(url: "<customer root URL>", customer_name: "<name if known>")
```

**Path B — No MCP (execute natively with WebFetch):**

Claude performs the 11-step assessment directly:

1. **Fetch sitemap** — try `<url>/sitemap.xml`, then `/sitemap_index.xml`. Count `<url>` entries for page count. Detect locale patterns (`/en/`, `/de/`, etc.). Identify template groups from depth-1 path segments.

2. **Sample pages** — fetch homepage + up to 4 representative pages across detected template groups.

3. **Classify each page's sections** into 6 tiers:
   - **Adopt as-is** — nav, header, footer, hero, columns, cards, quote, embed (standard EDS blocks)
   - **Customize** — carousel, accordion, tabs, banner, modal, table (need minor adaptation)
   - **Custom net-new** — deeply nested (6+ levels), 20+ child divs, unrecognized patterns
   - **Simple services** — YouTube/Vimeo embeds, Google Maps, simple forms, social widgets
   - **Complex services** — Coveo/Algolia search, Adobe Target, Marketo, auth/login/SSO, checkout
   - **SPA sections** — `__NEXT_DATA__`, `__NUXT__`, `data-reactroot`, `ng-version` detected

4. **Apply risk signals** — multi-locale (+5), auth/SSO (+5), personalization (+3), 500+ pages (+3), e-commerce (+4). Max penalty 15 pts.

5. **Compute score:**
   - `complexRatio` = (custom + complex_service + spa) / total blocks
   - Block penalty: High (ratio >0.40 or SPA or >2 complex services) = 50–60 pts; Medium = 25–45 pts; Low = 0–20 pts
   - `score` = 100 − blockPenalty − riskPenalty (clamped 0–100)

6. **Ease label:** 76–100 Easy · 51–75 Moderate · 26–50 Hard · 0–25 Very Hard

7. **Phase timeline:**
   - POC: 2–4 weeks, 5–10 representative pages
   - Pilot: 4–8 weeks, 50–100 pages
   - Scaled: based on total pages (≤100: 4–8wks, 100–500: 8–12wks, 500+: 12–20wks)

### Step 2 — Generate markdown report

**Path A:** Call `migration_score_report(score_data: <json>, customer_name: "<name>")`

**Path B:** Format the results directly as a markdown report matching the canonical Happy Path template (score, ease label, block inventory table, complex ratio, risk factors, phase timeline, assumptions).

### Step 3 — Present the report

Display the formatted report. Then offer:
- **"Generate customer POV"** → runs full POV workflow below
- **"Export as PowerPoint"** → run `/generate-pptx` with the report
- **"Refine the score"** → re-run with a specific page URL or adjusted assumptions

---

## Command: `run customer-pov on <customer name>`

Matches the `customer-pov` skill from [AdobeDevXSC/skills](https://github.com/AdobeDevXSC/skills).

### Step 0 — Migration score input check
If `migration_score_output` is in context, extract customer data and migration phase estimates. Skip Step 1 if already done.

### Step 1 — Collect customer info
Ask for (or infer from context):
- Customer name and website URL
- Industry / vertical
- Current AEM deployment (on-premise, Cloud Service, both)
- Key business goals (1–2 top digital priorities)

User may type "just start" to skip to research-based inference.

### Step 2 — Four-stream research (run in parallel)

**Stream 2a — Happy Path Core Data (HIGHEST PRIORITY)**

Use the **Microsoft 365 MCP** to search the `AEMNAMExpertSCs` SharePoint site.

Download-first protocol:
1. Call `sharepoint_search` with the customer name against each file
2. Use `read_resource` with the `downloadUrl` field to fetch file content locally
3. Skip files > 100MB or offer manual download if URL unavailable

Target files and data to extract:

| File | Extract |
|------|---------|
| `PBYB-Pipeline-M2C.xlsx` | M2EDS readiness score, ARR, renewal date, wave assignment |
| `EDS Migration Assessment.xlsx` | LLM Visibility Score (0–100), rationale |
| `M2C Candidate Data – Full List.xlsx` | Priority score, products in use, region |
| `EDS OnPrem Customers.xlsx` | On-premises deployment confirmation |
| `AI Visibility Renewals May 2026` | Renewal tracking, FLM team assignment |

Example M365 search calls:
```
sharepoint_search(query: "<customer name> PBYB Pipeline M2C", site: "AEMNAMExpertSCs")
sharepoint_search(query: "<customer name> EDS Migration Assessment", site: "AEMNAMExpertSCs")
sharepoint_search(query: "<customer name> M2C Candidate", site: "AEMNAMExpertSCs")
```

If not found in a file, record as "not in dataset" — never fabricate data.

**Stream 2b — Internal research (Microsoft 365 MCP)**

Search for existing account context:
```
sharepoint_search(query: "<customer name> AEM")
outlook_email_search(query: "<customer name> AEM EDS migration")
```

Look for: prior sales notes, technical requirements, AEM collateral, competitive assessments.

**Stream 2c — External research (web)**

Search publicly for:
- Customer's current CMS / tech stack signals
- Digital strategy statements (annual reports, press releases)
- Developer/engineering blog content
- Career postings (reveals platform priorities)
- AEM-related case studies or conference talks

Extract: tech stack, stated business priorities, digital maturity, pain points, competitive context.

**Stream 2d — AEM EDS reference (optional)**

Search `aem.live` documentation for relevant capabilities matching the customer's use case.

### Step 3 — Generate POV document

Combine all research into this 12-section structure. Output to a markdown file.

#### Section 1: Executive Summary
2–3 sentences stating:
- Customer's core digital challenge
- Status-quo risk
- Why EDS + Document Authoring is the fit

#### Section 2: Customer Snapshot
Table containing:
- Industry, current CMS, AEM products in use
- Current ARR, renewal date
- LLM Visibility Score (0–100)
- M2EDS readiness score
- Pipeline wave
- Key stakeholders

#### Section 3: Business Context & Strategic Priorities
Bulleted list of top digital priorities with source citations.

#### Section 4: Current State Assessment
Existing digital setup, identified pain points, and mapping of pain points to business impact. Evidence-based findings only.

#### Section 5: The Opportunity
How EDS addresses their specific priorities. How Document Authoring solves identified pain points. Differentiation from alternatives.

#### Section 6: Recommended Migration Approach
- Guiding principles
- Migration complexity (sourced from `migration_score_output` if available)
- Phased timeline (POC / Pilot / Scaled) with scope, duration, dependencies
- Success metrics

#### Section 7: Account Status & Financial Considerations *(Internal Only)*
Current ARR, open pipeline value, GNARR potential, renewal date context, whitespace tier, competitive risks, financial ROI narrative.

#### Section 8: Objection Handling *(Internal Only)*
Table: likely customer objections → tailored rebuttals based on discovered research signals.

#### Section 9: Benefits Summary
Organized by stakeholder: Business / Authors / Developers / IT-Operations.

#### Section 10: Risks & Mitigations
Common risks with mitigation approaches.

#### Section 11: Recommended Next Steps
5–6 action items: discovery call format, authoring workshop, pilot site selection, reference customers, success metric alignment.

#### Section 12: Supporting Assets
Links to AEM EDS documentation, da.live, case studies, internal reference resources.

### Step 4 — Delivery options

After presenting:
- **"Export as PowerPoint"** → run `/generate-pptx`
- **"Make customer-facing"** → strip sections 7–8 and reformat
- **"Add competitor comparison"** → direct analysis vs. alternative platforms
- **"Identify reference customers"** → search for matching industry/use-case customers
- **"Refine a section"** → update that section with new inputs

---

## Command: `list m2c candidates`

Use the **Microsoft 365 MCP** to fetch the M2C full list:
```
sharepoint_search(query: "M2C Candidate Data Full List", site: "AEMNAMExpertSCs")
```
Download and parse `M2C Candidate Data – Full List.xlsx`. Present as a sortable table with columns: Account, Priority Score, Products, Region, Wave.

Optional filters: vertical, region, wave, `min_score`.

---

## Scoring Reference

| Score | Label | Typical profile |
|-------|-------|----------------|
| 76–100 | Easy | Standard blocks, clean HTML, low custom ratio |
| 51–75 | Moderate | Some custom blocks or services |
| 26–50 | Hard | High custom ratio, auth/personalization, or large site |
| 0–25 | Very Hard | SPA sections, 3+ complex services, 500+ pages |

Scores are **intentionally conservative** — upper bound for customer expectation-setting.

## Block Tiers

| Tier | EDS Migration Effort |
|------|---------------------|
| Adopt as-is | Zero — standard EDS block |
| Customize | Low — minor adaptation |
| Custom net-new | High — full implementation required |
| Simple services | Medium — stateless API integration |
| Complex services | High — auth, search, personalization, e-commerce |
| SPA sections | Very high — React/Next/Vue/Angular decomposition required |

## Rules

- Every claim must tie to discovered evidence — flag inferences explicitly
- Sections 7–8 are internal only — never include in customer-facing exports
- Omit unsupported pain points rather than inventing plausible signals
- Position EDS as evolution of AEM investment, not replacement
- Tone, scale, and urgency adjust by customer profile and vertical


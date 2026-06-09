---
name: happy-path
description: >
  AEM Happy Path: migration scoring and customer POV generation for the XSC team.
  Trigger phrases: "run migration-score on <url>", "run customer-pov on <customer>",
  "migration score for <url>", "generate POV for <customer>", "happy path assessment",
  "m2c score", "EDS migration complexity", "list m2c candidates"
---

# Happy Path Skill

## MCP Servers Required

This skill requires two MCP servers to be connected:

| Server | URL | Purpose |
|--------|-----|---------|
| **Happy Path MCP** | `https://happy-path-mcp-production.up.railway.app/mcp` | Migration scoring (web scraping + analysis) |
| **Microsoft 365** | Built-in connector | SharePoint account data (M2C lists, ARR, scores) |

**Happy Path MCP tools:**
- `migration_score(url, customer_name?)` → JSON score object
- `migration_score_report(score_data, customer_name?)` → Markdown report

**Microsoft 365 MCP tools used:**
- `sharepoint_search(query, site?)` → find files/pages
- `sharepoint_folder_search(site, path?)` → browse document libraries
- `read_resource(url)` → download file content

---

## Command: `run migration-score on <url>`

Matches the `migration-score` skill from [AdobeDevXSC/skills](https://github.com/AdobeDevXSC/skills).

### Step 0 — Check for existing score
If `migration_score_output` is already in context for this customer, extract it and skip to Step 3.

### Step 1 — Score the site (Happy Path MCP)
Call the `migration_score` tool:
```
migration_score(
  url: "<customer root URL>",
  customer_name: "<name if known>"
)
```

The tool runs the full 11-step assessment internally:
- Fetches sitemap → counts pages, detects locales, identifies template groups
- Scrapes homepage + representative pages across template groups
- Classifies every component into 6 block tiers
- Applies risk modifiers (multi-locale, auth, personalization, large site, e-commerce)
- Computes 0–100 score and ease label
- Generates phase timeline (POC / Pilot / Scaled)

### Step 2 — Generate markdown report (Happy Path MCP)
```
migration_score_report(
  score_data: <full JSON from step 1>,
  customer_name: "<name>"
)
```

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

---

## Adobe Enterprise Plan (No Custom MCP Connector)

If the user is on an Adobe Enterprise claude.ai account where custom MCP connectors are blocked, generate an HTML artifact instead of calling MCP tools directly.

The artifact calls `POST https://happy-path-mcp-production.up.railway.app/score` from the browser — CORS is open, no connector needed.

When the user says "run migration-score on stantec.com" and no MCP tools are available, generate an artifact using this template. Replace `SITE_URL` and `CUSTOMER_NAME` with the actual values before generating.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AEM Migration Score</title>
<style>
  :root{--red:#FA0F00;--dark:#2C2C2C;--mid:#6E6E6E;--border:#E1E1E1;--bg:#F8F8F8}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;background:var(--bg);color:var(--dark);font-size:14px}
  header{background:var(--red);color:#fff;padding:14px 24px;display:flex;align-items:center;gap:12px}
  header svg{width:34px;height:24px;flex-shrink:0}
  header h1{font-size:16px;font-weight:600;letter-spacing:.01em}
  header span{font-size:13px;opacity:.85;margin-left:auto}
  main{max-width:860px;margin:24px auto;padding:0 16px;display:flex;flex-direction:column;gap:16px}
  .card{background:#fff;border:1px solid var(--border);border-radius:4px;padding:20px 24px}
  .card h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--mid);margin-bottom:14px}
  .score-row{display:flex;align-items:center;gap:24px}
  .score-num{font-size:64px;font-weight:700;line-height:1;color:var(--dark)}
  .score-num.easy{color:#2DA44E}
  .score-num.moderate{color:#0073E6}
  .score-num.hard{color:#E8A000}
  .score-num.very-hard{color:var(--red)}
  .ease-badge{display:inline-block;padding:4px 12px;border-radius:3px;font-size:13px;font-weight:700;color:#fff;background:var(--dark)}
  .ease-badge.easy{background:#2DA44E}
  .ease-badge.moderate{background:#0073E6}
  .ease-badge.hard{background:#E8A000}
  .ease-badge.very-hard{background:var(--red)}
  .score-meta{font-size:13px;color:var(--mid);line-height:1.6;margin-top:6px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#F3F3F3;border-bottom:2px solid var(--border);padding:8px 10px;text-align:left;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--mid)}
  td{padding:8px 10px;border-bottom:1px solid var(--border)}
  tr:last-child td{border-bottom:none}
  .pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:#F3F3F3;color:var(--mid)}
  .pill.high{background:#FEE9E7;color:#C9190B}
  .phase{border-left:3px solid var(--red);padding:10px 14px;margin-bottom:10px;background:#fff}
  .phase:last-child{margin-bottom:0}
  .phase strong{display:block;font-size:13px;margin-bottom:4px}
  .phase span{font-size:12px;color:var(--mid)}
  .risk-item{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px}
  .risk-item:last-child{border-bottom:none}
  .risk-detail{color:var(--mid);font-size:12px;margin-top:2px}
  .actions{display:flex;gap:10px;justify-content:flex-end}
  button{padding:8px 16px;border:none;border-radius:3px;font-size:13px;font-weight:600;cursor:pointer}
  .btn-primary{background:var(--red);color:#fff}
  .btn-secondary{background:#F3F3F3;color:var(--dark);border:1px solid var(--border)}
  #loading{text-align:center;padding:60px 0;color:var(--mid)}
  .spinner{width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--red);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 12px}
  @keyframes spin{to{transform:rotate(360deg)}}
  .error{color:var(--red);padding:20px;text-align:center}
  .assump{font-size:12px;color:var(--mid);line-height:1.6}
  .assump li{margin-bottom:4px}
  footer{text-align:center;padding:20px;font-size:11px;color:var(--mid)}
</style>
</head>
<body>
<header>
  <svg viewBox="0 0 34 26" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.5 0H34V26L20.5 0Z" fill="white"/>
    <path d="M13.5 0H0V26L13.5 0Z" fill="white"/>
    <path d="M17 9.5L22.5 26H18.3L16.7 21H11.3L17 9.5Z" fill="white"/>
  </svg>
  <h1>AEM Happy Path — Migration Score</h1>
  <span id="hdr-url"></span>
</header>

<main>
  <div id="loading">
    <div class="spinner"></div>
    <div>Analyzing site — fetching sitemap, sampling pages, classifying blocks…</div>
  </div>
  <div id="report" hidden></div>
</main>

<footer>Adobe Experience Cloud &nbsp;·&nbsp; AEM XSC Happy Path &nbsp;·&nbsp; Scores are intentionally conservative (upper bound on migration effort)</footer>

<script>
const SCORE_URL = 'https://happy-path-mcp-production.up.railway.app/score';
const SITE_URL = 'REPLACE_WITH_URL';
const CUSTOMER_NAME = 'REPLACE_WITH_CUSTOMER';

const easeClass = e => ({'Easy':'easy','Moderate':'moderate','Hard':'hard','Very Hard':'very-hard'}[e]||'hard');

function renderReport(d) {
  const inv = d.blockInventory;
  const rows = [
    ['Adopt as-is', inv.adopt, ''],
    ['Customize', inv.customize, ''],
    ['Custom net-new', inv.custom, 'high'],
    ['Simple services', inv.simple_service, ''],
    ['Complex services', inv.complex_service, 'high'],
    ['SPA sections', inv.spa, 'high'],
  ];
  const phases = (d.phases||[]).map(p=>`
    <div class="phase">
      <strong>${p.name}</strong>
      <span>${p.scope} &nbsp;·&nbsp; ${p.durationWeeks[0]}–${p.durationWeeks[1]} weeks</span>
    </div>`).join('');
  const risks = (d.riskFactors||[]).length
    ? d.riskFactors.map(r=>`<div class="risk-item"><div><div>${r.name}</div><div class="risk-detail">${r.detail}</div></div><div>+${r.penalty} pts</div></div>`).join('')
    : '<div class="risk-item"><span>No significant risk factors detected</span></div>';
  const assumptions = (d.assumptions||[]).map(a=>`<li>${a}</li>`).join('');
  const cls = easeClass(d.ease);
  const date = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});

  document.getElementById('report').innerHTML = `
    <div class="card">
      <h2>Migration Score &nbsp;·&nbsp; ${d.customer_name||CUSTOMER_NAME} &nbsp;·&nbsp; ${date}</h2>
      <div class="score-row">
        <div class="score-num ${cls}">${d.score}</div>
        <div>
          <div class="ease-badge ${cls}">${d.ease}</div>
          <div class="score-meta">
            <strong>${d.url||SITE_URL}</strong><br>
            Complex block ratio: ${Math.round((inv.complexRatio||0)*100)}% &nbsp;·&nbsp; Total blocks sampled: ${inv.total}
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Block Inventory</h2>
      <table>
        <thead><tr><th>Tier</th><th>Count</th><th>Complexity</th></tr></thead>
        <tbody>${rows.map(([tier,count,cls])=>`<tr><td>${tier}</td><td>${count}</td><td>${cls?`<span class="pill ${cls}">${cls==='high'?'High':'—'}</span>`:'<span class="pill">Standard</span>'}</td></tr>`).join('')}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>Phase Timeline</h2>
      ${phases||'<p style="color:var(--mid)">No phase data available</p>'}
    </div>

    ${d.riskFactors&&d.riskFactors.length?`<div class="card"><h2>Risk Factors</h2>${risks}</div>`:''}

    <div class="card">
      <h2>Assumptions</h2>
      <ul class="assump">${assumptions}</ul>
    </div>

    <div class="actions">
      <button class="btn-secondary" onclick="copyMarkdown()">Copy as Markdown</button>
      <button class="btn-primary" onclick="alert('Ask Claude to generate a full customer POV using this score data.')">Generate Customer POV →</button>
    </div>`;
}

function copyMarkdown() {
  const d = window.__scoreData;
  if (!d) return;
  const inv = d.blockInventory;
  const md = [
    `# AEM Migration Score — ${d.customer_name||CUSTOMER_NAME}`,
    `**Date:** ${new Date().toISOString().slice(0,10)}  `,
    `**URL:** ${d.url||SITE_URL}  `,
    `**Score:** ${d.score}/100 — **${d.ease}**`,
    '',
    '## Block Inventory',
    '| Tier | Count |',
    '|------|------:|',
    `| Adopt as-is | ${inv.adopt} |`,
    `| Customize | ${inv.customize} |`,
    `| Custom net-new | ${inv.custom} |`,
    `| Simple services | ${inv.simple_service} |`,
    `| Complex services | ${inv.complex_service} |`,
    `| SPA sections | ${inv.spa} |`,
    `| **Total** | **${inv.total}** |`,
    '',
    `**Complex Block Ratio:** ${Math.round((inv.complexRatio||0)*100)}%`,
    '',
    '## Phase Timeline',
    ...(d.phases||[]).map(p=>`**${p.name}** — ${p.scope} · ${p.durationWeeks[0]}–${p.durationWeeks[1]} weeks`),
    '',
    '## Assumptions',
    ...(d.assumptions||[]).map(a=>`- ${a}`),
  ].join('\n');
  navigator.clipboard.writeText(md).then(()=>alert('Copied to clipboard!'));
}

(async () => {
  document.getElementById('hdr-url').textContent = SITE_URL;
  try {
    const res = await fetch(SCORE_URL, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ url: SITE_URL, customer_name: CUSTOMER_NAME })
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    window.__scoreData = data;
    document.getElementById('loading').hidden = true;
    document.getElementById('report').hidden = false;
    renderReport(data);
  } catch (err) {
    document.getElementById('loading').innerHTML =
      `<div class="error">Failed to score site: ${err.message}<br><small>${SITE_URL}</small></div>`;
  }
})();
</script>
</body>
</html>
```

**How to use this template:**
When generating the artifact, replace `REPLACE_WITH_URL` with the actual customer URL and `REPLACE_WITH_CUSTOMER` with the customer name. The artifact auto-runs on load and renders the full scored report with Adobe branding.

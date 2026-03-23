# AEM XSC Environment Matrix

Reference for selecting the right environment for any demo scenario. Always state environment + rationale in your demo plan.

---

## Environment Hierarchy

```
XSC Showcase / Sandboxes        ← Full admin, all agents, DMwOA, approval workflows
AEM Ref Demo Shared (Frescopa)  ← Standard ASO, EDS, Assets demos — shared, no destructive changes
Customer Trial Org (TBYB)       ← Self-service, XSC as sherpa; no Cloud Manager
AEM Sites Trial (self-reg)      ← Quick TBYB; most AI features limited
AEM Playground                  ← SC personal folder only; agents with real data
```

---

## What Works Where {#what-works-where}

| Capability | XSC Showcase | Ref Demo Shared | Customer Trial | AEM Playground | Notes |
|---|:---:|:---:|:---:|:---:|---|
| ASO — Frescopa / standard | ✅ | ✅ | — | — | Ref Demo Shared preferred for ASO standard |
| ASO — Custom customer URL | ✅ | — | ✅ | — | Top 50-100 pages by traffic; no folder filtering |
| COA (Content Optimization Agent) | ✅ | — | ⚠ | ⚠ | Requires DMwOA + agents in manifest |
| EPA (Experience Production Agent) | ✅ | ⚠ | ⚠ | ⚠ | Author URL self-configures; Publish URL needs onboarding |
| Governance Agent | ✅ | — | — | — | Needs admin; can't set up policies in trial |
| Developer Agent | ✅ | — | ❌ | ❌ | Requires Cloud Manager — not available in trials |
| Content Advisor Agent (formerly Discovery Agent) — full flow | ✅ | — | ❌ | ⚠ | Needs approval workflow that adds tags; impossible in shared trial folders |
| Content Advisor Agent — concept only | ✅ | — | ⚠ | ⚠ | Show concept, acknowledge limitation |
| LLMO — internal deep-dive | ✅ | — | — | — | Internal org only; never share externally |
| LLMO — external demo | — | ✅ | ✅ | — | Use play.llmo.now or Frescopa demo URL |
| CSC (AEM+WF+Firefly) | ✅ | — | — | — | Use shared Firefly-enabled AEM sandbox |
| EDS / DA authoring | ✅ | ✅ | ✅ | — | DA is GA; XWalk trial uses AEM UE trial env |
| DMwOA demos | ✅ | — | ⚠ | — | Must be enabled per-environment; verify before demo |
| Metadata profile creation | ✅ | — | ❌ | ❌ | Admin required; not possible in trial or playground |
| Custom workflow creation | ✅ | — | ❌ | ❌ | Admin required; SC can't create in playground |
| Preflight | ✅ | ✅ | ⚠ | — | Show on Frescopa or dedicated preflight demo instance |

**Legend:** ✅ Works fully | ⚠ Works partially or with caveats | ❌ Does not work | — Not applicable

---

## Environment Details {#constraints}

### AEM XSC Showcase

- **Access:** XSC/SC team only. Customer-ready demos.
- **Strengths:** Full admin, DMwOA enabled, agents configured, approval workflows, Cloud Manager access via linked sandboxes.
- **Constraints:**
  - Intended for customer-ready demos — avoid destabilizing with experimental private releases.
  - If a custom private build is needed: rebuild on current RC baseline OR spin up a separate demo program.
  - Regional mirrors: US, EMEA, JAPAC — choose the one closest to the customer for latency.

---

### AEM Reference Demo Shared (Frescopa, WKND, Ref Demo 2.0)

- **Access:** Shared across the XSC/SC team.
- **Best for:** ASO standard demos, EDS/Sites performance story, early-stage generic demos.
- **Constraints:**
  - Shared environment — no destructive changes, no custom workflow creation.
  - Do NOT run long-running import/audit jobs without disabling them afterward.
  - Frescopa site: coffee brand, realistic content — most XSC demos default here.

---

### Customer Trial Org (TBYB)

- **Access:** Customer owns; XSC provides guidance and triage, not manual operation.
- **Best for:** ASO/LLMO TBYB — self-service quick start with XSC as sherpa.
- **Constraints:**
  - No custom workflows, no metadata profiles, no Cloud Manager access.
  - Developer Agent: does NOT work (no CM permissions).
  - Content Advisor Agent full flow: NOT possible (can't add tags in shared folders).
  - XSC should prefer read-only access for freemium/TBYB motions.
  - For LLMO: position product as self-service; escalate to Tiger Team only for blockers.

---

### AEM Sites Trial (Self-Registered)

- **Access:** Self-registered by customer or XSC.
- **Best for:** Quick product overview, early-discovery lightweight demos.
- **Constraints:** Same as Customer Trial Org — limited permissions. Developer Agent never works here.

---

### AEM Playground

- **Access:** SC personal folders only.
- **Best for:** Showing agents with real SC-uploaded content; ad-hoc exploration.
- **Constraints:**
  - SCs can edit metadata only in personal playground folders.
  - Cannot create new metadata profiles or workflows — need admin assistance for that.
  - Content Advisor Agent brand-approved retrieval: NOT fully demonstrable (approval workflow requires admin-level setup).
  - Some AI features need manual tags + workflows that are only feasible with elevated permissions.

---

## Pre-Demo Setup Checklist

Before any demo with AI agents:

```
[ ] Confirm environment: XSC Showcase / Sandbox / Ref Demo Shared / Trial / Playground
[ ] Confirm agents are enabled in org manifest (for COA, EPA, Governance, Developer, Discovery)
[ ] Confirm DMwOA is activated if running COA or DMwOA demo
    → Verify: New Assets UI shows "Copy URL" button
[ ] Confirm approval workflow is pre-configured if running Content Advisor Agent (Brand Approved tags)
[ ] Confirm Cloud Manager access if running Developer Agent demo
[ ] Disable imports/audits on ASO demo after demo onboarding (prevent long-running jobs)
[ ] For LLMO: confirm which URL is safe to share externally (play.llmo.now = safe; internal orgs = internal only)
[ ] For custom customer URL demo: pre-run the top-100 page scan; manually remove irrelevant sections (careers, internal)
```

---

## Troubleshooting Guide

| Symptom | Likely Cause | Fix |
|---|---|---|
| COA returns no results | DMwOA not enabled or agents not in manifest | Verify manifest config and DMwOA activation — do NOT change the prompt |
| Developer Agent fails silently | No Cloud Manager access | Switch to XSC Sandbox with CM access; never attempt in trial org |
| Content Advisor Agent returns unapproved assets | No approval workflow / brand-approved tags set up | Pre-configure approval workflow in Showcase; in trial, show concept only |
| ASO projected value unrealistically low | Low-traffic demo site or demo approximation | Switch to "number of issues" report view; explain methodology is illustrative |
| EPA not working on a page | Using Publish URL without onboarding | Switch to Author URL — self-configuring for EPA; flag Publish URL limitation |
| LLMO org shows competitor brands | Using internal org | Switch to play.llmo.now (Frescopa only) for external demos |
| COA prompt works in Trial but not Showcase | Manifest misconfigured in Showcase | Verify manifest in Showcase — don't assume it's the prompt |
| Workflow won't run for governance demo | Trial/Playground — no workflow creation rights | Use XSC Showcase; pre-configure the governance workflow before the demo |

---

## Environment Decision Flowchart

```
What kind of demo?
│
├── Standard / early-stage / generic
│   └── → AEM Ref Demo Shared (Frescopa)
│
├── Full AI agent deep-dive
│   └── → XSC Showcase (with DMwOA + agents + approval workflows pre-configured)
│
├── Developer Agent specifically
│   └── → XSC Sandbox with Cloud Manager access
│       (NEVER trial orgs)
│
├── LLMO — external audience
│   └── → play.llmo.now (Frescopa only)
│
├── LLMO — internal deep-dive
│   └── → XSC Showcase IMS org (internal only, never share externally)
│
├── Customer's own site / data (TBYB)
│   └── → Customer trial org; XSC as sherpa, not operator
│
├── Custom private build needed
│   └── → Spin up separate demo program on current RC baseline
│       (NEVER push private releases to production-aligned programs)
│
└── Quick ad-hoc / personal content
    └── → AEM Playground (personal folders only)
```

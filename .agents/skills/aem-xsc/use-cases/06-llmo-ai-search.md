# LLMO — Customer Watching Their Organic Traffic Disappear

**Trigger:** Customer mentions AI search traffic loss, ChatGPT answers replacing their pages, asks about GEO/AI visibility, or is evaluating Profound, Scruncher, BrightEdge, or Prerender.io.

**Output the demo script or competitive response immediately. Do not preface.**

---

## TL;DR — read this before anything else

**LLMO wins** when the story is: *"We need to see how AI agents actually use our content, then fix it automatically in our stack (especially AEM/CDN)."*

**Competitors win** when the buyer optimizes on: cheaper prompt analytics, richer prompt-level dashboards today, or classic SEO-only use cases.

If you cannot move the conversation from "better dashboards" to "automatic fixes in our stack," LLMO will lose on price. Get here first.

---

## Qualify first — output the right response based on what they want

```
Are they on AEM / Adobe CDN?
├── Yes → LLMO is the play. Full stack integration no competitor can match.
└── No  → Still a play, but lead with visibility story not deployment.

Are they asking about prompt-level dashboards or trending keywords?
├── Yes → Acknowledge Profound is stronger there. Lead with deployment gap.
└── No  → Full LLMO story.

Is price the primary objection?
├── Yes → Reframe: fewer relevant prompts > thousands of generic ones.
│         LLMO selects brand-specific queries; Profound runs tens of thousands
│         of generic prompts. Cost per insight, not cost per prompt.
└── No  → Full LLMO story.
```

---

## 20-minute demo script

### Opening — the problem they already feel (2 min)

*"You are not losing traffic because your SEO got worse. You are losing it because ChatGPT is now the answer layer between your content and your audience. Google still indexes you. The AI just answers before anyone gets there."*

Show: search their category term in ChatGPT. Count how many times their brand appears vs competitors. That number is their LLMO score. They already know it is bad.

### The three layers competitors don't connect (3 min)

LLMO tracks the full AI discovery funnel — not just "where am I cited":

| Layer | What LLMO does | What competitors do |
|---|---|---|
| **Brand Presence** | Synthetic prompts across ChatGPT (Perplexity + Google AI Overviews on roadmap) — visibility %, citations, sentiment per topic | Profound does this too, with more prompt-level depth today |
| **Agentic Traffic** | Reads CDN/edge logs, isolates AI/LLM user agents hitting your pages. Zero-tag on AEM — logs stream automatically | Most claim "agentic insights"; none have native AEM/Adobe CDN access |
| **Referral Traffic** | Measures real users clicking from AI answers to your site. AA connector GA Q1 CY26 — citations → traffic → revenue | Competitors stop at "you were cited." LLMO closes the loop to business outcome |

*"The field asks 'where am I cited?' LLMO asks 'where am I cited, which pages do agents actually hit, and what happened after?'"*

### Live demo — `play.llmo.now` (external-safe, no login) (10 min)

1. Enter `adobe.com` — show the AI citation analysis
2. Before/after: unoptimized page vs LLMO-optimized in AI search results
3. Customer zero: *"adobe.com went from cited in 12% of relevant AI queries to 67% in 90 days."*
4. **Optimize at Edge** — this is the differentiator no one else has:
   - Runs at CDN layer, rewrites markup for AI user-agents only using headless prerender
   - Doesn't touch origin code. Humans keep the normal experience.
   - 5-minute TTL vs Prerender.io's 6+ hour minimum
   - Injects summaries, FAQs, schema for AI — not just prerender
   - *"This is essentially Prerender.io + AI-only + Adobe governance, included in LLMO."*
5. AEM auto-optimize (Q1 FY26): LLMO commits patches to the repo, triggers Cloud Manager, authors review in AEM, publish via normal workflow. No competitor can do this.

### Close (5 min)

*"Your competitors are already doing this. The brands getting cited in ChatGPT answers right now structured their content for AI retrieval six months ago."*

Proof path: LLMO trial is $0 SKU. Run it on their site today.

**Environment:** `play.llmo.now` only for external demos. Never share XSC Showcase LLMO URL externally.

---

## Competitive responses — output immediately when a competitor is named

### vs Profound (primary direct rival)

**Where Profound is ahead — be honest:**
- Richer prompt-level analytics UI (Conversation Explorer, per-prompt sentiment)
- "Real-time AI search volume" and trending topics — LLMO has Topic Popularity (SERP-based high/med/low) but not true real-time trending
- Multi-user collaboration features more mature today
- ~$499/month entry price vs LLMO's $20/prompt pricing
- Internal assessment: Profound is ~6 months ahead in prompt analytics feature depth

**Where LLMO wins — use these lines:**
*"Profound shows you the dashboard. LLMO ships the fix. Show me a Profound deployment into AEM or an edge CDN."*

- Optimize-at-Edge: Profound has no CDN-layer optimization. They tell you to fix it. LLMO does it.
- AEM auto-optimize pipeline: Profound can't commit to your AEM repo.
- Adobe stack: native AA integration, Workfront handoff (1H FY26), AEM CS zero-tag onboarding
- Prompt relevance: LLMO tracks brand-selected topics, not tens of thousands of generic prompts. Cost per insight is lower even if cost per prompt looks higher.

**The close vs Profound:**
*"If you want the richest prompt explorer on the market today, Profound is a reasonable choice. If you want AI visibility that automatically fixes itself inside your AEM and CDN infrastructure, there is no comparison."*

### vs Scruncher

Price-driven competitor. Same response as Profound on prompt analytics.

*"Scruncher and Profound will look cheaper per prompt. The question is whether 'cheaper prompt tracking' solves the problem or whether you need the fix to happen automatically in your stack."*

### vs Prerender.io

**The displacement pitch** — many customers are already paying for Prerender separately:

| | LLMO Optimize-at-Edge | Prerender.io |
|---|---|---|
| Target | LLM/AI bots only | SEO bots + LLMs |
| TTL | ~5 minutes | 6+ hours (enterprise minimum) |
| AI content | Prerender + summaries/FAQ/schema injection | Prerender only |
| SEO risk | No — doesn't touch Googlebot | Can alter SEO behavior |
| Cost | Included in LLMO | Separate SKU |

*"You are probably already paying Prerender.io. LLMO replaces it with fresher TTL, AI-specific content injection, and governance — included."*

**The budget angle:** Many customers are paying Prerender.io separately — it doesn't show up as a GEO line item, it shows up as "infrastructure" or "SEO tooling." Ask: *"Are you currently paying for any prerendering or bot-caching service?"* That budget is the natural reposition into LLMO.

**Caveat:** If their only use case is generic Googlebot prerendering across all sites with no AI angle, Prerender stays simpler. Don't force the displacement.

### vs BrightEdge / Conductor / SEMrush

These are not direct competitors — they are SEO rank trackers.

*"LLMO is not a SERP rank tracker. If the RFP is purely 'better SEO dashboards and keyword rank reporting,' LLMO will feel heavy. If it's 'how do I get cited by ChatGPT and have those fixes happen automatically,' that's a different product category entirely."*

The Semrush acquisition ($1.9B, H1 2026) closes the gap: Adobe will be the only vendor with traditional SEO + AI SEO + CMS as one platform. Use it when SEMrush is in the room.

### vs Optimizely / Gradial (experimentation + content automation overlap)

These appear in deals where the buyer is running A/B testing and content automation together. They are not GEO tools but they blur the "AI content optimization" story.

*"Optimizely optimizes which variant wins with your current audience. LLMO optimizes whether AI systems cite you at all. Those are different problems — one assumes users reach your site, the other ensures AI sends them there first."*

Gradial is emerging as a content automation layer. If it comes up: *"Gradial automates content production. LLMO optimizes whether that content gets retrieved by AI search. Stack them or let us show you how AEM's AI pipeline does both natively."*

---

## Honest gaps — use these proactively with technical buyers

| Gap | What to say |
|---|---|
| AEM CS auto-optimize not GA | *"Edge optimization is live now. AEM CS one-click deployment is Q1 FY26 — we can start with edge and migrate."* |
| AA integration manual until Q1 CY26 | *"Native connector is Q1 CY26. Until then it's export-based — workable for a pilot."* |
| No feedback loop to ChatGPT/Perplexity | *"LLMO surfaces the issue and fixes your content. Pushing corrections directly to the LLMs is not how that works at a platform level — no vendor has this."* |
| ChatGPT first; Perplexity + Google AI Overviews next | *"GA covers ChatGPT. Perplexity and Google AI Overviews are next on the roadmap."* |
| No Claude / Alexa / AWS Bedrock integrations | Flag only if asked. Rare objection. |

---

## Win/lose summary — route the deal

| Situation | Call |
|---|---|
| Customer on AEM/Adobe CDN, wants AI visibility + automatic fixes | **LLMO wins** — stack integration + Optimize-at-Edge no competitor matches |
| Paying for Prerender.io, wants AI optimization too | **LLMO wins** — displace and consolidate |
| Obsessed with prompt-explorer UI and trending keywords | **Caution** — Profound ahead here today; lead with deployment story |
| Just wants cheaper SEO dashboards | **Not LLMO's lane** — redirect to ASO or acknowledge SEO tools are better fit |
| Price-only RFP, cheapest GEO per prompt | **Difficult** — reframe cost per insight; if they won't move, Profound/Scruncher will win on price |
| Already heavy Adobe stack (AEM CS, AA, Workfront) | **Strongest LLMO position** — no competitor can match native integration |

---

## Overnight handoff — kick off and sleep

**When to use:** End of a discovery call. You have the customer URL. The next call is tomorrow.

**Execute this before you close the call:**

```
1. Run play.llmo.now on the customer URL — capture the baseline citation score
2. Kick off /scrape-webpage on their top 5 pages — full DOM capture
3. Run /identify-page-structure on each page — flag what's unstructured for AI retrieval
4. Queue /docs-search for LLMO optimization patterns matching their content type
5. Let it run. Do not watch it.
```

**Wake up to this ready:**
```
✓ Citation baseline — brand visibility % vs top 3 competitors in ChatGPT
✓ Page-level gaps — which pages have no AI-readable structure (no schema, no FAQ, no summary)
✓ Optimization priority list — ranked by traffic + citation gap
✓ First 3 content fixes — ready to show or apply via da_write
✓ Demo brief pre-filled — environment, play selection, talk track drafted
```

**The open for the next call:**
*"I ran your site through our AI citation analysis last night. You're being cited in 8% of relevant queries. Your top competitor is at 43%. Here's the three-page breakdown — and I have the first fix ready to show you live."*

This is the difference between an XSC who preps for one call at a time and one who runs five deals in parallel. Kick off the analysis, sleep, close the next morning.

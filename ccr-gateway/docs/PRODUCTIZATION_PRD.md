# CCR Gateway — Productization PRD (v2: Multi-Tenant SaaS)

**Version**: 0.1
**Date**: 2026-07-01
**Status**: Draft
**Owner**: Courtney Remekie
**Supersedes for productization purposes**: `docs/PRD.md` (v1 remains accurate for the single-user local mode; this doc layers a commercial multi-tenant mode on top)

---

## 1. Business Model

**Hosted pool, margin-based SaaS.** You run the model backend (AWS Bedrock, Bedrock Mantle-equivalent, self-hosted vLLM) multi-tenant in your own AWS account. Customers pay a subscription/usage fee; you pay AWS for the actual inference. Margin = customer price − backend cost − infra/ops cost.

**Why not BYO-cloud instead**: zero margin on tokens, you're purely a UI/policy layer. Fine as a phase-2 tier for enterprise customers who refuse to send traffic through a third party, but the hosted pool is what makes this a real business rather than a feature.

**Cost-control requirement this creates** (non-negotiable before selling a single seat): per-tenant spend caps and rate limits. A single runaway agent loop on one customer must not be able to consume the margin from ten others. This is new work — today's gateway has no concept of a tenant or a spend ceiling.

---

## 2. Competitive Positioning

| Competitor | License | What they do well | Gap they leave open |
|---|---|---|---|
| LiteLLM | MIT (Python) | 100+ provider translation, retries, load balancing, cost tracking | No task-complexity classifier, no policy/compliance layer |
| Portkey Gateway | OSS (TypeScript) | Ultra-lightweight edge proxy, <1ms overhead, guardrails | Guardrails are content-safety focused, not cost-routing focused |
| Helicone | Apache 2.0 | Observability, structured logging, self-hosted dashboard | Pure observability — doesn't make routing decisions or block requests |
| OpenRouter | Closed | Unified billing/credits UX, model marketplace | No policy engine, no compliance reporting, no on-prem/enterprise story |

**The wedge**: none of the above auto-escalate a request to a premium model based on sensitive-keyword detection (`auth`, `billing`, `secrets`, `payment`) or ship a CISO-approval-ready compliance export as a first-class artifact. Position this as **"the router a security team will sign off on"** — cost savings is the entry point, compliance/audit trail is the retention hook and the reason a competitor can't easily copy you (it requires the policy engine + reporting to be genuinely good, not bolted on).

---

## 3. Architecture Changes Required (v1 local → v2 multi-tenant SaaS)

```
Customer's Claude Code / any OpenAI-compatible client
        │  ANTHROPIC_BASE_URL=https://api.<yourproduct>.com  (per-tenant API key)
        ▼
┌─────────────────────────────────────────────────────────┐
│  Edge (Fargate, auto-scaled, stateless)                  │
│   - Tenant auth (API key → tenant_id)                    │
│   - Per-tenant rate limit + spend-cap check (Redis)      │
│   - classifyTask() + PolicyEngine (existing logic,       │
│     now tenant-scoped: each tenant has its own policy    │
│     rules row-set, not a shared .ccrignore file)         │
└───────────────────────┬───────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        ▼                                  ▼
┌──────────────────┐            ┌────────────────────────┐
│ LiteLLM proxy     │            │ Anthropic pass-through  │
│ (sidecar, handles │            │ (existing Rule A logic, │
│ 100+ providers,   │            │ tenant's own key or     │
│ retries, Bedrock/ │            │ your pooled key)        │
│ OpenAI/etc.)       │            └────────────────────────┘
└──────────────────┘
        │
        ▼
   Postgres (tenants, policy_rules, request_events —
   replaces single-process ccr_database.json;
   partition every table by tenant_id)
        │
        ▼
   Reporting service (async, reads Postgres) → dashboard + CISO export per tenant
```

### Concrete changes from the existing codebase

1. **Multi-tenancy**: every table in `db.ts` gets a `tenant_id` column. `ccr_database.json` (single JSON file, single process) does not survive contact with more than one customer — move to Postgres (RDS) before onboarding tenant #2, not after.
2. **Auth**: replace the no-op `ADMIN_TOKEN` header (flagged as unset in v1 PRD §12) with real per-tenant API keys, hashed at rest, resolved to `tenant_id` on every request.
3. **Spend caps**: new `tenant_quotas` table (daily/monthly $ ceiling, requests/min rate limit). Check before dispatch, not after — reject with 429 rather than let a request through and reconcile later.
4. **Model backend**: introduce LiteLLM as a sidecar/upstream (own container, OpenAI-compatible API) for anything that isn't the Anthropic-native pass-through. Retire `aws_connectors.ts`'s hand-rolled `translateAnthropicToOpenAI`/`translateOpenAIToAnthropic` in favor of LiteLLM's, which already covers image blocks and streaming (both flagged as v1 gaps in PRD §8, §3).
5. **Policy engine**: `policy.ts`'s `DEFAULT_RULES` + `.ccrignore` file become per-tenant DB rows, editable via the dashboard (already has a "Policy manager" UI per v1 PRD §10 — extend it to be tenant-scoped instead of global).
6. **Billing**: Stripe metered billing, usage events emitted per request (tokens routed, $ saved vs. baseline Claude pricing — the "$ saved" number is your core sales pitch, already partially computed via `TOKEN_COSTS` in `server.ts`).
7. **Deployment**: Fargate (stateless edge, easy horizontal scale) + RDS Postgres + ElastiCache Redis (rate limiting) + the LiteLLM sidecar as its own Fargate service or task-group sidecar container.

---

## 4. Phased Roadmap

### Phase 0 — De-risk (1-2 weeks)
- Swap `ccr_database.json` for Postgres, single-tenant still (no behavior change, just the storage migration everything else depends on)
- Stand up LiteLLM as a sidecar in a dev environment, prove the classifier can dispatch to it instead of `aws_connectors.ts` for at least one provider lane
- Define the tenant/quota schema (even before multi-tenant auth exists)

### Phase 1 — Multi-tenant MVP (3-4 weeks)
- Real API-key auth → tenant_id resolution
- Per-tenant spend caps + rate limiting (Redis)
- Per-tenant policy rules (DB-backed, dashboard-editable)
- Deploy edge on Fargate behind an ALB, LiteLLM sidecar per task or shared pool

### Phase 2 — Sellable (2-3 weeks)
- Stripe metered billing wired to actual usage events
- Per-tenant dashboard (cost saved, routing breakdown, policy hits)
- Per-tenant CISO compliance export (already exists as a capability in v1 — just needs tenant scoping)
- Self-serve signup flow

### Phase 3 — Enterprise tier (later, demand-driven)
- BYO-cloud option for customers who won't send traffic through a third party
- SSO/SCIM, audit log export, custom policy rule authoring UI

---

## 5. Open Questions

| # | Question | Priority |
|---|---|---|
| 1 | Pricing model: flat seat, per-request metered, or % of $ saved? | High — blocks Stripe integration design |
| 2 | Which AWS account model backend runs in — your existing personal/dev AWS account, or a new dedicated production account? | High — blocks Phase 1 deployment |
| 3 | Does the classifier need per-tenant tuning (e.g. a tenant's own sensitive-keyword list) or is one global classifier acceptable for MVP? | Medium |
| 4 | LiteLLM sidecar: one shared instance for all tenants, or one per tenant for isolation? Shared is cheaper, per-tenant is safer against noisy-neighbor and easier per-tenant cost attribution. | Medium |

---

## 6. Explicitly Out of Scope for MVP

- BYO-cloud tier (Phase 3)
- SSO/SCIM
- Custom per-tenant model registries (start with one shared registry, all tenants route through the same model list)
- Multi-region deployment

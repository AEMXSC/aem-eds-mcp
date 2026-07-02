# CCR Gateway — Product Requirements Document

**Version**: 1.0  
**Date**: 2026-06-28  
**Status**: Draft  
**Owner**: Courtney Remekie  

---

## 1. Purpose

The CCR Gateway is a local reverse-proxy that sits between the Claude Code CLI/IDE and upstream model providers. Its single purpose is to intercept every LLM request that Claude Code would otherwise send directly to `api.anthropic.com`, apply a routing policy, and dispatch to the cheapest model capable of handling the task — while preserving the personal Anthropic subscription for queries that genuinely require it.

This document captures what is already built, what gaps remain, and what the acceptance criteria are for each capability area.

---

## 2. Problem Statement

Claude Code always requests `claude-sonnet-4-6` (or a named Anthropic model) regardless of task complexity. A Dockerfile snippet, a YAML config, a bash one-liner — all billed identically to a complex architectural analysis. The cost structure is wrong for daily IDE use.

Two billing pools are available:
- **Personal subscription** — Anthropic API calls billed to the user's Claude Code account
- **Enterprise quota** — Mantle (Bedrock) and self-hosted EKS capacity billed to corporate AWS

The gateway's job is to route low-complexity tasks to the enterprise pool and reserve the personal subscription for high-complexity or sensitive work.

---

## 3. Scope

### In Scope (v1)
- Local HTTP proxy intercepting Claude Code CLI egress
- Task classifier routing requests to cheap OSS models or premium Claude
- Schema translation layer (Anthropic ↔ OpenAI format)
- EKS health checks with Mantle fallback
- Policy engine (file-path blocking, keyword escalation, workspace-name heuristics)
- Admin dashboard (request log, route selector, spend estimates)
- Billing isolation: enterprise credentials for OSS routes, personal key pass-through for Claude routes

### Out of Scope (v1)
- ML-based intent classification (keyword heuristic is sufficient for v1)
- Multi-user / team deployment (single-user local only)
- Tool-use / function-calling round-trip preservation (partial — text-only translation in v1)
- Image block translation (not yet implemented)

---

## 4. Architecture

```
Claude Code CLI
     │  ANTHROPIC_BASE_URL=http://localhost:8081
     ▼
CCR Gateway (Fastify, port 8081)
     │
     ├─ PolicyEngine (policy.ts)
     │    ├─ .ccrignore file-path blocks
     │    ├─ Workspace-name heuristics (payment/auth → escalate, secure → qwen)
     │    └─ Regex content scanning
     │
     ├─ classifyTask() heuristic (server.ts:375-389)
     │    ├─ config/devops keywords → aws-hosted/qwen-coder-32b
     │    └─ default → aws-hosted/deepseek-coder-v2
     │
     ├─ Escalation gates (retry ≥ 2, context > 120k chars, sensitive keywords,
     │    complexity keywords) → bedrock/claude-3-5-sonnet
     │
     ├─ EKS health check → if unhealthy, remap to Mantle equivalent
     │
     └─ Dispatcher
          ├─ aws-hosted/*  → invokeVllmModel (EKS OpenAI endpoint)
          ├─ mantle/* (OSS) → invokeMantleOssModel (Bedrock Mantle OpenAI endpoint)
          ├─ mantle/* (Anthropic) → invokeMantleAnthropicModel (Bedrock Mantle)
          ├─ bedrock/*     → invokeBedrockModel (AWS SDK)
          └─ default       → upstream proxy → api.anthropic.com (personal key)
```

**Schema translation** (aws_connectors.ts):
- Outbound: `translateAnthropicToOpenAI()` — flattens content blocks, injects system message, remaps roles
- Inbound: `translateOpenAIToAnthropic()` — wraps `choices[0].message.content` in Anthropic message envelope

---

## 5. Routing Rules

### Rule A — Upstream Pass-Through (personal subscription)
**Trigger**: Route resolves to any non-`aws-hosted/`, non-`mantle/`, non-`bedrock/` prefix, OR the DB `activeRoute` is a standard Claude model ID.  
**Action**: Strip nothing. Forward original `x-api-key` / `Authorization` header intact to `https://api.anthropic.com`.  
**Billing**: Personal Claude Code subscription.  
**Security constraint**: Gateway must remain local-only (`localhost`) while Rule A is active. Remote deployment requires a secrets vault; personal key must never appear in gateway logs.

### Rule B — Enterprise OSS Models
**Trigger**: Route resolves to `aws-hosted/*` or `mantle/*` (OSS provider).  
**Action**: Replace credentials with `AWS_BEARER_TOKEN_BEDROCK`. Translate request to OpenAI format, dispatch, translate response back.  
**Billing**: Enterprise AWS/Mantle quota.

### Rule C — Enterprise Anthropic via Bedrock
**Trigger**: Route resolves to `bedrock/*` or `mantle/*` (Anthropic provider).  
**Action**: Use AWS SDK (`fromNodeProviderChain`) or Mantle Anthropic endpoint with `AWS_BEARER_TOKEN_BEDROCK`. Anthropic message format preserved (no translation).  
**Billing**: Enterprise AWS/Mantle quota.

### Rule D — EKS Fallback to Mantle
**Trigger**: EKS vLLM health ping fails AND chosen route is `aws-hosted/*`.  
**Action**: Dynamically re-route using the registry's `fallbackModelId` metadata property (e.g. `aws-hosted/qwen-coder-32b` → `mantle/qwen3-coder-next`, and others to `mantle/deepseek-v3.2`).  
**Reason**: Eliminate hardcoded routes by declaring fallbacks directly in model definitions.

---

## 6. Task Classification

`classifyTask(promptText: string)` — current implementation (keyword heuristic):

| Condition | Route | Reason tag |
|---|---|---|
| Prompt contains any of: `html`, `css`, `yaml`, `yml`, `json`, `markdown`, `config`, `setup`, `docker`, `bash`, `shell`, `bootstrap`, `ci/cd`, `github actions` | `aws-hosted/qwen-coder-32b` | `cheap_route_qwen_coder_spec` |
| Prompt retry count ≥ 2 on a cheap route | `bedrock/claude-3-5-sonnet` | `cheap_route_retry_escalation` |
| Prompt > 120,000 chars on cheap route | `bedrock/claude-3-5-sonnet` | `context_window_ceiling_escalation` |
| Prompt contains `billing`, `payment`, `auth`, `credentials`, `secrets` | `bedrock/claude-3-5-sonnet` | `sensitive_context_escalation` |
| Prompt contains `migration`, `database design`, `architecture`, `refactor whole` | `bedrock/claude-3-5-sonnet` | `complexity_task_escalation` |
| Default (none of the above) | `aws-hosted/deepseek-coder-v2` | `standard_task_cheap_route` |

**Known limitation**: Keyword matching produces false negatives on questions *about* devops topics (e.g. "explain this Dockerfile") without devops keywords in the query. False positives are harmless (cheap model handles it or retries escalate). False negatives cost money (Claude handles something Qwen could). Acceptable for v1.

---

## 7. Model Registry

Source of truth: `src/model_registry.ts` — `UNIFIED_MODEL_REGISTRY`.

| Route ID | Provider | Hosting | Status | Billing |
|---|---|---|---|---|
| `aws-hosted/deepseek-coder-v2` | DeepSeek | EKS vLLM | online | Enterprise |
| `aws-hosted/qwen-coder-32b` | Alibaba | EKS vLLM | online | Enterprise |
| `aws-hosted/glm-coder-v2` | GLM | EKS vLLM | online | Enterprise |
| `bedrock/claude-3-5-sonnet` | Anthropic | Bedrock PrivateLink | online | Enterprise |
| `bedrock/claude-sonnet-4-6` | Anthropic | Bedrock PrivateLink | online | Enterprise |
| `mantle/claude-haiku-4-5` | Anthropic | Bedrock Mantle | online | Enterprise |
| `mantle/qwen3-coder-next` | Alibaba | Bedrock Mantle OSS | online | Enterprise |
| `mantle/deepseek-v3.2` | DeepSeek | Bedrock Mantle OSS | online | Enterprise |
| `mantle/qwen3-coder-480b` | Alibaba | Bedrock Mantle OSS | online | Enterprise |
| `mantle/devstral-2-123b` | Mistral | Bedrock Mantle OSS | online | Enterprise |
| `mantle/kimi-k2-thinking` | Moonshot AI | Bedrock Mantle OSS | online | Enterprise |
| `mantle/gpt-oss-20b` | OpenAI | Bedrock Mantle OSS | online | Enterprise |
| `mantle/gpt-oss-120b` | OpenAI | Bedrock Mantle OSS | online | Enterprise |
| `internal/adobe-codex-v2` | Adobe | Internal VPN | online | Enterprise |
| `mantle/claude-sonnet-4-6` | Anthropic | Bedrock Mantle | offline* | Enterprise |
| `mantle/claude-opus-4-8` | Anthropic | Bedrock Mantle | offline | Enterprise |
| `mantle/grok-4.3` | xAI | Bedrock Mantle OSS | offline | Enterprise |
| `mantle/gpt-5.5` | OpenAI | Bedrock Mantle OSS | offline | Enterprise |

*`mantle/claude-sonnet-4-6` auto-falls back to `bedrock/claude-sonnet-4-6` (native SDK).

Default route (from DB on startup): `aws-hosted/deepseek-coder-v2`.

---

## 8. Schema Translation

**Status**: Implemented in `aws_connectors.ts`.

### Anthropic → OpenAI (`translateAnthropicToOpenAI`)
- Flattens `content` arrays to plain text (extracts `type === 'text'` blocks only)
- Injects `system` prompt as a leading `{ role: 'system', content: '...' }` message
- Maps `assistant`/`user` roles unchanged

### OpenAI → Anthropic (`translateOpenAIToAnthropic`)
- Wraps `choices[0].message.content` in `{ type: 'message', content: [{ type: 'text', text: ... }] }`
- Sets `stop_reason: 'end_turn'`
- Maps `usage.prompt_tokens` / `completion_tokens` to `input_tokens` / `output_tokens`

### Schema Capabilities & Gaps
- **Tools Parameter Forwarding**: Natively supported. The `tools` and `tool_choice` arrays are fully forwarded across the Bedrock Native and Mantle Anthropic provider lanes to support agentic execution loops without client-side lockups.
- `tool_use` and `tool_result` translation: Tool contents are preserved for Bedrock/Mantle Anthropic lanes. For translated OpenAI OSS lanes, tool arrays are converted where supported.
- Image blocks (`type: 'image'`) are dropped in v1.
- Streaming (`stream: true`) is buffered: OpenAI/Bedrock streaming streams are consolidated and returned as unified JSON responses to the client.

---

## 9. Billing Isolation

| Request type | Credentials used | Billed to |
|---|---|---|
| Upstream pass-through (Claude models) | Original `x-api-key` from Claude Code CLI header | Personal Anthropic subscription |
| EKS vLLM routes | `AWS_BEARER_TOKEN_BEDROCK` (env var) | Enterprise AWS |
| Bedrock native SDK routes | `fromNodeProviderChain()` (AWS profile/IAM) | Enterprise AWS |
| Bedrock Mantle Anthropic routes | `AWS_BEARER_TOKEN_BEDROCK` as `x-api-key` | Enterprise AWS |
| Bedrock Mantle OSS routes | `AWS_BEARER_TOKEN_BEDROCK` as `Authorization: Bearer` | Enterprise AWS |

---

## 10. Admin Dashboard

Available at `http://localhost:8080/admin/dashboard`.

Current capabilities:
- Per-Lane Economics & Developer Trust Metrics: Displays all registered model statistics dynamically, sorted descending by tasks routed. Supports default top-10 limit layout with user-toggle expansion.
- Governed Traffic Explorer: Logs all queries with execution latency, status codes, and transition routing paths (e.g. `claude-sonnet-4-6 → mantle/deepseek-v3.2`).
- Route selector widget: Sets `activeRoute` and `activeMode` in the database.
- Policy manager: Real-time UI to manage pattern matchers and block/warn enforcement rules.
- CISO Report Export: Dynamic compliance document generation at `/admin/reports/approval`.

---

## 11. Acceptance Criteria

### AC-1: Upstream pass-through (personal key isolation)
- Send any request via Claude Code CLI
- Gateway routes it upstream to `api.anthropic.com`
- Dashboard log shows `upstream` dispatch, NOT `AWS_BEARER_TOKEN_BEDROCK` in outbound headers
- Personal Anthropic API usage dashboard reflects the call

### AC-2: Cheap route — DeepSeek
- Send prompt: `"write a python function that reverses a string"`
- No devops keywords present; no escalation triggers
- Dashboard shows route: `aws-hosted/deepseek-coder-v2`, reason: `standard_task_cheap_route`
- Response is valid, coherent code

### AC-3: Cheap route — Qwen
- Send prompt: `"write a Dockerfile to run a Node application"`
- Keyword `docker` fires Qwen classifier
- Dashboard shows route: `aws-hosted/qwen-coder-32b`, reason: `cheap_route_qwen_coder_spec`
- Response is valid Dockerfile

### AC-4: Escalation — sensitive context
- Send prompt: `"help me with our auth credentials rotation script"`
- Keywords `auth`, `credentials` fire `sensitive_context_escalation`
- Dashboard shows route: `bedrock/claude-3-5-sonnet`

### AC-5: Escalation — retry
- First two calls on `aws-hosted/*` return error or empty response (simulated)
- Third call escalates to `bedrock/claude-3-5-sonnet`, reason: `cheap_route_retry_escalation`

### AC-6: EKS fallback (Rule D)
- Bring EKS vLLM endpoint offline (or set `VLLM_URL` to an invalid address)
- Send a Qwen-classified prompt
- Gateway falls back to `mantle/qwen3-coder-next`, reason: `oss_route_unhealthy_fallback`
- Non-Qwen cheap route falls back to `mantle/deepseek-v3.2`

### AC-7: Schema translation round-trip
- Route a multi-turn coding conversation to `aws-hosted/deepseek-coder-v2`
- Response arrives back at Claude Code CLI in valid Anthropic messages format
- Claude Code renders the response without errors

### AC-8: Billing credential isolation
- In gateway server logs, confirm that no Anthropic `x-api-key` value appears in requests dispatched to `aws-hosted/*`, `mantle/*`, or `bedrock/*` routes
- Confirm that `AWS_BEARER_TOKEN_BEDROCK` never appears in requests forwarded to `api.anthropic.com`

---

## 12. Open Questions / Next Steps

| # | Question | Owner | Priority |
|---|---|---|---|
| 1 | Tool-use translation: should tool calls routed to OSS models be blocked at the classifier, or silently stripped? | CR | High |
| 2 | Streaming support: buffer-and-translate is acceptable for v1, but adds latency. When is streaming parity needed? | CR | Medium |
| 3 | Classifier boundary prompts (e.g. "explain this Dockerfile"): add noun-form devops keywords alongside verb-form? | CR | Low |
| 4 | Dashboard auth: currently unauthenticated on localhost. Acceptable for local-only; needs a token if ever network-exposed. | CR | Low |
| 5 | `mantle/claude-sonnet-4-6` offline status: confirm whether this is a permanent gap or pending provisioning. | CR | Low |

---

## 13. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_BASE_URL` | Yes (Claude Code) | Set to `http://localhost:8081` to redirect CLI egress to gateway |
| `PORT` | No (default: 8081) | Gateway listen port |
| `UPSTREAM_URL` | No (default: `https://api.anthropic.com`) | Fallback upstream for pass-through routes |
| `AWS_BEARER_TOKEN_BEDROCK` | Yes (enterprise routes) | Mantle/Bedrock bearer token |
| `BEDROCK_MANTLE_URL` | Yes (Mantle routes) | Mantle base URL (e.g. `https://bedrock-mantle.us-east-1.api.aws`) |
| `VLLM_URL` | Yes (EKS routes) | Self-hosted vLLM endpoint |
| `BEDROCK_ENDPOINT` | No | PrivateLink VPC interface endpoint override |
| `AWS_REGION` | No (default: us-east-1) | AWS region for Bedrock SDK |
| `REPO_PATH` | No (default: cwd) | Workspace path used by policy engine |
| `MOCK_LOCAL` | No | Set `true` to stub local/ route responses without Ollama |

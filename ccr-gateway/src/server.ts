import fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { request } from 'undici';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { PolicyEngine } from './policy.js';
import {
  initDatabase,
  logRequestEvent,
  logPolicyHit,
  logSpendRecord,
  logFeedback,
  getPolicies,
  savePolicy,
  deletePolicy,
  incrementPolicyHits,
  getRouteConfig,
  saveRouteConfig
} from './db.js';
import { UNIFIED_MODEL_REGISTRY } from './model_registry.js';
import { checkVllmHealth, checkVpnHealth, invokeBedrockModel, invokeVllmModel, invokeMantleAnthropicModel, invokeMantleOssModel, translateOpenAIToAnthropic } from './aws_connectors.js';
import { renderDashboard } from './dashboard.js';
import { renderCisoReport } from './ciso_report.js';

dotenv.config();

const server = fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
    },
  },
});

// ── Configuration ─────────────────────────────────────────────────────────────

const UPSTREAM_URL = process.env.UPSTREAM_URL || 'https://api.anthropic.com';
const PORT         = parseInt(process.env.PORT || '8081', 10);
const REPO_PATH    = process.env.REPO_PATH || process.cwd();

// When true, local/ routes return a mock response instead of hitting Ollama.
// Enabled via MOCK_LOCAL=true env var — separates the mock escape hatch from
// route selection so real Ollama routing works once OLLAMA_URL is configured.
const MOCK_LOCAL   = process.env.MOCK_LOCAL === 'true';

// Subscription users: escalation routes back to api.anthropic.com (uses included quota, $0 marginal cost).
// Never route escalations to Bedrock Sonnet — that double-bills on top of the subscription.
const ESCALATION_FALLBACK_ROUTE = 'anthropic/native';

// Token costs keyed by model/route ID — single source of truth, no magic numbers in handlers.
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5':              { input: 0.0000008,  output: 0.000004  },
  'claude-sonnet-4-5':             { input: 0.000003,   output: 0.000015  },
  'claude-sonnet-4-6':             { input: 0.000003,   output: 0.000015  },
  'claude-opus-4-8':               { input: 0.000015,   output: 0.000075  },
  'aws-hosted/deepseek-coder-v2':  { input: 0.00000014, output: 0.00000014 },
  'aws-hosted/qwen-coder-32b':     { input: 0.00000018, output: 0.00000018 },
  'aws-hosted/glm-coder-v2':       { input: 0.00000020, output: 0.00000020 },
  // Native Anthropic subscription — $0 marginal (quota included in subscription)
  'anthropic/native':              { input: 0,          output: 0           },
  'bedrock/claude-3-5-sonnet':     { input: 0.000003,   output: 0.000015  },
  // Bedrock Mantle — Anthropic
  'mantle/claude-opus-4-8':        { input: 0.000015,   output: 0.000075  },
  'mantle/claude-sonnet-4-6':      { input: 0.000003,   output: 0.000015  },
  'mantle/claude-haiku-4-5':       { input: 0.0000008,  output: 0.000004  },
  // Bedrock Mantle — OSS
  'mantle/gpt-5.5':                { input: 0.000005,   output: 0.000025  },
  'mantle/gpt-oss-20b':            { input: 0.000001,   output: 0.000005  },
  'mantle/gpt-oss-120b':           { input: 0.000003,   output: 0.000015  },
  'mantle/qwen3-coder-next':       { input: 0.00000008, output: 0.00000008 },
  'mantle/qwen3-coder-480b':       { input: 0.00000020, output: 0.00000020 },
  'mantle/devstral-2-123b':        { input: 0.00000015, output: 0.00000015 },
  'mantle/kimi-k2-thinking':       { input: 0.000002,   output: 0.000010   },
  'mantle/mistral-large-3-675b':   { input: 0.000004,   output: 0.000012   },
  'mantle/deepseek-v3.2':          { input: 0.0000001,  output: 0.0000001  },
};
const DEFAULT_TOKEN_COST   = { input: 0.000003, output: 0.000015 };
const ZERO_COST_PREFIXES   = ['local/', 'internal/', 'developer-local/'] as const;

// Escalate keywords & operations
const SENSITIVE_KEYWORDS   = ['billing', 'payment', 'auth', 'credentials', 'secrets'] as const;
const COMPLEX_OPERATIONS   = ['migration', 'database design', 'architecture', 'refactor whole'] as const;

// Validated sets — used to reject bad inputs at the API boundary (#2, #16).
const VALID_ROUTE_IDS  = new Set(UNIFIED_MODEL_REGISTRY.map(m => m.id));
const VALID_MODES      = new Set(['manual', 'suggested', 'auto']);
const VALID_OUTCOMES   = new Set(['kept', 'reworked', 'retried', 'abandoned']);
const VALID_RATINGS    = new Set(['thumb_up', 'thumb_down']);
const VALID_POLICY_MODES = ['monitor', 'warn', 'enforce', 'route'] as const;
const VALID_TYPES        = ['file_path', 'regex_pattern', 'ccrignore'] as const;
const VALID_SCOPES       = ['repo', 'global'] as const;

let isVllmHealthy = true;
let isVpnHealthy = true;

const policyEngine = new PolicyEngine({
  workspacePolicyEnabled: process.env.CCR_DISABLE_WORKSPACE_POLICY !== 'true',
});

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

server.addHook('preHandler', async (req, reply) => {
  if (req.url.startsWith('/admin')) {
    if (!ADMIN_TOKEN) return; // dev mode: no token = open
    if (req.headers['x-admin-token'] !== ADMIN_TOKEN) {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  }
});

// ── Health ────────────────────────────────────────────────────────────────────

server.get('/health', async () => ({ status: 'healthy', timestamp: new Date().toISOString() }));
server.get('/ready',  async () => ({ status: 'ready' }));

// ── Admin dashboard ───────────────────────────────────────────────────────────

server.get('/admin/dashboard', async (req, reply) => {
  reply.header('content-type', 'text/html');
  return renderDashboard(isVllmHealthy, isVpnHealthy);
});

server.get('/admin/reports/approval', async (req, reply) => {
  reply.header('content-type', 'text/html');
  return renderCisoReport();
});

// ── Model registry ────────────────────────────────────────────────────────────

server.get('/admin/api/registry', async () => UNIFIED_MODEL_REGISTRY);

// ── Request state ring buffer (#4) ───────────────────────────────────────────
// Replaces the module-level `lastRouteReason / lastRouteForced` mutable globals.
// Concurrent requests update their own entry; the status endpoint reads the most
// recently completed one, avoiding cross-request state bleed.

interface RequestState {
  correlationId: string;
  reason:        string;
  forced:        boolean;
  timestamp:     number;
  chosenRoute:   string;
}

const REQUEST_STATE_MAX  = 10;
const requestStateBuffer: RequestState[] = [];

function recordRequestState(state: RequestState): void {
  requestStateBuffer.push(state);
  if (requestStateBuffer.length > REQUEST_STATE_MAX) requestStateBuffer.shift();
}

function getLatestRequestState(): RequestState | null {
  return requestStateBuffer.length > 0
    ? requestStateBuffer[requestStateBuffer.length - 1]
    : null;
}

// ── Route config ──────────────────────────────────────────────────────────────

server.get('/admin/api/route', async () => {
  const config = await getRouteConfig();
  const latest = getLatestRequestState();
  return {
    activeRoute:       config.activeRoute,
    activeMode:        config.activeMode,
    lastRouteReason:   latest?.reason        ?? 'manual_user_override',
    lastRouteForced:   latest?.forced        ?? false,
    lastChosenRoute:   latest?.chosenRoute   ?? config.activeRoute,
    lastCorrelationId: latest?.correlationId ?? null,
  };
});

// Validates both fields before writing to DB (#2).
server.post('/admin/api/route', async (req, reply) => {
  const body = req.body as any;
  if (body.activeMode !== undefined && !VALID_MODES.has(body.activeMode)) {
    reply.status(400).send({ error: `Invalid activeMode. Valid values: ${[...VALID_MODES].join(', ')}` });
    return;
  }
  if (body.activeRoute !== undefined && !VALID_ROUTE_IDS.has(body.activeRoute)) {
    reply.status(400).send({ error: `Unknown activeRoute "${body.activeRoute}". See /admin/api/registry for valid IDs.` });
    return;
  }
  await saveRouteConfig({ activeRoute: body.activeRoute, activeMode: body.activeMode });
  return { success: true };
});

// ── Feedback (#1, #16) ────────────────────────────────────────────────────────
// Moved from read-modify-write on ccr_telemetry.json (race condition) to an
// append-only DB write. Inputs validated against known outcome/rating sets.

server.post('/admin/api/feedback', async (req, reply) => {
  const body = req.body as any;
  if (!body.correlationId || !body.outcome || !body.rating) {
    reply.status(400).send({ error: 'Missing required fields: correlationId, outcome, rating' });
    return;
  }
  if (!VALID_OUTCOMES.has(body.outcome)) {
    reply.status(400).send({ error: `Invalid outcome. Valid values: ${[...VALID_OUTCOMES].join(', ')}` });
    return;
  }
  if (!VALID_RATINGS.has(body.rating)) {
    reply.status(400).send({ error: `Invalid rating. Valid values: ${[...VALID_RATINGS].join(', ')}` });
    return;
  }
  try {
    await logFeedback(body.correlationId, body.outcome, body.rating, body.comments || '');
    return { success: true };
  } catch (err: any) {
    reply.status(500).send({ error: err.message });
  }
});

// ── Policy CRUD ───────────────────────────────────────────────────────────────

server.get('/admin/api/policies', async () => getPolicies());

server.post('/admin/api/policies', async (req, reply) => {
  const body = req.body as any;
  if (!body.name || !body.pattern || !body.mode || !body.type) {
    reply.status(400).send({ error: 'Missing required fields (name, pattern, mode, type)' });
    return;
  }
  if (!VALID_POLICY_MODES.includes(body.mode) || !VALID_TYPES.includes(body.type)) {
    reply.status(400).send({ error: 'Invalid mode or type value' });
    return;
  }
  if (body.scope && !VALID_SCOPES.includes(body.scope)) {
    reply.status(400).send({ error: 'Invalid scope value' });
    return;
  }
  if (body.forcedRoute && !VALID_ROUTE_IDS.has(body.forcedRoute)) {
    reply.status(400).send({ error: `Unknown forcedRoute "${body.forcedRoute}". See /admin/api/registry for valid IDs.` });
    return;
  }
  const newRule = {
    id: `rule-${Date.now()}`,
    name: body.name,
    pattern: body.pattern,
    mode: body.mode,
    type: body.type,
    description: body.description || '',
    scope: body.scope || 'repo',
    forcedRoute: body.forcedRoute,
  };
  await savePolicy(newRule);
  return newRule;
});

server.put('/admin/api/policies/:id', async (req, reply) => {
  const { id } = req.params as any;
  const body = req.body as any;
  const existingRules = await getPolicies();
  const rule = existingRules.find(r => r.id === id);
  if (!rule) {
    reply.status(404).send({ error: 'Policy rule not found' });
    return;
  }
  if (!VALID_POLICY_MODES.includes(body.mode) || !VALID_TYPES.includes(body.type)) {
    reply.status(400).send({ error: 'Invalid mode or type value' });
    return;
  }
  if (body.scope && !VALID_SCOPES.includes(body.scope)) {
    reply.status(400).send({ error: 'Invalid scope value' });
    return;
  }
  if (body.forcedRoute && !VALID_ROUTE_IDS.has(body.forcedRoute)) {
    reply.status(400).send({ error: `Unknown forcedRoute "${body.forcedRoute}". See /admin/api/registry for valid IDs.` });
    return;
  }
  const updatedRule = {
    ...rule,
    name:        body.name        !== undefined ? body.name        : rule.name,
    pattern:     body.pattern     !== undefined ? body.pattern     : rule.pattern,
    mode:        body.mode        !== undefined ? body.mode        : rule.mode,
    type:        body.type        !== undefined ? body.type        : rule.type,
    description: body.description !== undefined ? body.description : rule.description,
    scope:       body.scope       !== undefined ? body.scope       : rule.scope,
  };
  await savePolicy(updatedRule);
  return updatedRule;
});

server.delete('/admin/api/policies/:id', async (req, reply) => {
  const { id } = req.params as any;
  await deletePolicy(id);
  return { success: true };
});

// ── Retry tracker (single-user) (#3, #9) ─────────────────────────────────────
// Renamed promptHash → promptText (field stored full text, not a hash).
// Scoped to single-user local gateway — not safe for multi-tenant deployments.

interface LastRequestTracker {
  timestamp:     number;
  promptText:    string;
  routeUsed:     string;
  retryCount:    number;
  correlationId: string;
}

let lastRequestCache: LastRequestTracker | null = null;

function isTaskRetry(newPrompt: string, lastReq: LastRequestTracker | null): boolean {
  if (!lastReq) return false;
  const timeDiff = (Date.now() - lastReq.timestamp) / 1000;
  if (timeDiff > 180) return false;

  const words1 = new Set(newPrompt.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(lastReq.promptText.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  let intersection = 0;
  for (const w of words1) {
    if (words2.has(w)) intersection++;
  }
  const union      = new Set([...words1, ...words2]).size;
  const similarity = union > 0 ? intersection / union : 0;

  // Raised similarity threshold to 0.6 (was 0.3) to reduce false-positive escalations.
  // Time-only branch tightened to 10 s (was 30 s) and now also requires minimum similarity.
  return similarity > 0.6 || (similarity > 0.3 && timeDiff < 10);
}

// ── Cost & telemetry helpers (#5, #6) ─────────────────────────────────────────
// Single implementations — called from mock, streaming, and non-streaming paths.

function computeActualCost(routeId: string, inputTokens: number, outputTokens: number): number {
  if (ZERO_COST_PREFIXES.some(prefix => routeId.startsWith(prefix))) return 0;
  const costs = TOKEN_COSTS[routeId] ?? DEFAULT_TOKEN_COST;
  return (inputTokens * costs.input) + (outputTokens * costs.output);
}

interface TelemetryParams {
  correlationId:   string;
  inputTokens:     number;
  outputTokens:    number;
  chosenRouteId:   string;
  activeMode:      string;
  suggestedRouteId: string;
  isOverride:      boolean;
  promptLength:    number;
  routingReason:   string;
}

async function recordRequestTelemetry(params: TelemetryParams): Promise<void> {
  const { correlationId, inputTokens, outputTokens, chosenRouteId,
          activeMode, suggestedRouteId, isOverride, promptLength, routingReason } = params;

  const baselineCosts = TOKEN_COSTS['claude-sonnet-4-5'] ?? DEFAULT_TOKEN_COST;
  const baselineCost  = (inputTokens * baselineCosts.input) + (outputTokens * baselineCosts.output);
  const actualCost    = computeActualCost(chosenRouteId, inputTokens, outputTokens);
  // Subscription routes ($0 marginal) shift cost from variable to fixed quota — not a real saving.
  const delta         = chosenRouteId === 'anthropic/native' ? 0 : baselineCost - actualCost;

  await logSpendRecord(correlationId, inputTokens, outputTokens, actualCost, baselineCost, delta);
  await logTelemetryEvent({
    eventId:        uuidv4(),
    correlationId,
    timestamp:      new Date().toISOString(),
    routingMode:    activeMode,
    suggestedRoute: suggestedRouteId,
    chosenRoute:    chosenRouteId,
    override:       isOverride,
    inputTokens,
    outputTokens,
    actualCost,
    baselineCost,
    delta,
    promptLength,
    reason:         routingReason,
  });
}

// ── Request body interfaces ───────────────────────────────────────────────────

interface AnthropicMessageBody {
  model?:         string;
  messages?:      Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>;
  system?:        string;
  max_tokens?:    number;
  temperature?:   number;
  top_p?:         number;
  top_k?:         number;
  stop_sequences?: string[];
  stream?:        boolean;
  tools?:         unknown[];
  tool_choice?:   unknown;
}

interface OpenAIChatBody {
  model?:       string;
  messages?:    Array<{ role: string; content: string }>;
  max_tokens?:  number;
  temperature?: number;
  stream?:      boolean;
}

interface RouteBody {
  activeRoute?: string;
  activeMode?:  string;
}

interface FeedbackBody {
  correlationId?: string;
  outcome?:       string;
  rating?:        string;
  comments?:      string;
}

interface PolicyBody {
  name?:         string;
  pattern?:      string;
  mode?:         string;
  type?:         string;
  description?:  string;
  scope?:        string;
  forcedRoute?:  string;
}

// ── Task classifier (#15) ─────────────────────────────────────────────────────

const QWEN_TASK_INDICATORS = [
  'html', 'css', 'yaml', 'json', 'markdown', 'config', 'setup', 
  'docker', 'bash', 'shell', 'bootstrap', 'yaml', 'yml', 'ci/cd', 'github actions'
];

function classifyTask(promptText: string): { suggestedRoute: string; reason: string } {
  const lower = promptText.toLowerCase();
  
  // Choose Qwen for DevOps, layout, boilerplate, and configs
  const isQwenTask = QWEN_TASK_INDICATORS.some(kw => lower.includes(kw));
  if (isQwenTask) {
    return {
      suggestedRoute: 'aws-hosted/qwen-coder-32b',
      reason:         'cheap_route_qwen_coder_spec'
    };
  }

  // Default cheap coding route (DeepSeek)
  return { suggestedRoute: 'aws-hosted/deepseek-coder-v2', reason: 'standard_task_cheap_route' };
}

// ── Route selection helper ────────────────────────────────────────────────────

interface SelectRouteParams {
  activeRouteId:     string;
  activeMode:        string;
  promptText:        string;
  currentRetryCount: number;
  forcedRoute?:      string;
  triggeredRules:    string[];
}

interface SelectRouteResult {
  suggestedRouteId: string;
  routingReason:    string;
  finalRouteId:     string;
  fallbackActive:   boolean;
}

function selectRoute(params: SelectRouteParams): SelectRouteResult {
  const { activeRouteId, activeMode, promptText, currentRetryCount, forcedRoute, triggeredRules } = params;

  let suggestedRouteId = activeRouteId;
  let routingReason    = 'manual_user_override';

  if (activeMode === 'suggested' || activeMode === 'auto') {
    if (currentRetryCount >= 2) {
      suggestedRouteId = ESCALATION_FALLBACK_ROUTE;
      routingReason    = 'cheap_route_retry_escalation';
    } else if (forcedRoute) {
      suggestedRouteId = forcedRoute;
      if (triggeredRules.includes('sensitive-workspace-forced-premium')) {
        routingReason  = 'sensitive-workspace-forced-premium';
      } else if (triggeredRules.includes('workspace-forced-local')) {
        routingReason  = 'workspace_forced_policy';
      } else {
        routingReason  = 'policy_forced_local';
      }
    } else {
      const classification = classifyTask(promptText);
      suggestedRouteId = classification.suggestedRoute;
      routingReason    = classification.reason;
    }
  } else {
    // Manual mode — policy can still override.
    if (forcedRoute) {
      suggestedRouteId = forcedRoute;
      if (triggeredRules.includes('sensitive-workspace-forced-premium')) {
        routingReason  = 'sensitive-workspace-forced-premium';
      } else if (triggeredRules.includes('workspace-forced-local')) {
        routingReason  = 'workspace_forced_policy';
      } else {
        routingReason  = 'policy_forced_local';
      }
    }
  }

  // Context ceiling & keyword escalations — only in suggested/auto mode.
  if (activeMode === 'suggested' || activeMode === 'auto') {
    if (promptText.length > 120000 && suggestedRouteId.startsWith('aws-hosted/')) {
      suggestedRouteId = ESCALATION_FALLBACK_ROUTE;
      routingReason    = 'context_window_ceiling_escalation';
    }

    const lowerPrompt      = promptText.toLowerCase();
    const matchesSensitive = SENSITIVE_KEYWORDS.some(kw => lowerPrompt.includes(kw));
    const matchesComplex   = COMPLEX_OPERATIONS.some(kw => lowerPrompt.includes(kw));

    if (matchesSensitive && suggestedRouteId.startsWith('aws-hosted/')) {
      suggestedRouteId = ESCALATION_FALLBACK_ROUTE;
      routingReason    = 'sensitive_context_escalation';
    } else if (matchesComplex && suggestedRouteId.startsWith('aws-hosted/')) {
      suggestedRouteId = ESCALATION_FALLBACK_ROUTE;
      routingReason    = 'complexity_task_escalation';
    }
  }

  // EKS health fallback — redirect aws-hosted if vLLM is unhealthy.
  let finalRouteId   = suggestedRouteId;
  let fallbackActive = false;
  if (finalRouteId.startsWith('aws-hosted/') && !isVllmHealthy) {
    const entry      = UNIFIED_MODEL_REGISTRY.find(m => m.id === finalRouteId);
    finalRouteId     = entry?.fallbackModelId || ESCALATION_FALLBACK_ROUTE;
    routingReason    = 'oss_route_unhealthy_fallback';
    fallbackActive   = true;
  }

  return { suggestedRouteId, routingReason, finalRouteId, fallbackActive };
}

// ── Primary Gateway: Anthropic Messages proxy ─────────────────────────────────

const messagesHandler = async (req: FastifyRequest<{ Body: AnthropicMessageBody }>, reply: FastifyReply) => {
  const correlationId = uuidv4();
  const startTime     = process.hrtime();

  const { 'x-api-key': _key, authorization: _auth, ...safeHeaders } = req.headers;
  server.log.info({ correlationId, headers: safeHeaders }, 'Incoming request headers');

  const apiKey          = (req.headers['x-api-key'] || req.headers['authorization']) as string;
  const anthropicVersion = req.headers['anthropic-version'] as string;

  const reqBody     = req.body;
  const targetModel = reqBody?.model || 'unknown';

  // Extract prompt text for task classification and retry detection.
  let promptText = '';
  if (reqBody?.messages && Array.isArray(reqBody.messages)) {
    for (const msg of reqBody.messages) {
      if (typeof msg.content === 'string') {
        promptText += msg.content + '\n';
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') promptText += block.text + '\n';
        }
      }
    }
  }

  // 1. Policy evaluation
  const activeRules  = await getPolicies();
  const requestRepoPath = req.headers['x-ccr-repo-path'] as string || REPO_PATH;
  const policyResult = policyEngine.evaluateRequest(reqBody, requestRepoPath, activeRules);

  if (!policyResult.allowed) {
    const endTime   = process.hrtime(startTime);
    const latencyMs = Math.round(endTime[0] * 1000 + endTime[1] / 1000000);
    server.log.warn({ correlationId, triggeredRules: policyResult.triggeredRules, latencyMs },
      `Request BLOCKED by ccr Policy: ${policyResult.blockedReason}`);
    await logRequestEvent(correlationId, targetModel, 'none', 400, latencyMs);
    for (const ruleId of policyResult.triggeredRules) {
      await logPolicyHit(correlationId, ruleId, 'block', policyResult.blockedReason);
      await incrementPolicyHits(ruleId);
    }
    await logSpendRecord(correlationId, 0, 0, 0, 0.005, 0.005);
    reply.status(400).send({
      error: { type: 'invalid_request_error', message: `ccr Policy Blocked: ${policyResult.blockedReason}` },
    });
    return;
  }

  // 2. Route selection
  const routeConfig  = await getRouteConfig();
  const activeRouteId = routeConfig.activeRoute;
  const activeMode    = routeConfig.activeMode;

  // Retry detection: only runs for routes with a cost tag in the registry (#18).
  const routeEntry         = UNIFIED_MODEL_REGISTRY.find(m => m.id === activeRouteId);
  const isOnCheapRoute     = routeEntry?.policyTags.includes('low-cost') ?? false;
  let currentRetryCount    = 0;
  if (lastRequestCache && isOnCheapRoute) {
    if (isTaskRetry(promptText, lastRequestCache)) {
      currentRetryCount = lastRequestCache.retryCount + 1;
    }
  }

  const { suggestedRouteId, routingReason, finalRouteId, fallbackActive } = selectRoute({
    activeRouteId,
    activeMode,
    promptText,
    currentRetryCount,
    forcedRoute:    policyResult.forcedRoute,
    triggeredRules: policyResult.triggeredRules,
  });

  const chosenRouteId = finalRouteId;
  const isOverride    = activeMode === 'suggested' && chosenRouteId !== activeRouteId;

  // Write to ring buffer — no mutable globals (#4).
  recordRequestState({
    correlationId,
    reason:    routingReason,
    forced:    routingReason.includes('forced') || routingReason.includes('escalation') || fallbackActive,
    timestamp: Date.now(),
    chosenRoute: chosenRouteId,
  });

  if (policyResult.action === 'warn') {
    server.log.warn({ correlationId, triggeredRules: policyResult.triggeredRules },
      `Policy Warning: ${policyResult.warnings.join(', ')}`);
    for (const ruleId of policyResult.triggeredRules) {
      await logPolicyHit(correlationId, ruleId, 'warn');
      await incrementPolicyHits(ruleId);
    }
  }

  // 3. Mock mode (#7): explicit header OR env-gated local-route mock.
  // Local routes only mock when MOCK_LOCAL=true — real Ollama routing is unaffected otherwise.
  const mockMode = req.headers['x-mock'] === 'true' || (MOCK_LOCAL && chosenRouteId.startsWith('local/'));

  if (mockMode) {
    const mockResponseText = JSON.stringify({
      id:      `msg-${uuidv4()}`,
      type:    'message',
      role:    'assistant',
      content: [{ type: 'text', text: `[ccr Pilot Mock] Route: ${chosenRouteId}. Reason: ${routingReason}` }],
      model:   chosenRouteId,
      usage:   { input_tokens: 150, output_tokens: 80 },
    });

    const endTime   = process.hrtime(startTime);
    const latencyMs = Math.round(endTime[0] * 1000 + endTime[1] / 1000000);
    await logRequestEvent(correlationId, targetModel, 'mock', 200, latencyMs);
    await recordRequestTelemetry({
      correlationId, inputTokens: 150, outputTokens: 80,
      chosenRouteId, activeMode, suggestedRouteId, isOverride,
      promptLength: promptText.length, routingReason,
    });

    lastRequestCache = { timestamp: Date.now(), promptText, routeUsed: chosenRouteId,
                         retryCount: currentRetryCount, correlationId };

    reply.header('x-correlation-id', correlationId);
    reply.header('x-ccr-suggested-route', suggestedRouteId);
    reply.header('x-ccr-chosen-route', chosenRouteId);
    reply.header('x-ccr-reason', routingReason);
    reply.header('content-type', 'application/json');
    reply.status(200).send(mockResponseText);
    return;
  }

  // 3a. AWS vLLM proxy connector
  if (chosenRouteId.startsWith('aws-hosted/')) {
    const vllmResponse = await invokeVllmModel(chosenRouteId, reqBody);
    
    let inputTokens = 0;
    let outputTokens = 0;
    let responseBodyText = vllmResponse.body;

    if (vllmResponse.statusCode === 200) {
      try {
        const parsed = JSON.parse(vllmResponse.body);
        inputTokens = parsed.usage?.prompt_tokens || 0;
        outputTokens = parsed.usage?.completion_tokens || 0;
        
        // Translate OpenAI response to Anthropic message format
        const translated = translateOpenAIToAnthropic(parsed, chosenRouteId);
        responseBodyText = JSON.stringify(translated);
      } catch (e: any) {
        server.log.error({ correlationId, error: e.message }, 'Failed to parse or translate OpenAI response');
      }
    }

    // Log request execution event
    const endTime = process.hrtime(startTime);
    const latencyMs = Math.round(endTime[0] * 1000 + endTime[1] / 1000000);
    await logRequestEvent(correlationId, targetModel, 'aws-hosted', vllmResponse.statusCode, latencyMs);

    // Record spend and telemetry logs
    await recordRequestTelemetry({
      correlationId,
      inputTokens,
      outputTokens,
      chosenRouteId,
      activeMode,
      suggestedRouteId,
      isOverride,
      promptLength: promptText.length,
      routingReason
    });

    // Cache request state
    lastRequestCache = {
      timestamp: Date.now(),
      promptText,
      routeUsed: chosenRouteId,
      retryCount: currentRetryCount,
      correlationId
    };

    if (fallbackActive) {
      reply.header('x-ccr-fallback', 'true');
    }
    reply.header('x-ccr-suggested-route', suggestedRouteId);
    reply.header('x-ccr-chosen-route', chosenRouteId);
    reply.header('x-ccr-reason', routingReason);
    reply.header('x-correlation-id', correlationId);
    reply.header('content-type', 'application/json');
    reply.status(vllmResponse.statusCode).send(responseBodyText);
    return;
  }

  // 3b. Bedrock Mantle proxy connector
  if (chosenRouteId.startsWith('mantle/')) {
    const registryEntry = UNIFIED_MODEL_REGISTRY.find(m => m.id === chosenRouteId);
    const mantleModelId = registryEntry?.mantleModelId;

    if (!mantleModelId) {
      reply.status(500).send({ error: { type: 'api_error', message: `No mantleModelId mapped for route "${chosenRouteId}".` } });
      return;
    }

    const isAnthropicModel = registryEntry?.provider === 'anthropic';
    let mantleStatusCode: number = 500;
    let mantleBody: string = JSON.stringify({ error: { type: 'api_error', message: 'No response body received from Mantle.' } });
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      if (isAnthropicModel) {
        let res;
        if (registryEntry?.useBedrockNative) {
          server.log.info({ correlationId, mantleModelId }, 'useBedrockNative: routing via native Bedrock SDK client.');
          const sonnet46Entry = UNIFIED_MODEL_REGISTRY.find(m => m.id === 'bedrock/claude-sonnet-4-6');
          const bedrockRes = await invokeBedrockModel('bedrock/claude-sonnet-4-6', reqBody, sonnet46Entry?.bedrockModelId);
          res = {
            statusCode: bedrockRes.statusCode,
            body: bedrockRes.body
          };
        } else {
          res = await invokeMantleAnthropicModel(mantleModelId, reqBody);
        }
        mantleStatusCode = res.statusCode;
        mantleBody       = res.body;
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(res.body);
            inputTokens  = parsed.usage?.input_tokens  || 0;
            outputTokens = parsed.usage?.output_tokens || 0;
          } catch (e: any) {
            server.log.warn({ correlationId, error: e.message }, 'Failed to parse Mantle token usage');
          }
        }
      } else {
        const res = await invokeMantleOssModel(mantleModelId, reqBody);
        mantleStatusCode = res.statusCode;
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(res.body);
            inputTokens  = parsed.usage?.prompt_tokens     || 0;
            outputTokens = parsed.usage?.completion_tokens || 0;
            const translated = translateOpenAIToAnthropic(parsed, chosenRouteId);
            mantleBody = JSON.stringify(translated);
          } catch {
            mantleBody = res.body;
          }
        } else {
          mantleBody = res.body;
        }
      }
    } catch (err: any) {
      server.log.error({ correlationId, error: err.message }, 'Mantle connector threw unexpectedly');
      mantleStatusCode = 503;
      mantleBody = JSON.stringify({ error: { type: 'api_error', message: `Mantle connector error: ${err.message}` } });
    }

    const endTime   = process.hrtime(startTime);
    const latencyMs = Math.round(endTime[0] * 1000 + endTime[1] / 1000000);
    await logRequestEvent(correlationId, targetModel, 'mantle', mantleStatusCode, latencyMs);
    await recordRequestTelemetry({ correlationId, inputTokens, outputTokens, chosenRouteId,
      activeMode, suggestedRouteId, isOverride, promptLength: promptText.length, routingReason });
    lastRequestCache = { timestamp: Date.now(), promptText, routeUsed: chosenRouteId,
      retryCount: currentRetryCount, correlationId };

    if (fallbackActive) reply.header('x-ccr-fallback', 'true');
    reply.header('x-ccr-suggested-route', suggestedRouteId);
    reply.header('x-ccr-chosen-route', chosenRouteId);
    reply.header('x-ccr-reason', routingReason);
    reply.header('x-ccr-mantle-model', mantleModelId);
    reply.header('x-correlation-id', correlationId);
    reply.header('content-type', 'application/json');
    reply.status(mantleStatusCode).send(mantleBody);
    return;
  }

  // 3c. Native Anthropic upstream — used for escalations on subscription plans.
  // Forwards the original auth headers so the request uses the user's subscription quota.
  // Cost = $0 marginal (covered by subscription). No AWS charges incurred.
  if (chosenRouteId === 'anthropic/native') {
    if (!apiKey) {
      reply.status(401).send({ error: { type: 'authentication_error', message: 'No auth credentials available for native Anthropic escalation.' } });
      return;
    }
    const forwardHeaders: Record<string, string> = {
      'content-type':      'application/json',
      'anthropic-version': (req.headers['anthropic-version'] as string) || '2023-06-01',
    };
    if (req.headers['x-api-key'])                                 forwardHeaders['x-api-key']         = req.headers['x-api-key'] as string;
    else if (req.headers['authorization'])                        forwardHeaders['authorization']      = req.headers['authorization'] as string;
    if (req.headers['anthropic-beta'])                            forwardHeaders['anthropic-beta']     = req.headers['anthropic-beta'] as string;
    if (req.headers['anthropic-dangerous-direct-browser-access']) forwardHeaders['anthropic-dangerous-direct-browser-access'] = req.headers['anthropic-dangerous-direct-browser-access'] as string;

    const nativeRes  = await request(`${UPSTREAM_URL}/v1/messages`, {
      method: 'POST', headers: forwardHeaders, body: JSON.stringify(reqBody),
    });
    const nativeContentType = (nativeRes.headers['content-type'] as string) || 'application/json';
    const isStreaming        = nativeContentType.includes('text/event-stream');

    const endTime   = process.hrtime(startTime);
    const latencyMs = Math.round(endTime[0] * 1000 + endTime[1] / 1000000);
    await logRequestEvent(correlationId, targetModel, 'anthropic', nativeRes.statusCode, latencyMs);

    if (isStreaming) {
      let rawBuf = '';
      nativeRes.body.on('data', (chunk) => { rawBuf += chunk.toString(); });
      nativeRes.body.on('end', async () => {
        const iMatch = rawBuf.match(/"input_tokens"\s*:\s*(\d+)/);
        const oMatch = rawBuf.match(/"output_tokens"\s*:\s*(\d+)/);
        const it = iMatch ? parseInt(iMatch[1], 10) : 0;
        const ot = oMatch ? parseInt(oMatch[1], 10) : 0;
        await recordRequestTelemetry({ correlationId, inputTokens: it, outputTokens: ot,
          chosenRouteId, activeMode, suggestedRouteId, isOverride, promptLength: promptText.length, routingReason });
        lastRequestCache = { timestamp: Date.now(), promptText, routeUsed: chosenRouteId,
          retryCount: currentRetryCount, correlationId };
      });
    } else {
      const bodyText = await nativeRes.body.text();
      let it = 0, ot = 0;
      try { const p = JSON.parse(bodyText); it = p.usage?.input_tokens || 0; ot = p.usage?.output_tokens || 0; } catch {}
      await recordRequestTelemetry({ correlationId, inputTokens: it, outputTokens: ot,
        chosenRouteId, activeMode, suggestedRouteId, isOverride, promptLength: promptText.length, routingReason });
      lastRequestCache = { timestamp: Date.now(), promptText, routeUsed: chosenRouteId,
        retryCount: currentRetryCount, correlationId };
      reply.header('x-correlation-id', correlationId).header('x-ccr-chosen-route', chosenRouteId)
           .header('x-ccr-reason', routingReason).header('content-type', nativeContentType);
      reply.status(nativeRes.statusCode).send(bodyText);
      return;
    }

    reply.header('x-correlation-id', correlationId).header('x-ccr-chosen-route', chosenRouteId)
         .header('x-ccr-reason', routingReason).header('content-type', nativeContentType);
    reply.status(nativeRes.statusCode);
    reply.send(nativeRes.body);
    return;
  }

  // 3d. Amazon Bedrock Runtime proxy connector
  if (chosenRouteId.startsWith('bedrock/')) {
    const bedrockEntry = UNIFIED_MODEL_REGISTRY.find(m => m.id === chosenRouteId);
    const bedrockResponse = await invokeBedrockModel(chosenRouteId, reqBody, bedrockEntry?.bedrockModelId);
    
    let inputTokens = 0;
    let outputTokens = 0;

    if (bedrockResponse.statusCode === 200) {
      try {
        const parsed = JSON.parse(bedrockResponse.body);
        inputTokens = parsed.usage?.input_tokens || 0;
        outputTokens = parsed.usage?.output_tokens || 0;
      } catch (e: any) {
        server.log.warn({ correlationId, error: e.message }, 'Failed to parse Bedrock token usage');
      }
    }

    const endTime = process.hrtime(startTime);
    const latencyMs = Math.round(endTime[0] * 1000 + endTime[1] / 1000000);
    await logRequestEvent(correlationId, targetModel, 'bedrock', bedrockResponse.statusCode, latencyMs);

    await recordRequestTelemetry({
      correlationId,
      inputTokens,
      outputTokens,
      chosenRouteId,
      activeMode,
      suggestedRouteId,
      isOverride,
      promptLength: promptText.length,
      routingReason
    });

    lastRequestCache = {
      timestamp: Date.now(),
      promptText,
      routeUsed: chosenRouteId,
      retryCount: currentRetryCount,
      correlationId
    };

    if (fallbackActive) {
      reply.header('x-ccr-fallback', 'true');
    }
    reply.header('x-ccr-suggested-route', suggestedRouteId);
    reply.header('x-ccr-chosen-route', chosenRouteId);
    reply.header('x-ccr-reason', routingReason);
    reply.header('x-correlation-id', correlationId);
    reply.header('content-type', 'application/json');
    reply.status(bedrockResponse.statusCode).send(bedrockResponse.body);
    return;
  }

  // 4. Upstream proxy
  if (!apiKey) {
    server.log.warn({ correlationId }, 'Missing authentication header (x-api-key or authorization) for upstream public Anthropic API');
    reply.status(401).send({
      error: { type: 'authentication_error', message: 'Missing authentication credentials (x-api-key or authorization header) for upstream public Anthropic API.' },
    });
    return;
  }

  try {
    const forwardHeaders: Record<string, string> = {
      'content-type':      'application/json',
      'anthropic-version': anthropicVersion || '2023-06-01',
    };
    if (req.headers['x-api-key'])                                 forwardHeaders['x-api-key']         = req.headers['x-api-key'] as string;
    else if (req.headers['authorization'])                        forwardHeaders['authorization']      = req.headers['authorization'] as string;
    if (req.headers['anthropic-beta'])                            forwardHeaders['anthropic-beta']     = req.headers['anthropic-beta'] as string;
    if (req.headers['anthropic-dangerous-direct-browser-access']) forwardHeaders['anthropic-dangerous-direct-browser-access'] = req.headers['anthropic-dangerous-direct-browser-access'] as string;

    const upstreamResponse = await request(`${UPSTREAM_URL}/v1/messages`, {
      method:  'POST',
      headers: forwardHeaders,
      body:    JSON.stringify(reqBody),
    });

    const upstreamContentType = (upstreamResponse.headers['content-type'] as string) || 'application/json';
    const isStreaming          = upstreamContentType.includes('text/event-stream');

    reply.header('x-correlation-id', correlationId);
    reply.header('x-ccr-suggested-route', suggestedRouteId);
    reply.header('x-ccr-chosen-route', chosenRouteId);
    reply.header('x-ccr-reason', routingReason);
    if (fallbackActive) {
      reply.header('x-ccr-fallback', 'true');
    }
    reply.header('content-type', upstreamContentType);
    reply.status(upstreamResponse.statusCode);

    if (isStreaming) {
      const endTime   = process.hrtime(startTime);
      const latencyMs = Math.round(endTime[0] * 1000 + endTime[1] / 1000000);
      server.log.info({ correlationId, status: upstreamResponse.statusCode, latencyMs, streaming: true }, 'request_completed');
      await logRequestEvent(correlationId, targetModel, 'anthropic', upstreamResponse.statusCode, latencyMs);

      // Background reader — captures token counts from SSE without blocking the stream.
      let rawStreamBuffer = '';
      upstreamResponse.body.on('data', (chunk) => { rawStreamBuffer += chunk.toString(); });
      upstreamResponse.body.on('end', async () => {
        const inputMatch  = rawStreamBuffer.match(/"input_tokens"\s*:\s*(\d+)/);
        const outputMatch = rawStreamBuffer.match(/"output_tokens"\s*:\s*(\d+)/);
        const inputTokens  = inputMatch  ? parseInt(inputMatch[1],  10) : 0;
        const outputTokens = outputMatch ? parseInt(outputMatch[1], 10) : 0;

        if (inputTokens > 0 || outputTokens > 0) {
          await recordRequestTelemetry({
            correlationId, inputTokens, outputTokens,
            chosenRouteId, activeMode, suggestedRouteId, isOverride,
            promptLength: promptText.length, routingReason,
          });
        }
        lastRequestCache = { timestamp: Date.now(), promptText, routeUsed: chosenRouteId,
                             retryCount: currentRetryCount, correlationId };
      });

      reply.send(upstreamResponse.body);
    } else {
      const responseBodyText = await upstreamResponse.body.text();
      const endTime           = process.hrtime(startTime);
      const latencyMs         = Math.round(endTime[0] * 1000 + endTime[1] / 1000000);

      let tokenUsage = { input_tokens: 0, output_tokens: 0 };
      if (upstreamResponse.statusCode === 200) {
        try {
          const parsed = JSON.parse(responseBodyText);
          if (parsed.usage) {
            tokenUsage = { input_tokens: parsed.usage.input_tokens || 0, output_tokens: parsed.usage.output_tokens || 0 };
          }
        } catch {
          server.log.error({ correlationId }, 'Failed to parse upstream response JSON');
        }
      }

      server.log.info({
        correlationId, status: upstreamResponse.statusCode, latencyMs,
        inputTokens: tokenUsage.input_tokens, outputTokens: tokenUsage.output_tokens,
      }, 'request_completed');

      await logRequestEvent(correlationId, targetModel, 'anthropic', upstreamResponse.statusCode, latencyMs);

      if (upstreamResponse.statusCode === 200) {
        await recordRequestTelemetry({
          correlationId, inputTokens: tokenUsage.input_tokens, outputTokens: tokenUsage.output_tokens,
          chosenRouteId, activeMode, suggestedRouteId, isOverride,
          promptLength: promptText.length, routingReason,
        });
        lastRequestCache = { timestamp: Date.now(), promptText, routeUsed: chosenRouteId,
                             retryCount: currentRetryCount, correlationId };
      }

      reply.send(responseBodyText);
    }
  } catch (error: any) {
    const endTime   = process.hrtime(startTime);
    const latencyMs = Math.round(endTime[0] * 1000 + endTime[1] / 1000000);
    server.log.error({ correlationId, error: error.message, latencyMs }, 'Upstream request failed');
    await logRequestEvent(correlationId, targetModel, 'anthropic', 502, latencyMs);
    reply.status(502).send({ error: { type: 'api_error', message: 'ccr Gateway: Upstream connection failed.' } });
  }
};

server.post('/v1/messages', messagesHandler);
// Alias: Claude Code targeting ANTHROPIC_BASE_URL=http://localhost:8080/anthropic calls this path
server.post('/anthropic/v1/messages', messagesHandler);

// ── OpenAI Chat Completions Endpoint ──────────────────────────────────────────
server.post('/v1/chat/completions', async (req: FastifyRequest<{ Body: OpenAIChatBody }>, reply: FastifyReply) => {
  const correlationId = uuidv4();
  const startTime     = process.hrtime();

  const apiKey = (req.headers['x-api-key'] || req.headers['authorization']) as string;
  if (!apiKey) {
    reply.status(401).send({ error: { message: 'Missing API Key.' } });
    return;
  }

  const reqBody     = req.body;
  const targetModel = reqBody.model || 'unknown';

  // Extract prompt text for policy checks and classification
  let promptText = '';
  if (reqBody.messages && Array.isArray(reqBody.messages)) {
    promptText = reqBody.messages.map(m => m.content).join('\n');
  }

  // 1. Policy check
  const activeRules     = await getPolicies();
  const requestRepoPath = req.headers['x-ccr-repo-path'] as string || REPO_PATH;
  const policyResult    = policyEngine.evaluateRequest(
    { messages: [{ role: 'user', content: promptText }] },
    requestRepoPath,
    activeRules
  );

  if (!policyResult.allowed) {
    reply.status(400).send({ error: { message: `ccr Policy Blocked: ${policyResult.blockedReason}` } });
    return;
  }

  // 2. Route selection
  const routeConfig   = await getRouteConfig();
  const activeRouteId = routeConfig.activeRoute;
  const activeMode    = routeConfig.activeMode;

  const { suggestedRouteId, routingReason, finalRouteId, fallbackActive } = selectRoute({
    activeRouteId,
    activeMode,
    promptText,
    currentRetryCount: 0,
    forcedRoute:    policyResult.forcedRoute,
    triggeredRules: policyResult.triggeredRules,
  });

  const chosenRouteId = finalRouteId;
  const isOverride    = activeMode === 'suggested' && chosenRouteId !== activeRouteId;

  // Record request state
  recordRequestState({
    correlationId,
    reason:    routingReason,
    forced:    routingReason.includes('forced') || routingReason.includes('escalation') || fallbackActive,
    timestamp: Date.now(),
    chosenRoute: chosenRouteId,
  });

  // Mock mode for local testing
  const mockMode = req.headers['x-mock'] === 'true';

  if (mockMode) {
    const mockResponse = {
      id: `chatcmpl-${uuidv4()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: targetModel,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: `[ccr Pilot Mock] OpenAI Route: ${chosenRouteId}. Reason: ${routingReason}`
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 150,
        completion_tokens: 80,
        total_tokens: 230
      }
    };

    const endTime   = process.hrtime(startTime);
    const latencyMs = Math.round(endTime[0] * 1000 + endTime[1] / 1000000);
    await logRequestEvent(correlationId, targetModel, 'mock', 200, latencyMs);
    await recordRequestTelemetry({
      correlationId, inputTokens: 150, outputTokens: 80,
      chosenRouteId, activeMode, suggestedRouteId, isOverride,
      promptLength: promptText.length, routingReason,
    });

    reply.header('x-correlation-id', correlationId);
    reply.header('x-ccr-suggested-route', suggestedRouteId);
    reply.header('x-ccr-chosen-route', chosenRouteId);
    reply.header('x-ccr-reason', routingReason);
    reply.status(200).send(JSON.stringify(mockResponse));
    return;
  }

  // 3. Execution
  if (chosenRouteId.startsWith('aws-hosted/')) {
    // Invoke EKS or Mantle OpenAI endpoint
    const vllmResponse = await invokeVllmModel(chosenRouteId, {
      messages: reqBody.messages,
      max_tokens: reqBody.max_tokens,
      temperature: reqBody.temperature,
      stream: reqBody.stream
    });

    if (vllmResponse.statusCode === 200) {
      try {
        const parsed = JSON.parse(vllmResponse.body);
        const promptTokens = parsed.usage?.prompt_tokens || 0;
        const completionTokens = parsed.usage?.completion_tokens || 0;
        await recordRequestTelemetry({
          correlationId, inputTokens: promptTokens, outputTokens: completionTokens,
          chosenRouteId, activeMode, suggestedRouteId, isOverride,
          promptLength: promptText.length, routingReason,
        });
      } catch (e: unknown) {
        server.log.warn({ err: e, correlationId }, 'telemetry record failed (vllm path)');
      }
    }

    reply.status(vllmResponse.statusCode).send(vllmResponse.body);
    return;
  }

  if (chosenRouteId.startsWith('bedrock/')) {
    // Translate OpenAI request to Anthropic payload
    const oaiMsgs = reqBody.messages ?? [];
    const system = oaiMsgs.find((m) => m.role === 'system' || m.role === 'developer')?.content;
    const anthropicMessages = oaiMsgs
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }));

    const bedrockEntryOai = UNIFIED_MODEL_REGISTRY.find(m => m.id === chosenRouteId);
    const bedrockResponse = await invokeBedrockModel(chosenRouteId, {
      messages: anthropicMessages,
      system,
      max_tokens: reqBody.max_tokens || 1024,
      temperature: reqBody.temperature,
      stream: false
    }, bedrockEntryOai?.bedrockModelId);

    if (bedrockResponse.statusCode === 200) {
      try {
        const parsed = JSON.parse(bedrockResponse.body);
        const promptTokens = parsed.usage?.input_tokens || 0;
        const completionTokens = parsed.usage?.output_tokens || 0;

        await recordRequestTelemetry({
          correlationId, inputTokens: promptTokens, outputTokens: completionTokens,
          chosenRouteId, activeMode, suggestedRouteId, isOverride,
          promptLength: promptText.length, routingReason,
        });

        const openAIResponse = {
          id: parsed.id,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: targetModel,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: parsed.content?.[0]?.text || ''
              },
              finish_reason: parsed.stop_reason === 'end_turn' ? 'stop' : 'length'
            }
          ],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens
          }
        };
        reply.status(200).send(JSON.stringify(openAIResponse));
      } catch (e: any) {
        reply.status(500).send({ error: { message: `Translation failed: ${e.message}` } });
      }
    } else {
      reply.status(bedrockResponse.statusCode).send(bedrockResponse.body);
    }
    return;
  }

  if (chosenRouteId.startsWith('mantle/')) {
    const registryEntry = UNIFIED_MODEL_REGISTRY.find(m => m.id === chosenRouteId);
    const mantleModelId = registryEntry?.mantleModelId;

    if (!mantleModelId) {
      reply.status(500).send({ error: { message: `No mantleModelId mapped for route "${chosenRouteId}".` } });
      return;
    }

    const isAnthropicModel = registryEntry?.provider === 'anthropic';

    if (isAnthropicModel) {
      // Anthropic Mantle models expect Anthropic format — translate OpenAI request first
      const msgs = reqBody.messages ?? [];
      const system = msgs.find((m) => m.role === 'system' || m.role === 'developer')?.content;
      const anthropicMessages = msgs
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));

      let res;
      if (registryEntry?.useBedrockNative) {
        server.log.info({ correlationId, mantleModelId }, 'useBedrockNative: routing via native Bedrock SDK client (completions).');
        const sonnet46Entry = UNIFIED_MODEL_REGISTRY.find(m => m.id === 'bedrock/claude-sonnet-4-6');
        const bedrockRes = await invokeBedrockModel('bedrock/claude-sonnet-4-6', {
          messages: anthropicMessages,
          system,
          max_tokens: reqBody.max_tokens || 1024,
          temperature: reqBody.temperature,
          stream: false
        }, sonnet46Entry?.bedrockModelId);
        res = {
          statusCode: bedrockRes.statusCode,
          body: bedrockRes.body
        };
      } else {
        res = await invokeMantleAnthropicModel(mantleModelId, {
          messages: anthropicMessages,
          system,
          max_tokens: reqBody.max_tokens || 1024,
          temperature: reqBody.temperature,
          stream: false,
        });
      }

      if (res.statusCode === 200) {
        try {
          const parsed = JSON.parse(res.body);
          const promptTokens = parsed.usage?.input_tokens || 0;
          const completionTokens = parsed.usage?.output_tokens || 0;

          await recordRequestTelemetry({
            correlationId, inputTokens: promptTokens, outputTokens: completionTokens,
            chosenRouteId, activeMode, suggestedRouteId, isOverride,
            promptLength: promptText.length, routingReason,
          });

          const openAIResponse = {
            id: parsed.id,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: targetModel,
            choices: [{
              index: 0,
              message: { role: 'assistant', content: parsed.content?.[0]?.text || '' },
              finish_reason: parsed.stop_reason === 'end_turn' ? 'stop' : 'length',
            }],
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: promptTokens + completionTokens,
            },
          };
          reply.status(200).send(JSON.stringify(openAIResponse));
        } catch (e: any) {
          reply.status(500).send({ error: { message: `Translation failed: ${e.message}` } });
        }
      } else {
        reply.status(res.statusCode).send(res.body);
      }
      return;
    }

    // OSS Mantle models natively speak OpenAI — pass through directly
    const res = await invokeMantleOssModel(mantleModelId, reqBody);
    if (res.statusCode === 200) {
      try {
        const parsed = JSON.parse(res.body);
        const promptTokens = parsed.usage?.prompt_tokens || 0;
        const completionTokens = parsed.usage?.completion_tokens || 0;

        await recordRequestTelemetry({
          correlationId, inputTokens: promptTokens, outputTokens: completionTokens,
          chosenRouteId, activeMode, suggestedRouteId, isOverride,
          promptLength: promptText.length, routingReason,
        });
      } catch (e: unknown) {
        server.log.warn({ err: e, correlationId }, 'telemetry record failed (mantle-oss path)');
      }
    }
    reply.status(res.statusCode).header('content-type', res.headers['content-type'] || 'application/json').send(res.body);
    return;
  }

  reply.status(500).send({ error: { message: 'OpenAI endpoint routing not fully configured for this route.' } });
});

// ── Telemetry file append ─────────────────────────────────────────────────────

async function logTelemetryEvent(event: any): Promise<void> {
  const telemetryFile = path.join(process.cwd(), 'ccr_telemetry.json');
  try {
    let list: any[] = [];
    try {
      const raw = await fs.promises.readFile(telemetryFile, 'utf8');
      list = JSON.parse(raw);
    } catch (e: any) {
      if (e.code !== 'ENOENT') server.log.error(e, 'Failed to parse ccr_telemetry.json');
    }
    list.push(event);
    if (list.length > 2000) list = list.slice(-2000);
    await fs.promises.writeFile(telemetryFile, JSON.stringify(list, null, 2), 'utf8');
  } catch (e: any) {
    server.log.error(e, 'Failed to write to ccr_telemetry.json');
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────

const start = async () => {
  try {
    await initDatabase();
    // Warn at startup if any default policy rule references an unknown model ID (#8).
    policyEngine.validateForcedRoutes(VALID_ROUTE_IDS);

    // Perform initial health checks immediately at startup to avoid 10s delay window
    isVllmHealthy = await checkVllmHealth().catch(() => false);
    isVpnHealthy  = await checkVpnHealth().catch(() => false);

    // EKS vLLM and VPN health ping loops — update module vars only, never mutate registry objects.
    setInterval(async () => {
      isVllmHealthy = await checkVllmHealth().catch(() => false);
      isVpnHealthy  = await checkVpnHealth().catch(() => false);
    }, 10000);

    await server.listen({ port: PORT, host: '0.0.0.0' });
    server.log.info(`ccr Gateway listening on port ${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

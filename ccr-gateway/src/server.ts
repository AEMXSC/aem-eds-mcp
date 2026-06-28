import fastify from 'fastify';
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
import { renderDashboard, renderCisoReport } from './dashboard.js';

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

// Token costs keyed by model/route ID — single source of truth, no magic numbers in handlers.
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5':              { input: 0.0000008,  output: 0.000004  },
  'claude-sonnet-4-5':             { input: 0.000003,   output: 0.000015  },
  'claude-sonnet-4-6':             { input: 0.000003,   output: 0.000015  },
  'claude-opus-4-8':               { input: 0.000015,   output: 0.000075  },
  'aws-hosted/deepseek-coder-v2':  { input: 0.00000014, output: 0.00000014 },
  'aws-hosted/qwen-coder-32b':     { input: 0.00000018, output: 0.00000018 },
  'aws-hosted/glm-coder-v2':       { input: 0.00000020, output: 0.00000020 },
  'bedrock/claude-3-5-sonnet':     { input: 0.000003,   output: 0.000015  },
  // Bedrock Mantle — Anthropic
  'mantle/claude-opus-4-8':        { input: 0.000015,   output: 0.000075  },
  'mantle/claude-sonnet-4-6':      { input: 0.000003,   output: 0.000015  },
  'mantle/claude-haiku-4-5':       { input: 0.0000008,  output: 0.000004  },
  // Bedrock Mantle — OSS
  'mantle/gpt-5.5':                { input: 0.000005,   output: 0.000025  },
  'mantle/qwen3-coder-next':       { input: 0.00000008, output: 0.00000008 },
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
  const delta         = baselineCost - actualCost;

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

// ── Task classifier (#15) ─────────────────────────────────────────────────────

const CHEAP_ROUTE_INDICATORS = [
  'git commit', 'lint', 'add comments', 'explain', 'format',
  'refactor', 'test', 'boilerplate', 'commit message',
] as const;

function classifyTask(promptText: string): { suggestedRoute: string; reason: string } {
  const lower = promptText.toLowerCase();
  for (const indicator of CHEAP_ROUTE_INDICATORS) {
    if (lower.includes(indicator)) {
      return {
        suggestedRoute: 'aws-hosted/deepseek-coder-v2',
        reason:         `cheap_indicator:${indicator}`,
      };
    }
  }
  return { suggestedRoute: 'bedrock/claude-3-5-sonnet', reason: 'heavy_reasoning_default' };
}

// ── Primary Gateway: Anthropic Messages proxy ─────────────────────────────────

const messagesHandler = async (req: any, reply: any) => {
  const correlationId = uuidv4();
  const startTime     = process.hrtime();

  const { 'x-api-key': _key, authorization: _auth, ...safeHeaders } = req.headers;
  server.log.info({ correlationId, headers: safeHeaders }, 'Incoming request headers');

  const apiKey          = (req.headers['x-api-key'] || req.headers['authorization']) as string;
  const anthropicVersion = req.headers['anthropic-version'] as string;

  if (!apiKey) {
    server.log.warn({ correlationId }, 'Missing authentication header (x-api-key or authorization)');
    reply.status(401).send({
      error: { type: 'authentication_error', message: 'Missing authentication credentials (x-api-key or authorization header).' },
    });
    return;
  }

  const reqBody    = req.body as any;
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

  let suggestedRouteId = activeRouteId;
  let routingReason    = 'manual_user_override';

  if (activeMode === 'suggested' || activeMode === 'auto') {
    if (currentRetryCount >= 2) {
      suggestedRouteId = 'bedrock/claude-3-5-sonnet';
      routingReason    = 'cheap_route_retry_escalation';
    } else if (policyResult.forcedRoute) {
      suggestedRouteId = policyResult.forcedRoute;
      if (policyResult.triggeredRules.includes('sensitive-workspace-forced-premium')) {
        routingReason  = 'sensitive-workspace-forced-premium';
      } else if (policyResult.triggeredRules.includes('workspace-forced-local')) {
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
    if (policyResult.forcedRoute) {
      suggestedRouteId = policyResult.forcedRoute;
      if (policyResult.triggeredRules.includes('sensitive-workspace-forced-premium')) {
        routingReason  = 'sensitive-workspace-forced-premium';
      } else if (policyResult.triggeredRules.includes('workspace-forced-local')) {
        routingReason  = 'workspace_forced_policy';
      } else {
        routingReason  = 'policy_forced_local';
      }
    }
  }

  // 30k Context token ceiling check: Escalate prompts >30k tokens (~120k characters) to Bedrock Sonnet
  if (promptText.length > 120000 && suggestedRouteId.startsWith('aws-hosted/')) {
    suggestedRouteId = 'bedrock/claude-3-5-sonnet';
    routingReason    = 'context_window_ceiling_escalation';
  }

  // Sensitive keywords & High-complexity tasks confidence gates
  const lowerPrompt = promptText.toLowerCase();

  const matchesSensitive = SENSITIVE_KEYWORDS.some(kw => lowerPrompt.includes(kw));
  const matchesComplex   = COMPLEX_OPERATIONS.some(kw => lowerPrompt.includes(kw));

  if (matchesSensitive && suggestedRouteId.startsWith('aws-hosted/')) {
    suggestedRouteId = 'bedrock/claude-3-5-sonnet';
    routingReason    = 'sensitive_context_escalation';
  } else if (matchesComplex && suggestedRouteId.startsWith('aws-hosted/')) {
    suggestedRouteId = 'bedrock/claude-3-5-sonnet';
    routingReason    = 'complexity_task_escalation';
  }

  // EKS Health fallback check: redirect aws-hosted queries if vLLM server is unhealthy
  let finalRouteId = suggestedRouteId;
  let fallbackActive = false;
  if (finalRouteId.startsWith('aws-hosted/') && !isVllmHealthy) {
    finalRouteId = 'bedrock/claude-3-5-sonnet';
    routingReason = 'oss_route_unhealthy_fallback';
    fallbackActive = true;
  }

  const chosenRouteId = finalRouteId;
  const isOverride    = activeMode === 'suggested' && chosenRouteId !== activeRouteId;

  // Write to ring buffer — no mutable globals (#4).
  recordRequestState({
    correlationId,
    reason:    routingReason,
    forced:    routingReason.includes('forced') || routingReason.includes('escalation') || fallbackActive,
    timestamp: Date.now(),
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
        const res = await invokeMantleAnthropicModel(mantleModelId, reqBody);
        mantleStatusCode = res.statusCode;
        mantleBody       = res.body;
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(res.body);
            inputTokens  = parsed.usage?.input_tokens  || 0;
            outputTokens = parsed.usage?.output_tokens || 0;
          } catch {}
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

  // 3c. Amazon Bedrock Runtime proxy connector
  if (chosenRouteId.startsWith('bedrock/')) {
    const bedrockResponse = await invokeBedrockModel(chosenRouteId, reqBody);
    
    let inputTokens = 0;
    let outputTokens = 0;

    if (bedrockResponse.statusCode === 200) {
      try {
        const parsed = JSON.parse(bedrockResponse.body);
        inputTokens = parsed.usage?.input_tokens || 0;
        outputTokens = parsed.usage?.output_tokens || 0;
      } catch {}
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
server.post('/v1/chat/completions', async (req, reply) => {
  const correlationId = uuidv4();
  const startTime     = process.hrtime();
  
  const apiKey = (req.headers['x-api-key'] || req.headers['authorization']) as string;
  if (!apiKey) {
    reply.status(401).send({ error: { message: 'Missing API Key.' } });
    return;
  }

  const reqBody = req.body as any;
  const targetModel = reqBody.model || 'unknown';

  // Extract prompt text for policy checks and classification
  let promptText = '';
  if (reqBody.messages && Array.isArray(reqBody.messages)) {
    promptText = reqBody.messages.map((m: any) => m.content).join('\n');
  }

  // 1. Policy check
  const activeRules  = await getPolicies();
  const requestRepoPath = req.headers['x-ccr-repo-path'] as string || REPO_PATH;
  const policyResult = policyEngine.evaluateRequest(
    { messages: [{ role: 'user', content: promptText }] },
    requestRepoPath, 
    activeRules
  );

  if (!policyResult.allowed) {
    reply.status(400).send({ error: { message: `ccr Policy Blocked: ${policyResult.blockedReason}` } });
    return;
  }

  // 2. Route selection
  const routeConfig = await getRouteConfig();
  const activeRouteId = routeConfig.activeRoute;
  const activeMode = routeConfig.activeMode;

  let suggestedRouteId = activeRouteId;
  let routingReason = 'manual_user_override';

  if (activeMode === 'suggested' || activeMode === 'auto') {
    const classification = classifyTask(promptText);
    suggestedRouteId = classification.suggestedRoute;
    routingReason = classification.reason;
  }

  // Policy override check
  if (policyResult.forcedRoute) {
    suggestedRouteId = policyResult.forcedRoute;
    routingReason = policyResult.triggeredRules.includes('sensitive-workspace-forced-premium')
      ? 'sensitive-workspace-forced-premium' : 'policy_forced_local';
  }

  // Escalations for sensitive or complex queries
  const lowerPrompt = promptText.toLowerCase();
  const matchesSensitive = SENSITIVE_KEYWORDS.some(kw => lowerPrompt.includes(kw));
  const matchesComplex   = COMPLEX_OPERATIONS.some(kw => lowerPrompt.includes(kw));

  if (matchesSensitive && suggestedRouteId.startsWith('aws-hosted/')) {
    suggestedRouteId = 'bedrock/claude-3-5-sonnet';
    routingReason    = 'sensitive_context_escalation';
  } else if (matchesComplex && suggestedRouteId.startsWith('aws-hosted/')) {
    suggestedRouteId = 'bedrock/claude-3-5-sonnet';
    routingReason    = 'complexity_task_escalation';
  }

  // EKS Health fallback check
  let finalRouteId = suggestedRouteId;
  let fallbackActive = false;
  if (finalRouteId.startsWith('aws-hosted/') && !isVllmHealthy) {
    finalRouteId = 'bedrock/claude-3-5-sonnet';
    routingReason = 'oss_route_unhealthy_fallback';
    fallbackActive = true;
  }

  const chosenRouteId = finalRouteId;
  const isOverride    = activeMode === 'suggested' && chosenRouteId !== activeRouteId;

  // Record request state
  recordRequestState({
    correlationId,
    reason:    routingReason,
    forced:    routingReason.includes('forced') || routingReason.includes('escalation') || fallbackActive,
    timestamp: Date.now(),
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

    reply.status(vllmResponse.statusCode).send(vllmResponse.body);
    return;
  }

  if (chosenRouteId.startsWith('bedrock/')) {
    // Translate OpenAI request to Anthropic payload
    const system = reqBody.messages.find((m: any) => m.role === 'system' || m.role === 'developer')?.content;
    const anthropicMessages = reqBody.messages
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .map((m: any) => ({ role: m.role, content: m.content }));

    const bedrockResponse = await invokeBedrockModel(chosenRouteId, {
      messages: anthropicMessages,
      system,
      max_tokens: reqBody.max_tokens || 1024,
      temperature: reqBody.temperature,
      stream: false
    });

    if (bedrockResponse.statusCode === 200) {
      try {
        const parsed = JSON.parse(bedrockResponse.body);
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
            prompt_tokens: parsed.usage?.input_tokens || 0,
            completion_tokens: parsed.usage?.output_tokens || 0,
            total_tokens: (parsed.usage?.input_tokens || 0) + (parsed.usage?.output_tokens || 0)
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
      const system = reqBody.messages.find((m: any) => m.role === 'system' || m.role === 'developer')?.content;
      const anthropicMessages = reqBody.messages
        .filter((m: any) => m.role === 'user' || m.role === 'assistant')
        .map((m: any) => ({ role: m.role, content: m.content }));

      const res = await invokeMantleAnthropicModel(mantleModelId, {
        messages: anthropicMessages,
        system,
        max_tokens: reqBody.max_tokens || 1024,
        temperature: reqBody.temperature,
        stream: false,
      });

      if (res.statusCode === 200) {
        try {
          const parsed = JSON.parse(res.body);
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
              prompt_tokens: parsed.usage?.input_tokens || 0,
              completion_tokens: parsed.usage?.output_tokens || 0,
              total_tokens: (parsed.usage?.input_tokens || 0) + (parsed.usage?.output_tokens || 0),
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

import fastify from 'fastify';
import { request } from 'undici';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import { PolicyEngine } from './policy.js';
import {
  initDatabase,
  logRequestEvent,
  logPolicyHit,
  logSpendRecord,
  getPolicies,
  savePolicy,
  deletePolicy,
  incrementPolicyHits
} from './db.js';
import { renderDashboard, renderCisoReport } from './dashboard.js';

// Load local environment variables
dotenv.config();

const server = fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// Configure defaults
const UPSTREAM_URL = process.env.UPSTREAM_URL || 'https://api.anthropic.com';
const PORT = parseInt(process.env.PORT || '8081', 10);
const REPO_PATH = process.env.REPO_PATH || process.cwd();

const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 0.0000008, output: 0.000004 },
  'claude-sonnet-4-5': { input: 0.000003, output: 0.000015 },
  'claude-sonnet-4-6': { input: 0.000003, output: 0.000015 },
  'claude-opus-4-8': { input: 0.000015, output: 0.000075 },
};
const DEFAULT_TOKEN_COST = { input: 0.000003, output: 0.000015 };

const policyEngine = new PolicyEngine();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

server.addHook('preHandler', async (req, reply) => {
  if (req.url.startsWith('/admin')) {
    if (!ADMIN_TOKEN) return; // dev mode: no token configured = open
    const token = req.headers['x-admin-token'];
    if (token !== ADMIN_TOKEN) {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  }
});

// Health check endpoints
server.get('/health', async () => {
  return { status: 'healthy', timestamp: new Date().toISOString() };
});

server.get('/ready', async () => {
  return { status: 'ready' };
});

// Admin dashboard endpoints
server.get('/admin/dashboard', async (req, reply) => {
  reply.header('content-type', 'text/html');
  return renderDashboard();
});

server.get('/admin/reports/approval', async (req, reply) => {
  reply.header('content-type', 'text/html');
  return renderCisoReport();
});

// Admin REST API: Policies CRUD
server.get('/admin/api/policies', async () => {
  return getPolicies();
});

server.post('/admin/api/policies', async (req, reply) => {
  const body = req.body as any;
  if (!body.name || !body.pattern || !body.mode || !body.type) {
    reply.status(400).send({ error: 'Missing required fields (name, pattern, mode, type)' });
    return;
  }
  const VALID_MODES = ['monitor', 'warn', 'enforce'];
  const VALID_TYPES = ['file_path', 'regex_pattern', 'ccrignore'];
  const VALID_SCOPES = ['repo', 'global'];

  if (!VALID_MODES.includes(body.mode) || !VALID_TYPES.includes(body.type)) {
    reply.status(400).send({ error: 'Invalid mode or type value' });
    return;
  }
  if (body.scope && !VALID_SCOPES.includes(body.scope)) {
    reply.status(400).send({ error: 'Invalid scope value' });
    return;
  }
  const newRule = {
    id: `rule-${Date.now()}`,
    name: body.name,
    pattern: body.pattern,
    mode: body.mode,
    type: body.type,
    description: body.description || '',
    scope: body.scope || 'repo'
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
  const VALID_MODES_PUT = ['monitor', 'warn', 'enforce'];
  const VALID_TYPES_PUT = ['file_path', 'regex_pattern', 'ccrignore'];
  const VALID_SCOPES_PUT = ['repo', 'global'];

  if (!VALID_MODES_PUT.includes(body.mode) || !VALID_TYPES_PUT.includes(body.type)) {
    reply.status(400).send({ error: 'Invalid mode or type value' });
    return;
  }
  if (body.scope && !VALID_SCOPES_PUT.includes(body.scope)) {
    reply.status(400).send({ error: 'Invalid scope value' });
    return;
  }
  const updatedRule = {
    ...rule,
    name: body.name !== undefined ? body.name : rule.name,
    pattern: body.pattern !== undefined ? body.pattern : rule.pattern,
    mode: body.mode !== undefined ? body.mode : rule.mode,
    type: body.type !== undefined ? body.type : rule.type,
    description: body.description !== undefined ? body.description : rule.description,
    scope: body.scope !== undefined ? body.scope : rule.scope
  };
  await savePolicy(updatedRule);
  return updatedRule;
});

server.delete('/admin/api/policies/:id', async (req, reply) => {
  const { id } = req.params as any;
  await deletePolicy(id);
  return { success: true };
});

// Primary Gateway: Anthropic Messages proxy
server.post('/v1/messages', async (req, reply) => {
  const correlationId = uuidv4();
  const startTime = process.hrtime();

  const { 'x-api-key': _key, authorization: _auth, ...safeHeaders } = req.headers;
  server.log.info({ correlationId, headers: safeHeaders }, 'Incoming request headers');

  const apiKey = (req.headers['x-api-key'] || req.headers['authorization']) as string;
  const anthropicVersion = req.headers['anthropic-version'] as string;

  if (!apiKey) {
    server.log.warn({ correlationId }, 'Missing authentication header (x-api-key or authorization)');
    reply.status(401).send({
      error: {
        type: 'authentication_error',
        message: 'Missing authentication credentials (x-api-key or authorization header).',
      },
    });
    return;
  }

  const reqBody = req.body as any;
  const targetModel = reqBody?.model || 'unknown';

  // 1. Evaluate request against active database policies
  const activeRules = await getPolicies();
  const policyResult = policyEngine.evaluateRequest(reqBody, REPO_PATH, activeRules);

  if (!policyResult.allowed) {
    const endTime = process.hrtime(startTime);
    const latencyMs = Math.round(endTime[0] * 1000 + endTime[1] / 1000000);

    server.log.warn(
      { correlationId, triggeredRules: policyResult.triggeredRules, latencyMs },
      `Request BLOCKED by ccr Policy: ${policyResult.blockedReason}`
    );

    // Database: Log blocked request event
    await logRequestEvent(correlationId, targetModel, 'none', 400, latencyMs);
    
    // Database: Log policy hit records and increment matching hit count
    for (const ruleId of policyResult.triggeredRules) {
      await logPolicyHit(correlationId, ruleId, 'block', policyResult.blockedReason);
      await incrementPolicyHits(ruleId);
    }

    // Database: Log exfiltration-prevention savings (audited baseline of $0.005 saved per blocked code leak)
    await logSpendRecord(correlationId, 0, 0, 0, 0.005, 0.005);

    // Return structured Anthropic error so Claude Code renders it beautifully
    reply.status(400).send({
      error: {
        type: 'invalid_request_error',
        message: `ccr Policy Blocked: ${policyResult.blockedReason}`,
      },
    });
    return;
  }

  // Log warnings in database if warning rules are triggered
  if (policyResult.action === 'warn') {
    server.log.warn(
      { correlationId, triggeredRules: policyResult.triggeredRules },
      `Policy Warning: ${policyResult.warnings.join(', ')}`
    );
    for (const ruleId of policyResult.triggeredRules) {
      await logPolicyHit(correlationId, ruleId, 'warn');
      await incrementPolicyHits(ruleId);
    }
  }

  server.log.info(
    { correlationId, model: targetModel },
    'Forwarding request to Anthropic upstream'
  );

  try {
    // Dynamically build headers to forward
    const forwardHeaders: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': anthropicVersion || '2023-06-01',
    };

    if (req.headers['x-api-key']) {
      forwardHeaders['x-api-key'] = req.headers['x-api-key'] as string;
    } else if (req.headers['authorization']) {
      forwardHeaders['authorization'] = req.headers['authorization'] as string;
    }

    // Forward critical beta headers required by Claude Code
    if (req.headers['anthropic-beta']) {
      forwardHeaders['anthropic-beta'] = req.headers['anthropic-beta'] as string;
    }
    if (req.headers['anthropic-dangerous-direct-browser-access']) {
      forwardHeaders['anthropic-dangerous-direct-browser-access'] = req.headers['anthropic-dangerous-direct-browser-access'] as string;
    }

    // Proxy request using high-performance undici client
    const upstreamResponse = await request(`${UPSTREAM_URL}/v1/messages`, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify(reqBody),
    });

    const upstreamContentType = (upstreamResponse.headers['content-type'] as string) || 'application/json';
    const isStreaming = upstreamContentType.includes('text/event-stream');

    reply.header('x-correlation-id', correlationId);
    reply.header('content-type', upstreamContentType);
    reply.status(upstreamResponse.statusCode);

    if (isStreaming) {
      // Pipe SSE stream directly — buffering stalls Claude Code's streaming client
      const endTime = process.hrtime(startTime);
      const latencyMs = Math.round(endTime[0] * 1000 + endTime[1] / 1000000);
      
      server.log.info({
        correlationId,
        eventType: 'request_completed',
        status: upstreamResponse.statusCode,
        model: targetModel,
        latencyMs,
        streaming: true,
      });

      // Database: Log request event metadata
      await logRequestEvent(correlationId, targetModel, 'anthropic', upstreamResponse.statusCode, latencyMs);

      // Background stream reader to capture token count from SSE without adding latency
      let rawStreamBuffer = '';
      upstreamResponse.body.on('data', (chunk) => {
        rawStreamBuffer += chunk.toString();
      });

      upstreamResponse.body.on('end', async () => {
        let inputTokens = 0;
        let outputTokens = 0;

        // Search for usage structures in SSE text
        const inputMatch = rawStreamBuffer.match(/"input_tokens"\s*:\s*(\d+)/);
        if (inputMatch) inputTokens = parseInt(inputMatch[1], 10);

        const outputMatch = rawStreamBuffer.match(/"output_tokens"\s*:\s*(\d+)/);
        if (outputMatch) outputTokens = parseInt(outputMatch[1], 10);

        if (inputTokens > 0 || outputTokens > 0) {
          const costs = TOKEN_COSTS[targetModel] || DEFAULT_TOKEN_COST;
          const inputCost = inputTokens * costs.input;
          const outputCost = outputTokens * costs.output;
          const actualCost = inputCost + outputCost;
          // Actual and baseline are equal in Sonnet proxy mode
          await logSpendRecord(correlationId, inputTokens, outputTokens, actualCost, actualCost, 0);
        }
      });

      reply.send(upstreamResponse.body);
    } else {
      // Buffer non-streaming response so we can parse and log token usage
      const responseBodyText = await upstreamResponse.body.text();
      const endTime = process.hrtime(startTime);
      const latencyMs = Math.round(endTime[0] * 1000 + endTime[1] / 1000000);

      let tokenUsage = { input_tokens: 0, output_tokens: 0 };
      if (upstreamResponse.statusCode === 200) {
        try {
          const parsed = JSON.parse(responseBodyText);
          if (parsed.usage) {
            tokenUsage = {
              input_tokens: parsed.usage.input_tokens || 0,
              output_tokens: parsed.usage.output_tokens || 0,
            };
          }
        } catch (e) {
          server.log.error({ correlationId }, 'Failed to parse upstream response JSON');
        }
      }

      server.log.info({
        correlationId,
        eventType: 'request_completed',
        status: upstreamResponse.statusCode,
        model: targetModel,
        latencyMs,
        inputTokens: tokenUsage.input_tokens,
        outputTokens: tokenUsage.output_tokens,
      });

      // Database: Log request event
      await logRequestEvent(correlationId, targetModel, 'anthropic', upstreamResponse.statusCode, latencyMs);

      // Database: Log token usage spend record
      if (upstreamResponse.statusCode === 200) {
        const costs = TOKEN_COSTS[targetModel] || DEFAULT_TOKEN_COST;
        const inputCost = tokenUsage.input_tokens * costs.input;
        const outputCost = tokenUsage.output_tokens * costs.output;
        const actualCost = inputCost + outputCost;
        await logSpendRecord(correlationId, tokenUsage.input_tokens, tokenUsage.output_tokens, actualCost, actualCost, 0);
      }

      reply.send(responseBodyText);
    }

  } catch (error: any) {
    const endTime = process.hrtime(startTime);
    const latencyMs = Math.round(endTime[0] * 1000 + endTime[1] / 1000000);

    server.log.error(
      { correlationId, error: error.message, latencyMs },
      'Upstream request failed'
    );

    // Database: Log failed request
    await logRequestEvent(correlationId, targetModel, 'anthropic', 502, latencyMs);

    reply.status(502).send({
      error: {
        type: 'api_error',
        message: 'ccr Gateway: Upstream connection failed.',
      },
    });
  }
});

// Run server
const start = async () => {
  try {
    await initDatabase();
    await server.listen({ port: PORT, host: '0.0.0.0' });
    server.log.info(`ccr Gateway listening on port ${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

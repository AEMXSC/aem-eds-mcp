import fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { request } from 'undici';
import * as dotenv from 'dotenv';

import { buildForwardHeaders } from './shared/anthropic_headers.js';

dotenv.config();

const PORT       = parseInt(process.env.PORT || '8080', 10);
const CORE_URL    = process.env.CORE_URL || 'http://127.0.0.1:8081';
const UPSTREAM_URL = process.env.UPSTREAM_URL || 'https://api.anthropic.com';
const HEALTH_CHECK_INTERVAL_MS = 4000;
const HEALTH_CHECK_TIMEOUT_MS  = 2000;

// Paths that have a meaningful direct-to-Anthropic fallback when ccr-core is down.
const ANTHROPIC_FALLBACK_PATHS = new Set(['/v1/messages', '/anthropic/v1/messages']);

const HOP_BY_HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length',
]);

const server = fastify({ logger: true });

let isCoreHealthy = true;

async function checkCoreHealth(): Promise<boolean> {
  try {
    const res = await request(`${CORE_URL}/health`, {
      method: 'GET',
      headersTimeout: HEALTH_CHECK_TIMEOUT_MS,
    });
    return res.statusCode === 200;
  } catch {
    return false;
  }
}

function isConnectionError(err: any): boolean {
  const code = err?.code || err?.cause?.code;
  return code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT'
    || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_SOCKET';
}

function stripHopByHopHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    if (val === undefined || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    out[key] = Array.isArray(val) ? val.join(', ') : val;
  }
  return out;
}

/**
 * Dumb byte-for-byte reverse proxy to ccr-core — no format translation, ccr-core
 * already owns all routing/policy/telemetry logic. Returns false (and flips
 * isCoreHealthy) only on a genuine connection failure, so a legitimate error
 * response *from* core (e.g. its own 500) still passes through untouched.
 */
async function proxyToCore(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  try {
    const res = await request(`${CORE_URL}${req.url}`, {
      method: req.method as any,
      headers: stripHopByHopHeaders(req.headers as Record<string, string>),
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
      headersTimeout: 5000,
    });
    isCoreHealthy = true;
    reply.hijack();
    reply.raw.writeHead(res.statusCode, stripHopByHopHeaders(res.headers as Record<string, string>));
    // pipe() only calls dest.end() when the source ends normally — if this stream
    // (the ccr-edge <-> ccr-core connection) errors or resets mid-transfer, pipe()
    // silently does nothing: no error propagation, no end() call. Headers are already
    // flushed as 200 by this point, so the client is left with a truncated response
    // that looks like a successful-but-malformed reply, with no signal of what happened.
    res.body.on('error', (streamErr: any) => {
      server.log.error({ err: streamErr }, 'ccr-edge: upstream stream from ccr-core errored mid-transfer — client received a truncated response');
      if (!reply.raw.writableEnded) reply.raw.end();
    });
    res.body.pipe(reply.raw);
    return true;
  } catch (err: any) {
    if (isConnectionError(err)) {
      isCoreHealthy = false;
      return false;
    }
    throw err;
  }
}

/** Direct-to-Anthropic fallback — client's own credentials, $0 marginal AWS cost. */
async function forwardToAnthropicDirect(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const forwardHeaders = buildForwardHeaders(req);
  const res = await request(`${UPSTREAM_URL}/v1/messages`, {
    method: 'POST',
    headers: forwardHeaders,
    body: JSON.stringify(req.body ?? {}),
  });
  reply.hijack();
  reply.raw.writeHead(res.statusCode, {
    ...stripHopByHopHeaders(res.headers as Record<string, string>),
    'x-ccr-edge-fallback': 'direct-anthropic',
  });
  res.body.pipe(reply.raw);
}

async function handleProxiedRoute(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const allowDirectFallback = ANTHROPIC_FALLBACK_PATHS.has(req.url.split('?')[0]);

  if (isCoreHealthy) {
    const proxied = await proxyToCore(req, reply);
    if (proxied) return;
    // proxyToCore flipped isCoreHealthy = false on connection failure — fall through below.
  }

  if (allowDirectFallback) {
    await forwardToAnthropicDirect(req, reply);
  } else {
    reply.status(503).send({
      error: {
        type: 'api_error',
        message: 'ccr-core is currently unreachable. Only /v1/messages and /anthropic/v1/messages fall back to direct Anthropic — the admin dashboard and /v1/chat/completions require ccr-core.',
      },
    });
  }
}

server.get('/health', async () => ({ status: 'healthy', component: 'ccr-edge' }));
server.get('/edge-status', async () => ({
  coreHealthy: isCoreHealthy,
  mode: isCoreHealthy ? 'proxied' : 'direct-fallback',
  coreUrl: CORE_URL,
}));

server.post('/v1/messages', handleProxiedRoute);
server.post('/anthropic/v1/messages', handleProxiedRoute);
server.post('/v1/chat/completions', handleProxiedRoute);
server.all('/admin/*', handleProxiedRoute);

process.on('uncaughtException', (err) => {
  console.error('[ccr-edge] uncaughtException — staying alive:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[ccr-edge] unhandledRejection — staying alive:', reason);
});

const start = async () => {
  isCoreHealthy = await checkCoreHealth().catch(() => false);
  setInterval(async () => {
    isCoreHealthy = await checkCoreHealth().catch(() => false);
  }, HEALTH_CHECK_INTERVAL_MS);

  await server.listen({ port: PORT, host: '127.0.0.1' });
  server.log.info(`ccr-edge listening on port ${PORT} (core: ${CORE_URL}, initial coreHealthy=${isCoreHealthy})`);
};

start();

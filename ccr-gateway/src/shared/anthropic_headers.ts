import type { FastifyRequest } from 'fastify';

/**
 * Dynamically builds forward headers for upstream requests.
 * Automatically forwards all headers starting with 'anthropic-' or standard auth headers.
 * Normalizes keys to lowercase to ensure consistency.
 *
 * Shared between ccr-core and ccr-edge — this is the one piece of logic both
 * processes must agree on for the direct-to-Anthropic fallback path to work.
 */
export function buildForwardHeaders(req: FastifyRequest, defaultVersion = '2023-06-01'): Record<string, string> {
  const forwardHeaders: Record<string, string> = {
    'content-type': 'application/json'
  };

  for (const key of Object.keys(req.headers)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.startsWith('anthropic-') || lowerKey === 'authorization' || lowerKey === 'x-api-key') {
      const val = req.headers[key];
      if (val !== undefined && val !== null) {
        forwardHeaders[lowerKey] = Array.isArray(val) ? val.join(', ') : String(val);
      }
    }
  }

  if (!forwardHeaders['anthropic-version']) {
    forwardHeaders['anthropic-version'] = defaultVersion;
  }

  return forwardHeaders;
}

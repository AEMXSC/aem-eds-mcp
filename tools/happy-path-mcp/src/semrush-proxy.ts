import { timingSafeEqual } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { SERVER_VERSION } from "./tools.js";

const SEMRUSH_MCP_URL = process.env.SEMRUSH_MCP_URL ?? "https://mcp.semrush.com/v1/mcp";
const TOOL_CACHE_MS = 10 * 60 * 1000;

interface ToolCache {
  readonly tools: readonly Tool[];
  readonly fetchedAt: number;
}

let client: Client | undefined;
let connecting: Promise<Client> | undefined;
let toolCache: ToolCache | undefined;

/** Semrush proxying is on only when an API key is configured. */
export function isSemrushConfigured(): boolean {
  return Boolean(process.env.SEMRUSH_API_KEY);
}

/**
 * Gate for the proxied tools. Fails closed: with no HAPPY_PATH_TOKEN configured,
 * remote callers never get Semrush access (the key is a shared, billed resource).
 */
function tokenMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Accepts the token as `Authorization: Bearer <token>` (Claude Code / header-capable clients)
 * or as a secret URL path segment `/mcp/<token>` (claude.ai connectors can't send custom headers).
 */
export function isAuthorizedForSemrush(authHeader: string | undefined, pathSecret?: string): boolean {
  const expected = process.env.HAPPY_PATH_TOKEN;
  if (!expected) return false;
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
  return tokenMatches(bearer, expected) || tokenMatches(pathSecret, expected);
}

async function getClient(): Promise<Client> {
  if (client) return client;
  connecting ??= (async () => {
    const apiKey = process.env.SEMRUSH_API_KEY;
    if (!apiKey) throw new Error("SEMRUSH_API_KEY is not configured");
    const c = new Client({ name: "happy-path-mcp-semrush-proxy", version: SERVER_VERSION });
    c.onclose = () => { client = undefined; toolCache = undefined; };
    await c.connect(
      new StreamableHTTPClientTransport(new URL(SEMRUSH_MCP_URL), {
        requestInit: { headers: { Authorization: `Apikey ${apiKey}` } },
      }),
    );
    client = c;
    return c;
  })().finally(() => { connecting = undefined; });
  return connecting;
}

/** Semrush's tool list, cached. Returns [] (and logs) if Semrush is unreachable so local tools still list. */
export async function listSemrushTools(): Promise<readonly Tool[]> {
  if (!isSemrushConfigured()) return [];
  if (toolCache && Date.now() - toolCache.fetchedAt < TOOL_CACHE_MS) return toolCache.tools;
  try {
    const { tools } = await (await getClient()).listTools();
    toolCache = { tools, fetchedAt: Date.now() };
    return tools;
  } catch (err) {
    process.stderr.write(`[semrush-proxy] listTools failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return toolCache?.tools ?? [];
  }
}

export async function isSemrushTool(name: string): Promise<boolean> {
  return (await listSemrushTools()).some(t => t.name === name);
}

export async function callSemrushTool(name: string, args: Record<string, unknown>) {
  try {
    return await (await getClient()).callTool({ name, arguments: args });
  } catch (err) {
    process.stderr.write(`[semrush-proxy] ${name} failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { content: [{ type: "text" as const, text: "Error: Semrush request failed" }], isError: true };
  }
}

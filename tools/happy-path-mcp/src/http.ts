#!/usr/bin/env node
import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { SERVER_VERSION, TOOLS, handleTool, type Args } from "./tools.js";

const PORT = parseInt(process.env.PORT ?? "3002", 10);

// ─── Session store (stateful mode — required for mcp-session-id header) ───────

const transports = new Map<string, StreamableHTTPServerTransport>();

function createMcpServer() {
  const server = new Server(
    { name: "happy-path-mcp", version: SERVER_VERSION },
    { capabilities: { tools: { listChanged: true } } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    return handleTool(name, args as Args);
  });
  return server;
}

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express();
app.set("trust proxy", 1);
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Session-Id");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  // Temporary: log incoming MCP requests to diagnose AO platform issues
  if (req.path === "/mcp") {
    const body = JSON.stringify(req.body ?? "").slice(0, 300);
    process.stderr.write(`[req] ${req.method} /mcp accept="${req.headers["accept"] ?? ""}" ct="${req.headers["content-type"] ?? ""}" session="${req.headers["mcp-session-id"] ?? ""}" body=${body}\n`);
  }
  next();
});

// ─── MCP Streamable HTTP (stateful) ──────────────────────────────────────────

app.post("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId) {
    const existing = transports.get(sessionId);
    if (!existing) { res.status(404).json({ error: "Session not found" }); return; }
    await existing.handleRequest(req, res, req.body);
    return;
  }

  // New session
  let transport: StreamableHTTPServerTransport;
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id: string): void => { transports.set(id, transport); },
  });
  transport.onclose = () => transports.delete(transport.sessionId!);

  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
  await transport.handleRequest(req, res);
});

app.delete("/mcp", (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId) transports.delete(sessionId);
  res.status(204).end();
});

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "happy-path-mcp", version: SERVER_VERSION, uptime: process.uptime() });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  process.stderr.write(`\nhappy-path-mcp v${SERVER_VERSION} ready on :${PORT}\n`);
});

process.on("unhandledRejection", (reason) => {
  process.stderr.write(`[happy-path-mcp] Unhandled rejection: ${reason}\n`);
});

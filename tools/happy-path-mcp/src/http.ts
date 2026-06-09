#!/usr/bin/env node
import express, { type Request, type Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { SERVER_VERSION, TOOLS, handleTool, type Args } from "./tools.js";

const PORT = parseInt(process.env.PORT ?? "3002", 10);

function createServer() {
  const server = new Server(
    { name: "happy-path-mcp", version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    return handleTool(name, args as Args);
  });
  return server;
}

const app = express();
app.set("trust proxy", 1);
app.use(express.json());

// CORS
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Session-Id");
  if (_req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
});

// ─── MCP Streamable HTTP endpoint ────────────────────────────────────────────

app.post("/mcp", async (req: Request, res: Response) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
  res.on("finish", () => server.close());
});

app.get("/mcp", async (req: Request, res: Response) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createServer();
  await server.connect(transport);
  await transport.handleRequest(req, res);
  res.on("finish", () => server.close());
});

app.delete("/mcp", (_req: Request, res: Response) => {
  res.status(204).end();
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "happy-path-mcp", version: SERVER_VERSION, uptime: process.uptime() });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  process.stderr.write(
    `\nhappy-path-mcp v${SERVER_VERSION} ready\n` +
    `MCP endpoint: http://localhost:${PORT}/mcp\n` +
    `Health:       http://localhost:${PORT}/health\n\n`,
  );
});

process.on("unhandledRejection", (reason) => {
  process.stderr.write(`[happy-path-mcp] Unhandled rejection: ${reason}\n`);
});

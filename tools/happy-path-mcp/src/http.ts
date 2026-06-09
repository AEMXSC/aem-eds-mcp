#!/usr/bin/env node
import express, { type Request, type Response, type NextFunction } from "express";
import { SERVER_VERSION, TOOLS, handleTool, type Args } from "./tools.js";

const PORT = parseInt(process.env.PORT ?? "3002", 10);

const app = express();
app.set("trust proxy", 1);
app.use("/mcp", express.json());

// CORS
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Session-Id");
  if (_req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
});

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

function ok(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function err(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// ─── MCP endpoint ─────────────────────────────────────────────────────────────

app.post("/mcp", async (req: Request, res: Response) => {
  const body = req.body as { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };

  if (!body || body.jsonrpc !== "2.0" || !body.method) {
    res.status(400).json(err(body?.id ?? null, -32600, "Invalid Request"));
    return;
  }

  const { id, method, params } = body;

  try {
    switch (method) {
      case "initialize":
        res.json(ok(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "happy-path-mcp", version: SERVER_VERSION },
        }));
        break;

      case "notifications/initialized":
        res.status(200).end();
        break;

      case "ping":
        res.json(ok(id, {}));
        break;

      case "tools/list":
        res.json(ok(id, { tools: TOOLS }));
        break;

      case "tools/call": {
        const p = params as { name?: string; arguments?: Args } | undefined;
        if (!p?.name) { res.json(err(id, -32602, "Missing tool name")); break; }
        const result = await handleTool(p.name, p.arguments ?? {});
        res.json(ok(id, result));
        break;
      }

      default:
        res.json(err(id, -32601, `Method not found: ${method}`));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[mcp] error in ${method}: ${msg}\n`);
    res.json(err(id, -32603, `Internal error: ${msg}`));
  }
});

app.get("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({ error: "Use POST /mcp with JSON-RPC" });
});

app.delete("/mcp", (_req: Request, res: Response) => {
  res.status(204).end();
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", server: "happy-path-mcp", version: SERVER_VERSION, uptime: process.uptime() });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  process.stderr.write(
    `\nhappy-path-mcp v${SERVER_VERSION} ready\n` +
    `MCP endpoint: http://localhost:${PORT}/mcp\n` +
    `Health:       http://localhost:${PORT}/health\n\n`
  );
});

process.on("unhandledRejection", (reason) => {
  process.stderr.write(`[happy-path-mcp] Unhandled rejection: ${reason}\n`);
});

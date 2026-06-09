#!/usr/bin/env node
import express, { type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { SERVER_VERSION, TOOLS, handleTool, type Args } from "./tools.js";

const PORT = parseInt(process.env.PORT ?? "3002", 10);

const app = express();
app.set("trust proxy", 1);
app.use("/mcp", express.json({ limit: "200kb" }));
app.use("/token", express.urlencoded({ extended: false }));
app.use("/token", express.json());

// CORS
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Session-Id");
  if (_req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
});

// ─── Pass-through OAuth (no real auth — server is public) ─────────────────────
// Claude.ai requires OAuth handshake on all MCP connectors.
// Since this server needs no authentication, we complete the flow automatically.

const pendingCodes = new Map<string, string>(); // code → redirect_uri

app.get("/.well-known/oauth-authorization-server", (_req: Request, res: Response) => {
  const base = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["openid"],
    token_endpoint_auth_methods_supported: ["none"],
    resource: base,
  });
});

app.get("/.well-known/oauth-protected-resource", (_req: Request, res: Response) => {
  const base = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
  res.json({ resource: base, authorization_servers: [base] });
});

// Dynamic client registration — accept any client, return it back
app.use("/register", express.json());
app.post("/register", (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown> ?? {};
  const clientId = (body.client_id as string | undefined) ?? randomBytes(8).toString("hex");
  res.status(201).json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    redirect_uris: body.redirect_uris ?? [],
  });
});

// Auto-approve: immediately redirect back with a code — no login page needed
app.get("/authorize", (req: Request, res: Response) => {
  const { redirect_uri, state } = req.query as Record<string, string>;
  if (!redirect_uri) { res.status(400).send("Missing redirect_uri"); return; }

  const code = randomBytes(16).toString("hex");
  pendingCodes.set(code, redirect_uri);
  // expire codes after 5 minutes
  setTimeout(() => pendingCodes.delete(code), 5 * 60 * 1000);

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);
  res.redirect(redirectUrl.toString());
});

// Issue a static bearer token — no secret needed since server is open
app.post("/token", (req: Request, res: Response) => {
  const { code, grant_type } = req.body as Record<string, string>;
  if (grant_type !== "authorization_code" || !code || !pendingCodes.has(code)) {
    res.status(400).json({ error: "invalid_grant" });
    return;
  }
  pendingCodes.delete(code);
  // Static token — accepted but not checked (all requests are allowed)
  res.json({
    access_token: "happy-path-open-access",
    token_type: "bearer",
    expires_in: 3600 * 24 * 365, // 1 year
    scope: "openid",
  });
});

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

function ok(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function errRpc(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// ─── MCP endpoint ─────────────────────────────────────────────────────────────

app.post("/mcp", async (req: Request, res: Response) => {
  const body = req.body as { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };

  if (!body || body.jsonrpc !== "2.0" || !body.method) {
    res.status(400).json(errRpc(body?.id ?? null, -32600, "Invalid Request"));
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
        if (!p?.name) { res.json(errRpc(id, -32602, "Missing tool name")); break; }
        const result = await handleTool(p.name, p.arguments ?? {});
        res.json(ok(id, result));
        break;
      }

      default:
        res.json(errRpc(id, -32601, `Method not found: ${method}`));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[mcp] error in ${method}: ${msg}\n`);
    res.json(errRpc(id, -32603, `Internal error: ${msg}`));
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

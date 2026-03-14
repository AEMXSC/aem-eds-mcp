#!/usr/bin/env node
/**
 * hlx-admin MCP HTTP Server with Adobe IMS OAuth 2.1 proxy.
 *
 * Single-server architecture on Railway:
 *
 *   Claude Code → http://<railway-domain>/mcp  (plain HTTP via Railway proxy)
 *
 *   Discovery at /.well-known/oauth-authorization-server
 *   OAuth endpoints run on the same single Express server.
 */

import express, { type Request, type Response, type NextFunction } from "express";
import { createHash, randomBytes } from "node:crypto";
import { v4 as uuidv4 } from "uuid";

import {
  SERVER_VERSION,
  IMS_BASE,
  TOOLS,
  handleTool,
  generateCodeVerifier,
  generateCodeChallenge,
  exchangeCodeForToken,
  getClientCredentialsToken,
  setHttpMode,
  type Args,
} from "./tools.js";

// ─── Set HTTP mode flag ───────────────────────────────────────────────────────

setHttpMode(true);

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_PORT = parseInt(process.env.PORT ?? process.env.HLX_MCP_PORT ?? "3000", 10);
const IMS_CLIENT_ID = process.env.ADOBE_IMS_CLIENT_ID;
const IMS_CLIENT_SECRET = process.env.ADOBE_IMS_CLIENT_SECRET;

// Server-to-Server mode: use client credentials, no browser OAuth needed
const SERVER_TO_SERVER_MODE = !!(IMS_CLIENT_ID && IMS_CLIENT_SECRET);

// IMS OAuth mode: only used if ADOBE_IMS_CLIENT_ID is set (optional)
const IMS_OAUTH_ENABLED = !!IMS_CLIENT_ID && !IMS_CLIENT_SECRET;

// ─── In-memory session stores ─────────────────────────────────────────────────

interface PendingOAuthState {
  /** Session UUID from /login?session=<uuid> — carried through IMS redirect */
  sessionId: string;
  /** PKCE verifier for the IMS token exchange leg */
  imsCodeVerifier: string;
  /** Timestamp for stale-entry cleanup */
  createdAt: number;
}

interface AuthCode {
  imsToken: string;
  imsRefreshToken?: string;
  imsExpiresAt: number;
  claudeRedirectUri: string;
  claudeCodeChallenge: string;
  claudeState: string;
  createdAt: number;
}

interface Session {
  imsToken: string;
  imsRefreshToken?: string;
  imsExpiresAt: number;
  clientId: string;
  createdAt: number;
}

// State keyed by the ims_state we sent to IMS (so we can look it up in /callback)
const pendingOAuthStates = new Map<string, PendingOAuthState>();
// Auth codes we issued to Claude Code (short-lived, exchanged at /token)
const authCodes = new Map<string, AuthCode>();
// Session tokens issued to Claude Code (long-lived)
const sessions = new Map<string, Session>();

// Cleanup stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  const tenMin = 10 * 60 * 1000;
  for (const [k, v] of pendingOAuthStates) {
    if (now - v.createdAt > tenMin) pendingOAuthStates.delete(k);
  }
  for (const [k, v] of authCodes) {
    if (now - v.createdAt > tenMin) authCodes.delete(k);
  }
}, 10 * 60 * 1000);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function verifyPkce(codeVerifier: string, storedChallenge: string): boolean {
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  return computed === storedChallenge;
}

function jsonrpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function jsonrpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

/** Extract Bearer token from Authorization header */
function extractBearer(req: Request): string | null {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

/** Look up session and get IMS token, refreshing if needed. Returns null if invalid. */
async function resolveSessionToken(sessionToken: string): Promise<string | null> {
  const session = sessions.get(sessionToken);
  if (!session) return null;

  // Check if IMS token is still valid (with 60s buffer)
  if (Date.now() < session.imsExpiresAt - 60_000) {
    return session.imsToken;
  }

  // Try to refresh
  if (session.imsRefreshToken) {
    try {
      const res = await fetch(`${IMS_BASE}/ims/token/v3`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: IMS_CLIENT_ID!,
          refresh_token: session.imsRefreshToken,
        }),
      });
      if (res.ok) {
        const data = await res.json() as {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
        };
        session.imsToken = data.access_token;
        session.imsRefreshToken = data.refresh_token ?? session.imsRefreshToken;
        session.imsExpiresAt = Date.now() + data.expires_in * 1000;
        return session.imsToken;
      }
    } catch {
      // fall through to null
    }
  }

  // Session expired and couldn't refresh — remove it
  sessions.delete(sessionToken);
  return null;
}

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express();
app.set("trust proxy", 1); // Required: Railway terminates TLS at the edge and forwards plain HTTP

// Parse JSON bodies for MCP endpoint
app.use("/mcp", express.json());
app.use("/token", express.urlencoded({ extended: false }));
app.use("/token", express.json());

// CORS — Claude Code may call from different origin context
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Session-Id");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// ─── OAuth Discovery ─────────────────────────────────────────────────────────

app.get("/.well-known/oauth-authorization-server", (_req: Request, res: Response) => {
  const publicUrl = process.env.PUBLIC_URL ?? `http://localhost:${activePort}`;
  res.json({
    issuer: publicUrl,
    authorization_endpoint: `${publicUrl}/authorize`,
    token_endpoint: `${publicUrl}/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["openid", "AdobeID"],
    resource: publicUrl,
  });
});

app.get("/.well-known/oauth-protected-resource", (_req: Request, res: Response) => {
  const publicUrl = process.env.PUBLIC_URL ?? `http://localhost:${activePort}`;
  res.json({
    resource: publicUrl,
    authorization_servers: [publicUrl],
    scopes_supported: ["openid", "AdobeID"],
  });
});

// ─── Auth routes ──────────────────────────────────────────────────────────────

app.get("/login", (req: Request, res: Response) => {
  const sessionId = req.query.session as string | undefined;
  if (!sessionId) {
    res.status(400).send("Missing required query parameter: session");
    return;
  }

  if (!IMS_CLIENT_ID) {
    res.status(503).send("IMS OAuth not configured — set ADOBE_IMS_CLIENT_ID env var");
    return;
  }

  const imsCodeVerifier = generateCodeVerifier();
  const imsCodeChallenge = generateCodeChallenge(imsCodeVerifier);
  const imsState = randomBytes(16).toString("hex");
  const publicUrl = process.env.PUBLIC_URL ?? `http://localhost:${activePort}`;
  const redirectUri = `${publicUrl}/callback`;

  pendingOAuthStates.set(imsState, {
    sessionId,
    imsCodeVerifier,
    createdAt: Date.now(),
  });

  const authorizeUrl = new URL(`${IMS_BASE}/ims/authorize/v2`);
  authorizeUrl.searchParams.set("client_id", IMS_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid,AdobeID,additional_info.roles,read_organizations,offline_access");
  authorizeUrl.searchParams.set("code_challenge", imsCodeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("state", imsState);

  process.stderr.write(`[auth] /login initiated — session=${sessionId.slice(0, 8)}... state=${imsState.slice(0, 8)}...\n`);
  res.redirect(authorizeUrl.toString());
});

app.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) {
    const desc = req.query.error_description as string | undefined;
    res.status(400).send(`IMS login error: ${error}${desc ? ` — ${desc}` : ""}`);
    return;
  }

  if (!code || !state) {
    res.status(400).send("Missing required parameters: code and state are both required");
    return;
  }

  const pending = pendingOAuthStates.get(state);
  if (!pending) {
    res.status(400).send("Unknown or expired OAuth state. Please start the login flow again by visiting /login.");
    return;
  }
  pendingOAuthStates.delete(state);

  const publicUrl = process.env.PUBLIC_URL ?? `http://localhost:${activePort}`;
  const redirectUri = `${publicUrl}/callback`;

  try {
    const tokenData = await exchangeCodeForToken(
      IMS_CLIENT_ID!,
      code,
      pending.imsCodeVerifier,
      redirectUri,
    );

    sessions.set(pending.sessionId, {
      imsToken: tokenData.access_token,
      imsRefreshToken: tokenData.refresh_token,
      imsExpiresAt: Date.now() + tokenData.expires_in * 1000,
      clientId: IMS_CLIENT_ID!,
      createdAt: Date.now(),
    });

    process.stderr.write(`[auth] /callback success — session=${pending.sessionId.slice(0, 8)}... stored\n`);

    res.send(`<!DOCTYPE html>
<html><head><title>Login Successful</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px">
<h1>Login successful</h1>
<p>You are now authenticated. Return to Claude and retry your request.</p>
<p>Your session ID: <code style="background:#f0f0f0;padding:2px 6px">${pending.sessionId}</code></p>
<p>Use this as your Bearer token in the MCP client configuration.</p>
</body></html>`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[auth] /callback token exchange failed: ${msg}\n`);
    res.status(500).send(`Token exchange failed: ${msg}. Please try logging in again.`);
  }
});

// ─── MCP JSON-RPC endpoint ────────────────────────────────────────────────────

app.post("/mcp", async (req: Request, res: Response) => {
  let imsToken: string | null = null;

  if (SERVER_TO_SERVER_MODE) {
    // Client credentials: get token automatically, no session needed
    imsToken = await getClientCredentialsToken();
    if (!imsToken) {
      res.status(503).json({ error: "service_unavailable", error_description: "Failed to obtain client credentials token" });
      return;
    }
  } else if (IMS_OAUTH_ENABLED) {
    // IMS OAuth User Auth: require a valid Bearer session token
    const sessionToken = extractBearer(req);
    if (!sessionToken) {
      // No Bearer token — return 401 with login URL embedded
      const sessionId = uuidv4();
      const publicUrl = process.env.PUBLIC_URL ?? `http://localhost:${activePort}`;
      const loginUrl = `${publicUrl}/login?session=${sessionId}`;
      res.status(401)
        .setHeader("WWW-Authenticate", `Bearer realm="hlx-admin-mcp"`)
        .json({
          error: "unauthenticated",
          message: `Not authenticated. Visit this URL to log in:\n${loginUrl}`,
          login_url: loginUrl,
        });
      return;
    }

    imsToken = await resolveSessionToken(sessionToken);
    if (!imsToken) {
      // Session token invalid or expired — return 401 with fresh login URL
      const sessionId = uuidv4();
      const publicUrl = process.env.PUBLIC_URL ?? `http://localhost:${activePort}`;
      const loginUrl = `${publicUrl}/login?session=${sessionId}`;
      res.status(401)
        .setHeader("WWW-Authenticate", `Bearer realm="hlx-admin-mcp", error="invalid_token"`)
        .json({
          error: "session_expired",
          message: `Session expired or invalid. Visit this URL to log in again:\n${loginUrl}`,
          login_url: loginUrl,
        });
      return;
    }
  }
  // else: no ADOBE_IMS_CLIENT_ID → no IMS OAuth, rely entirely on stored HLX site token

  const body = req.body as {
    jsonrpc: string;
    id?: unknown;
    method?: string;
    params?: unknown;
  };

  if (!body || body.jsonrpc !== "2.0" || !body.method) {
    res.status(400).json(jsonrpcError(body?.id ?? null, -32600, "Invalid Request"));
    return;
  }

  const { id, method, params } = body;

  try {
    switch (method) {
      case "initialize": {
        res.json(jsonrpcResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "hlx-admin", version: SERVER_VERSION },
        }));
        break;
      }

      case "notifications/initialized": {
        // Notification — no response needed but return 200
        res.status(200).end();
        break;
      }

      case "ping": {
        res.json(jsonrpcResult(id, {}));
        break;
      }

      case "tools/list": {
        res.json(jsonrpcResult(id, { tools: TOOLS }));
        break;
      }

      case "tools/call": {
        const p = params as { name?: string; arguments?: Args } | undefined;
        if (!p?.name) {
          res.json(jsonrpcError(id, -32602, "Missing tool name"));
          break;
        }
        const result = await handleTool(p.name, p.arguments ?? {}, imsToken ?? undefined);
        res.json(jsonrpcResult(id, result));
        break;
      }

      default: {
        res.json(jsonrpcError(id, -32601, `Method not found: ${method}`));
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[mcp] Unhandled error in ${method}: ${message}\n`);
    res.json(jsonrpcError(id, -32603, `Internal error: ${message}`));
  }
});

// SSE endpoint — return 405 (not supported in this implementation)
app.get("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({
    error: "method_not_allowed",
    error_description: "SSE transport not supported. Use POST /mcp with JSON-RPC.",
  });
});

// Session close
app.delete("/mcp", (req: Request, res: Response) => {
  const sessionToken = extractBearer(req);
  if (sessionToken) {
    sessions.delete(sessionToken);
    process.stderr.write(`[mcp] Session closed: ${sessionToken.slice(0, 8)}...\n`);
  }
  res.status(204).end();
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    server: "hlx-admin-mcp",
    version: SERVER_VERSION,
    mode: SERVER_TO_SERVER_MODE ? "server-to-server" : IMS_OAUTH_ENABLED ? "ims-oauth" : "aem-cli",
    port: activePort,
    sessions: sessions.size,
    uptime: process.uptime(),
  });
});

// ─── Start server with port fallback ─────────────────────────────────────────

let activePort = BASE_PORT;

async function tryListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = app.listen(port, "0.0.0.0", () => {
      activePort = port;
      resolve(true);
    });
    srv.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(false);
      } else {
        process.stderr.write(`[hlx-admin-mcp] Server error: ${err.message}\n`);
        resolve(false);
      }
    });
  });
}

async function main() {
  // Start MCP HTTP server
  const ok = await tryListen(BASE_PORT);
  if (!ok) {
    process.stderr.write(`[hlx-admin-mcp] ERROR: Could not bind to port ${BASE_PORT}.\n`);
    process.exit(1);
  }

  const mode = SERVER_TO_SERVER_MODE
    ? "Server-to-Server (client credentials — no browser login needed)"
    : IMS_OAUTH_ENABLED
    ? "OAuth User Auth (Adobe IMS via HTTPS callback)"
    : "AEM CLI login (call da_login tool with org + site to authenticate)";

  process.stderr.write(
    `\n[hlx-admin-mcp] HTTP MCP server v${SERVER_VERSION} ready\n` +
    `[hlx-admin-mcp] MCP endpoint:    http://localhost:${activePort}/mcp\n` +
    `[hlx-admin-mcp] Auth mode:       ${mode}\n` +
    `[hlx-admin-mcp] Health check:    http://localhost:${activePort}/health\n\n`
  );
}

// Catch unhandled rejections
process.on("unhandledRejection", (reason) => {
  process.stderr.write(`[hlx-admin-mcp] Unhandled rejection: ${reason}\n`);
});

main().catch((err) => {
  process.stderr.write(`[hlx-admin-mcp] Fatal: ${err}\n`);
  process.exit(1);
});

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
  /** Claude Code's redirect URI */
  claudeRedirectUri: string;
  /** PKCE challenge from Claude Code (for us to verify at /token) */
  claudeCodeChallenge: string;
  /** state parameter from Claude Code */
  claudeState: string;
  /** PKCE verifier we used for the IMS leg */
  imsCodeVerifier: string;
  /** Timestamp for cleanup */
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
  const mcpBase = `http://localhost:${activePort}`;
  const oauthBase = `https://localhost:${OAUTH_PORT}`;
  res.json({
    issuer: oauthBase,
    authorization_endpoint: `${oauthBase}/authorize`,
    token_endpoint: `${oauthBase}/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["openid", "AdobeID"],
    // MCP resource server is on plain HTTP
    resource: mcpBase,
  });
});

app.get("/.well-known/oauth-protected-resource", (_req: Request, res: Response) => {
  const oauthBase = `https://localhost:${OAUTH_PORT}`;
  res.json({
    resource: `http://localhost:${activePort}`,
    authorization_servers: [oauthBase],
    scopes_supported: ["openid", "AdobeID"],
  });
});

// ─── HTTPS OAuth app (separate server on OAUTH_PORT) ─────────────────────────
// Adobe IMS requires HTTPS redirect URIs. The OAuth endpoints run on a
// self-signed HTTPS server while the MCP endpoint stays on plain HTTP.

const oauthApp = express();
oauthApp.use(express.urlencoded({ extended: false }));
oauthApp.use(express.json());
oauthApp.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (_req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
});

// Trust-prompt page — user visits https://localhost:3443 once to accept cert
oauthApp.get("/", (_req: Request, res: Response) => {
  res.send(
    `<html><body style="font-family:sans-serif;padding:2rem;max-width:600px">` +
    `<h2>hlx-admin OAuth Server</h2>` +
    `<p>✅ Self-signed certificate accepted. You can close this tab.</p>` +
    `<p>Return to Claude Code and reconnect to start the Adobe login flow.</p>` +
    `</body></html>`
  );
});

// ─── OAuth /authorize ─────────────────────────────────────────────────────────

oauthApp.get("/authorize", (req: Request, res: Response) => {
  const {
    response_type,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    state,
  } = req.query as Record<string, string>;

  if (response_type !== "code") {
    res.status(400).json({ error: "unsupported_response_type" });
    return;
  }
  if (!redirect_uri || !code_challenge || !state) {
    res.status(400).json({ error: "invalid_request", error_description: "Missing required params" });
    return;
  }
  if (code_challenge_method && code_challenge_method !== "S256") {
    res.status(400).json({ error: "invalid_request", error_description: "Only S256 supported" });
    return;
  }

  // Generate PKCE for the IMS leg (separate from Claude Code's PKCE)
  const imsCodeVerifier = generateCodeVerifier();
  const imsCodeChallenge = generateCodeChallenge(imsCodeVerifier);
  const imsState = randomBytes(16).toString("hex");

  // Store the mapping so /callback can find it
  pendingOAuthStates.set(imsState, {
    claudeRedirectUri: redirect_uri,
    claudeCodeChallenge: code_challenge,
    claudeState: state,
    imsCodeVerifier,
    createdAt: Date.now(),
  });

  // Build IMS authorization URL
  const imsAuthUrl = new URL(`${IMS_BASE}/ims/authorize/v2`);
  imsAuthUrl.searchParams.set("client_id", IMS_CLIENT_ID!);
  imsAuthUrl.searchParams.set("redirect_uri", OAUTH_CALLBACK_URI);
  imsAuthUrl.searchParams.set("response_type", "code");
  imsAuthUrl.searchParams.set("scope", "openid AdobeID additional_info.roles");
  imsAuthUrl.searchParams.set("state", imsState);
  imsAuthUrl.searchParams.set("code_challenge", imsCodeChallenge);
  imsAuthUrl.searchParams.set("code_challenge_method", "S256");

  process.stderr.write(`[oauth] Redirecting to IMS. ims_state=${imsState}\n`);
  res.redirect(302, imsAuthUrl.toString());
});

// ─── OAuth /callback (from Adobe IMS) ────────────────────────────────────────

oauthApp.get("/callback", async (req: Request, res: Response) => {
  const { code, state: imsState, error } = req.query as Record<string, string>;

  const pending = pendingOAuthStates.get(imsState);
  if (!pending) {
    res.status(400).send(
      `<html><body style="font-family:sans-serif;padding:2rem">` +
      `<h2>Authentication Error</h2>` +
      `<p>Unknown or expired state. Please try connecting again.</p>` +
      `</body></html>`
    );
    return;
  }

  pendingOAuthStates.delete(imsState);

  if (error || !code) {
    // Redirect to Claude Code with error
    const errUrl = new URL(pending.claudeRedirectUri);
    errUrl.searchParams.set("error", error ?? "access_denied");
    errUrl.searchParams.set("state", pending.claudeState);
    res.redirect(302, errUrl.toString());
    return;
  }

  // Exchange IMS code for IMS token
  let imsTokenData: { access_token: string; refresh_token?: string; expires_in: number };
  try {
    imsTokenData = await exchangeCodeForToken(
      IMS_CLIENT_ID!,
      code,
      pending.imsCodeVerifier,
      OAUTH_CALLBACK_URI
    );
  } catch (err) {
    process.stderr.write(`[oauth] IMS token exchange failed: ${err}\n`);
    const errUrl = new URL(pending.claudeRedirectUri);
    errUrl.searchParams.set("error", "server_error");
    errUrl.searchParams.set("state", pending.claudeState);
    res.redirect(302, errUrl.toString());
    return;
  }

  // Generate our auth code to give to Claude Code
  const ourAuthCode = uuidv4();
  authCodes.set(ourAuthCode, {
    imsToken: imsTokenData.access_token,
    imsRefreshToken: imsTokenData.refresh_token,
    imsExpiresAt: Date.now() + imsTokenData.expires_in * 1000,
    claudeRedirectUri: pending.claudeRedirectUri,
    claudeCodeChallenge: pending.claudeCodeChallenge,
    claudeState: pending.claudeState,
    createdAt: Date.now(),
  });

  process.stderr.write(`[oauth] IMS auth complete. Redirecting back to Claude Code.\n`);

  // Redirect to Claude Code's redirect_uri with our auth code
  const claudeCallbackUrl = new URL(pending.claudeRedirectUri);
  claudeCallbackUrl.searchParams.set("code", ourAuthCode);
  claudeCallbackUrl.searchParams.set("state", pending.claudeState);
  res.redirect(302, claudeCallbackUrl.toString());
});

// ─── OAuth /token ─────────────────────────────────────────────────────────────

oauthApp.post("/token", async (req: Request, res: Response) => {
  const {
    grant_type,
    code,
    code_verifier,
  } = req.body as Record<string, string>;

  if (grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }
  if (!code || !code_verifier) {
    res.status(400).json({ error: "invalid_request", error_description: "Missing code or code_verifier" });
    return;
  }

  const authCode = authCodes.get(code);
  if (!authCode) {
    res.status(400).json({ error: "invalid_grant", error_description: "Unknown or expired auth code" });
    return;
  }

  // Verify PKCE
  if (!verifyPkce(code_verifier, authCode.claudeCodeChallenge)) {
    res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
    return;
  }

  authCodes.delete(code);

  // Create session
  const sessionToken = uuidv4();
  sessions.set(sessionToken, {
    imsToken: authCode.imsToken,
    imsRefreshToken: authCode.imsRefreshToken,
    imsExpiresAt: authCode.imsExpiresAt,
    clientId: IMS_CLIENT_ID!,
    createdAt: Date.now(),
  });

  process.stderr.write(`[oauth] Session created. token=${sessionToken.slice(0, 8)}...\n`);

  res.json({
    access_token: sessionToken,
    token_type: "Bearer",
    expires_in: 86400,
  });
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
    // IMS OAuth User Auth: accept Bearer session token if present
    const sessionToken = extractBearer(req);
    if (sessionToken) {
      imsToken = await resolveSessionToken(sessionToken);
      // If session token invalid, fall through to stored HLX token (null imsToken)
    }
    // No Bearer token → allow through; tool handlers will use stored HLX site token
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
    const srv = app.listen(port, "127.0.0.1", () => {
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

async function startOAuthHttpsServer(): Promise<void> {
  // Auto-generate self-signed cert for localhost
  const pems = await (selfsigned.generate(
    [{ name: "commonName", value: "localhost" }],
    { keySize: 2048 }
  ) as unknown as Promise<{ private: string; cert: string }>);

  return new Promise((resolve, reject) => {
    const httpsServer = createHttpsServer({ key: pems.private, cert: pems.cert }, oauthApp);
    httpsServer.listen(OAUTH_PORT, "127.0.0.1", () => {
      process.stderr.write(`[hlx-admin-mcp] OAuth HTTPS server on https://localhost:${OAUTH_PORT}\n`);
      resolve();
    });
    httpsServer.on("error", (err: NodeJS.ErrnoException) => {
      reject(new Error(`OAuth HTTPS server failed on port ${OAUTH_PORT}: ${err.message}`));
    });
  });
}

async function main() {
  // Start MCP HTTP server
  for (let port = BASE_PORT; port <= BASE_PORT + 10; port++) {
    const ok = await tryListen(port);
    if (ok) break;
    if (port === BASE_PORT + 10) {
      process.stderr.write(`[hlx-admin-mcp] ERROR: Could not bind to any port in range ${BASE_PORT}-${BASE_PORT + 10}.\n`);
      process.exit(1);
    }
  }

  const mode = SERVER_TO_SERVER_MODE
    ? "Server-to-Server (client credentials — no browser login needed)"
    : IMS_OAUTH_ENABLED
    ? "OAuth User Auth (Adobe IMS via HTTPS callback)"
    : "AEM CLI login (call da_login tool with org + site to authenticate)";

  if (IMS_OAUTH_ENABLED) {
    // Start HTTPS OAuth server for IMS callback
    try {
      await startOAuthHttpsServer();
    } catch (err) {
      process.stderr.write(`[hlx-admin-mcp] WARNING: ${err}\n`);
      process.stderr.write(`[hlx-admin-mcp] IMS OAuth browser flow will not work without the HTTPS server.\n`);
    }
  }

  process.stderr.write(
    `\n[hlx-admin-mcp] HTTP MCP server v${SERVER_VERSION} ready\n` +
    `[hlx-admin-mcp] MCP endpoint:    http://localhost:${activePort}/mcp\n` +
    `[hlx-admin-mcp] Auth mode:       ${mode}\n` +
    (IMS_CLIENT_ID ? `[hlx-admin-mcp] IMS Client ID:   ${IMS_CLIENT_ID}\n` : "") +
    (IMS_OAUTH_ENABLED ?
      `[hlx-admin-mcp] OAuth callback:  ${OAUTH_CALLBACK_URI}\n` +
      `[hlx-admin-mcp] ⚠️  First run: visit https://localhost:${OAUTH_PORT} in your browser\n` +
      `[hlx-admin-mcp]    and accept the self-signed certificate warning once.\n` : ""
    ) +
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

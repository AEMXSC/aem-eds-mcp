import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer as createHttpServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { exec } from "node:child_process";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// ─── Constants ───────────────────────────────────────────────────────────────

export const ADMIN_BASE = "https://admin.hlx.page";
export const DA_BASE = "https://content.da.live";   // read (GET)
export const DA_ADMIN_BASE = "https://admin.da.live"; // write (PUT)
export const IMS_BASE = "https://ims-na1.adobelogin.com";
export const SERVER_VERSION = "1.2.0";
export const TOKEN_DIR = path.join(os.homedir(), ".hlx-admin-mcp");
export const TOKEN_FILE = path.join(TOKEN_DIR, "tokens.json");
export const HLX_SITE_TOKEN_FILE = path.join(TOKEN_DIR, "hlx-site-token.json");
export const CALLBACK_PORT = parseInt(process.env.IMS_CALLBACK_PORT ?? "8765", 10);
export const CALLBACK_URI = `http://localhost:${CALLBACK_PORT}/callback`;
export const HLX_LOGIN_PORT = parseInt(process.env.HLX_LOGIN_PORT ?? "8767", 10);
export const HLX_LOGIN_CALLBACK = `http://localhost:${HLX_LOGIN_PORT}/.aem/cli/login/ack`;

// Global flag — set to true by http.ts before any tool calls
export let httpMode = false;
export function setHttpMode(val: boolean) {
  httpMode = val;
}

// ─── Token storage ───────────────────────────────────────────────────────────

export interface TokenStore {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // unix ms
  client_id: string;
}

export interface HlxSiteTokenStore {
  token: string;
  org: string;
  site: string;
  saved_at: number; // unix ms
}

export function loadTokens(): TokenStore | null {
  try {
    const raw = fs.readFileSync(TOKEN_FILE, "utf8");
    return JSON.parse(raw) as TokenStore;
  } catch {
    return null;
  }
}

export function saveTokens(store: TokenStore): void {
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(store, null, 2), "utf8");
}

export function clearTokens(): void {
  try { fs.unlinkSync(TOKEN_FILE); } catch { /* ok */ }
}

export function loadHlxSiteToken(): HlxSiteTokenStore | null {
  try {
    const raw = fs.readFileSync(HLX_SITE_TOKEN_FILE, "utf8");
    return JSON.parse(raw) as HlxSiteTokenStore;
  } catch {
    return null;
  }
}

export function saveHlxSiteToken(store: HlxSiteTokenStore): void {
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
  fs.writeFileSync(HLX_SITE_TOKEN_FILE, JSON.stringify(store, null, 2), "utf8");
}

export function clearHlxSiteToken(): void {
  try { fs.unlinkSync(HLX_SITE_TOKEN_FILE); } catch { /* ok */ }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

// ─── Client Credentials (Server-to-Server) ───────────────────────────────────

interface CachedToken {
  access_token: string;
  expires_at: number;
}
let _cachedClientCredToken: CachedToken | null = null;

/**
 * Gets an IMS token via OAuth Server-to-Server client credentials flow.
 * Requires ADOBE_IMS_CLIENT_ID + ADOBE_IMS_CLIENT_SECRET env vars.
 * Token is cached in memory and auto-refreshed before expiry.
 */
export async function getClientCredentialsToken(): Promise<string | null> {
  const clientId = process.env.ADOBE_IMS_CLIENT_ID;
  const clientSecret = process.env.ADOBE_IMS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // Return cached token if still valid (60s buffer)
  if (_cachedClientCredToken && Date.now() < _cachedClientCredToken.expires_at - 60_000) {
    return _cachedClientCredToken.access_token;
  }

  try {
    const res = await fetch(`${IMS_BASE}/ims/token/v3`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "openid,AdobeID,additional_info.roles,read_organizations",
      }),
    });
    if (!res.ok) {
      process.stderr.write(`[hlx-admin-mcp] Client credentials token failed: ${res.status}\n`);
      return null;
    }
    const data = await res.json() as { access_token: string; expires_in: number };
    _cachedClientCredToken = {
      access_token: data.access_token,
      expires_at: Date.now() + data.expires_in * 1000,
    };
    process.stderr.write(`[hlx-admin-mcp] Client credentials token acquired (expires in ${data.expires_in}s)\n`);
    return data.access_token;
  } catch (err) {
    process.stderr.write(`[hlx-admin-mcp] Client credentials error: ${err}\n`);
    return null;
  }
}

/**
 * Returns an IMS access token, refreshing if needed.
 * Priority: override → IMS_ACCESS_TOKEN env → client credentials → stored file token
 * In HTTP mode, callers pass the session token directly as `override`.
 */
export async function getImsToken(override?: string): Promise<string | null> {
  if (override) return override;

  // 1) Direct env override
  if (process.env.IMS_ACCESS_TOKEN) return process.env.IMS_ACCESS_TOKEN;

  // 2) Server-to-Server client credentials (no browser needed)
  const ccToken = await getClientCredentialsToken();
  if (ccToken) return ccToken;

  const store = loadTokens();
  if (!store) return null;

  // 3) Stored token still valid (with 60s buffer)
  if (Date.now() < store.expires_at - 60_000) return store.access_token;

  // 4) Try refresh
  if (store.refresh_token) {
    const refreshed = await refreshImsToken(store.client_id, store.refresh_token);
    if (refreshed) return refreshed;
  }

  return null;
}

export async function refreshImsToken(
  clientId: string,
  refreshToken: string
): Promise<string | null> {
  try {
    const res = await fetch(`${IMS_BASE}/ims/token/v3`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    const store = loadTokens()!;
    saveTokens({
      ...store,
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? store.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
    });
    return data.access_token;
  } catch {
    return null;
  }
}

/** HLX site token from env or stored file (admin API + DA) */
export function getHlxToken(): string | undefined {
  // Env vars take priority over stored file token
  if (process.env.HLX_API_KEY) return process.env.HLX_API_KEY;
  if (process.env.HLX_AUTH_TOKEN) return process.env.HLX_AUTH_TOKEN;
  // Stored site token from da_login (aem-cli flow)
  const stored = loadHlxSiteToken();
  return stored?.token ?? undefined;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

export interface AdminResponse {
  status: number;
  ok: boolean;
  data: unknown;
}

export async function adminRequest(
  method: string,
  urlPath: string,
  body?: unknown,
  imsOverride?: string
): Promise<AdminResponse> {
  const imsToken = await getImsToken(imsOverride);
  const hlxToken = getHlxToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": `hlx-admin-mcp/${SERVER_VERSION}`,
  };
  // Auth priority: IMS Bearer > HLX site token (Bearer) > API key (X-Auth-Token) > legacy HLX token
  if (imsToken) {
    headers["Authorization"] = `Bearer ${imsToken}`;
  } else if (hlxToken && !process.env.HLX_API_KEY) {
    // Site token from da_login (aem-cli flow) — use Bearer format
    headers["Authorization"] = `Bearer ${hlxToken}`;
  } else if (process.env.HLX_API_KEY) {
    headers["X-Auth-Token"] = process.env.HLX_API_KEY;
  } else if (process.env.HLX_AUTH_TOKEN) {
    // Legacy plain token format
    headers["Authorization"] = `token ${process.env.HLX_AUTH_TOKEN}`;
  }

  const response = await fetch(`${ADMIN_BASE}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: unknown;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    data = await response.json().catch(() => ({}));
  } else {
    data = await response.text().catch(() => "");
  }

  return { status: response.status, ok: response.ok, data };
}

export async function daRequest(
  method: string,
  urlPath: string,
  body?: string,
  contentType = "text/html",
  imsOverride?: string
): Promise<AdminResponse> {
  // Try IMS token first, fall back to HLX site token from da_login
  const imsToken = await getImsToken(imsOverride);
  const hlxSiteToken = getHlxToken();
  const bearerToken = imsToken ?? hlxSiteToken;

  if (!bearerToken) {
    return {
      status: 401,
      ok: false,
      data: "Not authenticated. Run da_login first (provide org and site parameters).",
    };
  }

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${bearerToken}`,
    "User-Agent": `hlx-admin-mcp/${SERVER_VERSION}`,
  };

  let fetchBody: BodyInit | undefined;
  if (body !== undefined && method !== "GET") {
    // DA source API expects multipart/form-data with a 'data' blob
    const form = new FormData();
    form.append("data", new Blob([body], { type: contentType }));
    fetchBody = form;
    // Don't set Content-Type — fetch sets it with boundary automatically
  }

  // Writes go to admin.da.live; reads go to content.da.live
  const base = method !== "GET" && method !== "HEAD" ? DA_ADMIN_BASE : DA_BASE;
  const response = await fetch(`${base}${urlPath}`, {
    method,
    headers,
    body: fetchBody,
  });

  let data: unknown;
  const ct = response.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    data = await response.json().catch(() => ({}));
  } else {
    data = await response.text().catch(() => "");
  }

  return { status: response.status, ok: response.ok, data };
}

export function formatResult(result: AdminResponse, successMsg?: string): string {
  if (result.ok) {
    const prefix = successMsg ? `${successMsg}\n\n` : "";
    const body =
      typeof result.data === "string"
        ? result.data
        : JSON.stringify(result.data, null, 2);
    return `${prefix}${body}`;
  }
  return `Error ${result.status}:\n${
    typeof result.data === "string"
      ? result.data
      : JSON.stringify(result.data, null, 2)
  }`;
}

// ─── OAuth Authorization Code + PKCE ─────────────────────────────────────────

export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function openBrowser(url: string): void {
  // Windows: start, macOS: open, Linux: xdg-open
  const cmd =
    process.platform === "win32"
      ? `cmd /c start "" "${url}"`
      : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) process.stderr.write(`Could not open browser: ${err.message}\n`);
  });
}

export interface PendingAuth {
  code_verifier: string;
  state: string;
  client_id: string;
  resolve: (code: string | null) => void;
}

export let pendingAuth: PendingAuth | null = null;
export let callbackServerStarted = false;

export function setPendingAuth(auth: PendingAuth | null) {
  pendingAuth = auth;
}

// ─── Persistent HLX login callback server ────────────────────────────────────
// Runs on a fixed port (HLX_LOGIN_PORT) for the lifetime of the process.
// da_login always points Adobe to this port so the user can click Send any time.

let _hlxLoginServerStarted = false;
export let _pendingLoginContext: { org: string; site: string } | null = null;
export function setPendingLoginContext(ctx: { org: string; site: string } | null) {
  _pendingLoginContext = ctx;
}

export function ensureHlxLoginServer(): void {
  if (_hlxLoginServerStarted) return;
  _hlxLoginServerStarted = true;

  const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  const srv = createHttpServer((req, res) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://localhost:${HLX_LOGIN_PORT}`);
    if (url.pathname !== "/.aem/cli/login/ack") {
      res.writeHead(404, CORS_HEADERS);
      res.end("Not found");
      return;
    }

    // Token may arrive as query param (GET/POST) or in POST body
    let token = url.searchParams.get("token");

    const finishCapture = (tok: string) => {
      const ctx = _pendingLoginContext ?? { org: "unknown", site: "unknown" };
      saveHlxSiteToken({ token: tok, org: ctx.org, site: ctx.site, saved_at: Date.now() });
      _pendingLoginContext = null;
      process.stderr.write(`[da_login] Token captured for ${ctx.org}/${ctx.site}\n`);
      res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    };

    if (!token && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      req.on("end", () => {
        process.stderr.write(`[da_login] POST ping from Adobe page. body=${body.slice(0, 100)}\n`);
        // Try to find token in body (just in case)
        try {
          const params = new URLSearchParams(body);
          token = params.get("token") ?? params.get("siteToken") ?? null;
        } catch { /* ignore */ }
        if (!token) {
          try {
            const j = JSON.parse(body) as Record<string, unknown>;
            token = (j.token ?? j.siteToken ?? j.site_token ?? j.access_token ?? null) as string | null;
          } catch { /* ignore */ }
        }
        if (token) {
          finishCapture(token);
        } else {
          // POST is a "ping" — respond 200 OK, token will arrive via GET navigation
          process.stderr.write(`[da_login] POST ping acknowledged — waiting for GET with token...\n`);
          res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        }
      });
      return;
    }

    if (!token) {
      process.stderr.write(`[da_login] GET with no token. URL: ${req.url}\n`);
      // Still return 200 so page JS doesn't error
      res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/json" });
      res.end(JSON.stringify({ waiting: true }));
      return;
    }

    finishCapture(token);
  });

  srv.listen(HLX_LOGIN_PORT, "127.0.0.1", () => {
    process.stderr.write(`[da_login] Persistent callback server on http://localhost:${HLX_LOGIN_PORT}\n`);
  });

  srv.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      process.stderr.write(`[da_login] Port ${HLX_LOGIN_PORT} already in use — callback server skipped.\n`);
    } else {
      process.stderr.write(`[da_login] Callback server error: ${err.message}\n`);
    }
    _hlxLoginServerStarted = false;
  });
}

export async function exchangeCodeForToken(
  clientId: string,
  code: string,
  codeVerifier: string,
  redirectUri?: string
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const res = await fetch(`${IMS_BASE}/ims/token/v3`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri ?? CALLBACK_URI,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const TOOLS: Tool[] = [
  // ── Auth ──────────────────────────────────────────────────────────────────
  {
    name: "da_login",
    description:
      "Authenticate with Adobe via the AEM CLI login flow. Opens your browser to the Adobe login page for the specified org/site. No Adobe Developer Console credential required — uses the built-in aem-cli client ID.",
    inputSchema: {
      type: "object",
      properties: {
        org: {
          type: "string",
          description: "Adobe org / GitHub owner (e.g. aemxsc)",
        },
        site: {
          type: "string",
          description: "Site / repo name (e.g. xscteamsite)",
        },
      },
      required: ["org", "site"],
    },
  },
  {
    name: "da_logout",
    description: "Remove the locally stored Adobe IMS tokens.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "da_whoami",
    description: "Show the currently authenticated Adobe IMS user profile.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // ── DA content ────────────────────────────────────────────────────────────
  {
    name: "da_list",
    description: "List files and folders inside a Document Authoring (DA) directory.",
    inputSchema: {
      type: "object",
      properties: {
        org: { type: "string", description: "Adobe org / GitHub owner (e.g. aemxsc)" },
        site: { type: "string", description: "Site / repo name (e.g. xscteamsite)" },
        folder: {
          type: "string",
          description: "Folder path relative to site root (default: /)",
          default: "/",
        },
      },
      required: ["org", "site"],
    },
  },
  {
    name: "da_get_content",
    description:
      "Read the HTML source of a Document Authoring page. Returns raw HTML that can be inspected and modified.",
    inputSchema: {
      type: "object",
      properties: {
        org: { type: "string", description: "Adobe org / GitHub owner" },
        site: { type: "string", description: "Site / repo name" },
        path: {
          type: "string",
          description: "Page path starting with / (e.g. /index or /about)",
        },
      },
      required: ["org", "site", "path"],
    },
  },
  {
    name: "da_update_content",
    description:
      "Write new HTML content to a Document Authoring page. The content replaces the entire page source. After a successful write the page is automatically previewed via the Admin API.",
    inputSchema: {
      type: "object",
      properties: {
        org: { type: "string", description: "Adobe org / GitHub owner" },
        site: { type: "string", description: "Site / repo name" },
        path: {
          type: "string",
          description: "Page path starting with / (e.g. /index)",
        },
        html: {
          type: "string",
          description: "Full HTML content to write (the entire page source)",
        },
        publish: {
          type: "boolean",
          description: "Also publish to live CDN after updating (default: false)",
          default: false,
        },
      },
      required: ["org", "site", "path", "html"],
    },
  },

  // ── Admin API ─────────────────────────────────────────────────────────────
  {
    name: "hlx_status",
    description:
      "Get the preview and live publish status of an AEM EDS page. Returns lastModified, sourceLocation, permissions, and links.",
    inputSchema: {
      type: "object",
      properties: {
        org: { type: "string", description: "Adobe org / GitHub owner (e.g. aemxsc)" },
        site: { type: "string", description: "Site / repo name (e.g. xscteamsite)" },
        ref: { type: "string", description: "Git branch (default: main)", default: "main" },
        path: { type: "string", description: "Page path starting with / (e.g. /index)" },
      },
      required: ["org", "site", "path"],
    },
  },
  {
    name: "hlx_preview",
    description:
      "Trigger a preview update for a single AEM EDS page. Pulls the latest content from the authoring source (DA/SharePoint/Drive) and updates the preview environment.",
    inputSchema: {
      type: "object",
      properties: {
        org: { type: "string", description: "Adobe org / GitHub owner" },
        site: { type: "string", description: "Site / repo name" },
        ref: { type: "string", description: "Git branch (default: main)", default: "main" },
        path: { type: "string", description: "Page path starting with /" },
      },
      required: ["org", "site", "path"],
    },
  },
  {
    name: "hlx_publish",
    description:
      "Publish an AEM EDS page to the live CDN. The page must have been previewed first.",
    inputSchema: {
      type: "object",
      properties: {
        org: { type: "string", description: "Adobe org / GitHub owner" },
        site: { type: "string", description: "Site / repo name" },
        ref: { type: "string", description: "Git branch (default: main)", default: "main" },
        path: { type: "string", description: "Page path starting with /" },
      },
      required: ["org", "site", "path"],
    },
  },
  {
    name: "hlx_unpublish",
    description: "Remove an AEM EDS page from the live CDN (un-publish it).",
    inputSchema: {
      type: "object",
      properties: {
        org: { type: "string", description: "Adobe org / GitHub owner" },
        site: { type: "string", description: "Site / repo name" },
        ref: { type: "string", description: "Git branch (default: main)", default: "main" },
        path: { type: "string", description: "Page path starting with /" },
      },
      required: ["org", "site", "path"],
    },
  },
  {
    name: "hlx_delete_preview",
    description: "Delete the preview version of an AEM EDS page.",
    inputSchema: {
      type: "object",
      properties: {
        org: { type: "string", description: "Adobe org / GitHub owner" },
        site: { type: "string", description: "Site / repo name" },
        ref: { type: "string", description: "Git branch (default: main)", default: "main" },
        path: { type: "string", description: "Page path starting with /" },
      },
      required: ["org", "site", "path"],
    },
  },
  {
    name: "hlx_bulk_preview",
    description:
      "Trigger preview updates for multiple AEM EDS pages in one job. Returns a job ID for tracking.",
    inputSchema: {
      type: "object",
      properties: {
        org: { type: "string", description: "Adobe org / GitHub owner" },
        site: { type: "string", description: "Site / repo name" },
        ref: { type: "string", description: "Git branch (default: main)", default: "main" },
        paths: { type: "array", items: { type: "string" }, description: "Array of page paths" },
        delete: { type: "boolean", description: "Delete previews instead of updating", default: false },
      },
      required: ["org", "site", "paths"],
    },
  },
  {
    name: "hlx_bulk_publish",
    description:
      "Publish multiple AEM EDS pages to the live CDN in one job. Returns a job ID for tracking.",
    inputSchema: {
      type: "object",
      properties: {
        org: { type: "string", description: "Adobe org / GitHub owner" },
        site: { type: "string", description: "Site / repo name" },
        ref: { type: "string", description: "Git branch (default: main)", default: "main" },
        paths: { type: "array", items: { type: "string" }, description: "Array of page paths" },
        delete: { type: "boolean", description: "Un-publish pages instead", default: false },
      },
      required: ["org", "site", "paths"],
    },
  },
  {
    name: "hlx_job_status",
    description: "Check the status of a bulk preview or publish job by job ID.",
    inputSchema: {
      type: "object",
      properties: {
        org: { type: "string", description: "Adobe org / GitHub owner" },
        site: { type: "string", description: "Site / repo name" },
        ref: { type: "string", description: "Git branch (default: main)", default: "main" },
        jobId: { type: "string", description: "Job ID returned by a bulk operation" },
        details: { type: "boolean", description: "Fetch per-resource details", default: false },
      },
      required: ["org", "site", "jobId"],
    },
  },
  {
    name: "hlx_cache_purge",
    description: "Purge the live CDN cache for a specific AEM EDS page.",
    inputSchema: {
      type: "object",
      properties: {
        org: { type: "string", description: "Adobe org / GitHub owner" },
        site: { type: "string", description: "Site / repo name" },
        ref: { type: "string", description: "Git branch (default: main)", default: "main" },
        path: { type: "string", description: "Page path starting with /" },
      },
      required: ["org", "site", "path"],
    },
  },
  {
    name: "hlx_profile",
    description:
      "Return the authenticated user profile and available permissions for admin.hlx.page.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "hlx_create_apikey",
    description:
      "Create a persistent API key for a site (valid 1 year). Requires admin-level auth (IMS token or existing admin key). The key value is only returned once — save it immediately into HLX_API_KEY env var.",
    inputSchema: {
      type: "object",
      properties: {
        org: { type: "string", description: "Adobe org / GitHub owner" },
        site: { type: "string", description: "Site / repo name" },
        description: { type: "string", description: "Human-readable label for the key (e.g. 'hlx-admin-mcp')" },
        roles: {
          type: "array",
          items: { type: "string" },
          description: "Permission roles (e.g. [\"preview\", \"publish\", \"read\"])",
          default: ["preview", "publish", "read"],
        },
      },
      required: ["org", "site"],
    },
  },
  {
    name: "hlx_list_apikeys",
    description: "List API key metadata for a site (key values are not returned — only IDs and descriptions).",
    inputSchema: {
      type: "object",
      properties: {
        org: { type: "string", description: "Adobe org / GitHub owner" },
        site: { type: "string", description: "Site / repo name" },
      },
      required: ["org", "site"],
    },
  },
];

// ─── Tool handlers ─────────────────────────────────────────────────────────────

export type Args = Record<string, unknown>;

function getRef(args: Args): string {
  return (args.ref as string | undefined) ?? "main";
}

/**
 * Handle a tool call.
 * @param name - tool name
 * @param args - tool arguments
 * @param imsOverride - optional IMS token to use instead of env/file (HTTP mode)
 */
export async function handleTool(
  name: string,
  args: Args,
  imsOverride?: string
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const org = args.org as string;
  const site = args.site as string;
  const ref = getRef(args);
  const pagePath = args.path as string | undefined;

  try {
    switch (name) {
      // ── Auth ────────────────────────────────────────────────────────────────

      case "da_login": {
        // AEM CLI login flow — uses admin.hlx.page's own OAuth endpoint with the
        // pre-registered "aem-cli" client_id. Fixed persistent callback port — no timeout.
        const loginOrg = org ?? (args.org as string);
        const loginSite = site ?? (args.site as string);
        if (!loginOrg || !loginSite) {
          return {
            content: [{ type: "text", text: "org and site are required for da_login." }],
            isError: true,
          };
        }

        // Start persistent callback server (idempotent)
        ensureHlxLoginServer();
        _pendingLoginContext = { org: loginOrg, site: loginSite };

        const loginUrl =
          `${ADMIN_BASE}/login/${loginOrg}/${loginSite}/main` +
          `?client_id=aem-cli` +
          `&redirect_uri=${encodeURIComponent(HLX_LOGIN_CALLBACK)}` +
          `&selectAccount=true`;

        process.stderr.write(`[da_login] Opening browser: ${loginUrl}\n`);
        openBrowser(loginUrl);

        return {
          content: [{
            type: "text",
            text: [
              `Browser opened for ${loginOrg}/${loginSite} Adobe login.`,
              "",
              "Complete the login in your browser, then click **Send** on the confirmation page.",
              `Callback URL: ${HLX_LOGIN_CALLBACK}`,
              "",
              "After clicking Send, run da_whoami to confirm you're authenticated.",
            ].join("\n"),
          }],
        };
      }

      case "da_logout": {
        clearTokens();
        clearHlxSiteToken();
        return {
          content: [{ type: "text", text: "Logged out — all local tokens removed." }],
        };
      }

      case "da_whoami": {
        const imsToken = await getImsToken(imsOverride);
        const hlxSiteToken = loadHlxSiteToken();

        if (imsToken) {
          const res = await fetch(`${IMS_BASE}/ims/userinfo/v2`, {
            headers: { Authorization: `Bearer ${imsToken}` },
          });
          const data = await res.json();
          const store = loadTokens();
          const expiresIn = store
            ? Math.round((store.expires_at - Date.now()) / 1000)
            : "session token (HTTP mode)";
          return {
            content: [{
              type: "text",
              text: `Authenticated as: ${JSON.stringify(data, null, 2)}\n\nToken expires in: ${expiresIn}s`,
            }],
          };
        }

        if (hlxSiteToken) {
          // Verify site token works by calling hlx_profile
          const r = await adminRequest("GET", "/profile", undefined, imsOverride);
          return {
            content: [{
              type: "text",
              text: [
                `Authenticated via AEM CLI login (${hlxSiteToken.org}/${hlxSiteToken.site})`,
                `Token saved: ${new Date(hlxSiteToken.saved_at).toISOString()}`,
                "",
                "Profile:",
                typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2),
              ].join("\n"),
            }],
            isError: !r.ok,
          };
        }

        return {
          content: [{
            type: "text",
            text: "Not authenticated. Run da_login (with org and site) first.",
          }],
          isError: true,
        };
      }

      // ── DA content ──────────────────────────────────────────────────────────

      case "da_list": {
        const folder = (args.folder as string | undefined) ?? "/";
        const apiPath = `/list/${org}/${site}${folder === "/" ? "" : folder}`;
        const r = await daRequest("GET", apiPath, undefined, "text/html", imsOverride);
        return {
          content: [{ type: "text", text: formatResult(r) }],
          isError: !r.ok,
        };
      }

      case "da_get_content": {
        // DA source API: GET /source/{org}/{site}{path}.html
        const ext = pagePath!.endsWith(".html") ? "" : ".html";
        const apiPath = `/source/${org}/${site}${pagePath}${ext}`;
        const r = await daRequest("GET", apiPath, undefined, "text/html", imsOverride);
        return {
          content: [{ type: "text", text: formatResult(r) }],
          isError: !r.ok,
        };
      }

      case "da_update_content": {
        const html = args.html as string;
        const shouldPublish = (args.publish as boolean | undefined) ?? false;
        const ext = pagePath!.endsWith(".html") ? "" : ".html";
        const apiPath = `/source/${org}/${site}${pagePath}${ext}`;

        // Write to DA
        const writeResult = await daRequest("PUT", apiPath, html, "text/html", imsOverride);
        if (!writeResult.ok) {
          return {
            content: [{ type: "text", text: formatResult(writeResult, "Write failed:") }],
            isError: true,
          };
        }

        // Auto-preview
        const previewResult = await adminRequest(
          "POST",
          `/preview/${org}/${site}/${ref}${pagePath}`,
          undefined,
          imsOverride
        );

        const lines: string[] = [
          `Content updated: ${pagePath}`,
          `Preview: https://main--${site}--${org}.aem.page${pagePath}`,
          "",
          "--- DA write response ---",
          typeof writeResult.data === "string"
            ? writeResult.data
            : JSON.stringify(writeResult.data, null, 2),
          "",
          "--- Preview response ---",
          typeof previewResult.data === "string"
            ? previewResult.data
            : JSON.stringify(previewResult.data, null, 2),
        ];

        if (shouldPublish && previewResult.ok) {
          const publishResult = await adminRequest(
            "POST",
            `/live/${org}/${site}/${ref}${pagePath}`,
            undefined,
            imsOverride
          );
          lines.push(
            "",
            "--- Publish response ---",
            typeof publishResult.data === "string"
              ? publishResult.data
              : JSON.stringify(publishResult.data, null, 2)
          );
          if (publishResult.ok) {
            lines.push(`\nLive: https://main--${site}--${org}.aem.live${pagePath}`);
          }
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          isError: !previewResult.ok,
        };
      }

      // ── Admin API ───────────────────────────────────────────────────────────

      case "hlx_status": {
        const r = await adminRequest("GET", `/status/${org}/${site}/${ref}${pagePath}`, undefined, imsOverride);
        return { content: [{ type: "text", text: formatResult(r) }] };
      }

      case "hlx_preview": {
        const r = await adminRequest("POST", `/preview/${org}/${site}/${ref}${pagePath}`, undefined, imsOverride);
        return {
          content: [{
            type: "text",
            text: formatResult(
              r,
              r.ok
                ? `Preview updated: https://main--${site}--${org}.aem.page${pagePath}`
                : undefined
            ),
          }],
          isError: !r.ok,
        };
      }

      case "hlx_publish": {
        const r = await adminRequest("POST", `/live/${org}/${site}/${ref}${pagePath}`, undefined, imsOverride);
        return {
          content: [{
            type: "text",
            text: formatResult(
              r,
              r.ok
                ? `Published: https://${ref}--${site}--${org}.aem.live${pagePath}`
                : undefined
            ),
          }],
          isError: !r.ok,
        };
      }

      case "hlx_unpublish": {
        const r = await adminRequest("DELETE", `/live/${org}/${site}/${ref}${pagePath}`, undefined, imsOverride);
        return {
          content: [{
            type: "text",
            text: formatResult(r, r.ok ? `Unpublished: ${pagePath}` : undefined),
          }],
          isError: !r.ok,
        };
      }

      case "hlx_delete_preview": {
        const r = await adminRequest("DELETE", `/preview/${org}/${site}/${ref}${pagePath}`, undefined, imsOverride);
        return {
          content: [{
            type: "text",
            text: formatResult(r, r.ok ? `Preview deleted: ${pagePath}` : undefined),
          }],
          isError: !r.ok,
        };
      }

      case "hlx_bulk_preview": {
        const paths = args.paths as string[];
        const del = (args.delete as boolean | undefined) ?? false;
        const r = await adminRequest("POST", `/preview/${org}/${site}/${ref}/*`, {
          paths,
          delete: del,
        }, imsOverride);
        return {
          content: [{
            type: "text",
            text: formatResult(
              r,
              r.ok ? `Bulk preview job started for ${paths.length} paths` : undefined
            ),
          }],
          isError: !r.ok,
        };
      }

      case "hlx_bulk_publish": {
        const paths = args.paths as string[];
        const del = (args.delete as boolean | undefined) ?? false;
        const r = await adminRequest("POST", `/live/${org}/${site}/${ref}/*`, {
          paths,
          delete: del,
        }, imsOverride);
        return {
          content: [{
            type: "text",
            text: formatResult(
              r,
              r.ok ? `Bulk publish job started for ${paths.length} paths` : undefined
            ),
          }],
          isError: !r.ok,
        };
      }

      case "hlx_job_status": {
        const jobId = args.jobId as string;
        const details = (args.details as boolean | undefined) ?? false;
        const endpoint = details
          ? `/job/${org}/${site}/${ref}/${jobId}/details`
          : `/job/${org}/${site}/${ref}/${jobId}`;
        const r = await adminRequest("GET", endpoint, undefined, imsOverride);
        return { content: [{ type: "text", text: formatResult(r) }] };
      }

      case "hlx_cache_purge": {
        const r = await adminRequest("POST", `/cache/${org}/${site}/${ref}${pagePath}`, undefined, imsOverride);
        return {
          content: [{
            type: "text",
            text: formatResult(r, r.ok ? `Cache purged for: ${pagePath}` : undefined),
          }],
          isError: !r.ok,
        };
      }

      case "hlx_profile": {
        const r = await adminRequest("GET", "/profile", undefined, imsOverride);
        return { content: [{ type: "text", text: formatResult(r) }] };
      }

      case "hlx_create_apikey": {
        const desc = (args.description as string | undefined) ?? "hlx-admin-mcp";
        const roles = (args.roles as string[] | undefined) ?? ["preview", "publish", "read"];
        const r = await adminRequest(
          "POST",
          `/config/${org}/sites/${site}/apiKeys.json`,
          { description: desc, roles },
          imsOverride
        );
        if (r.ok) {
          const key = (r.data as Record<string, unknown>)?.key ?? "(key not in response)";
          return {
            content: [{
              type: "text",
              text: [
                "API key created successfully. SAVE THIS NOW — it will never be shown again.",
                "",
                `Key: ${key}`,
                "",
                `Paste it into ~/.claude.json under mcpServers.hlx-admin.env:`,
                `  "HLX_API_KEY": "${key}"`,
                "",
                "Full response:",
                JSON.stringify(r.data, null, 2),
              ].join("\n"),
            }],
          };
        }
        return {
          content: [{ type: "text", text: formatResult(r) }],
          isError: true,
        };
      }

      case "hlx_list_apikeys": {
        const r = await adminRequest("GET", `/config/${org}/sites/${site}/apiKeys.json`, undefined, imsOverride);
        return { content: [{ type: "text", text: formatResult(r) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
}

# Phase 1: Foundation - Research

**Researched:** 2026-03-14
**Domain:** Railway deployment compatibility — Node.js/Express/TypeScript port binding and server architecture
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HOST-02 | Server binds to `0.0.0.0` + `process.env.PORT` (Railway compatible) | Current code binds `127.0.0.1` and reads `HLX_MCP_PORT`; exact line locations and fix pattern documented below |
| HOST-03 | Single HTTP port — no dual-server architecture | Current `oauthApp` + `startOAuthHttpsServer` + `selfsigned` must be removed; OAuth routes move to main `app` |
| HOST-04 | `GET /health` returns HTTP 200 | Endpoint already exists at line 523; no code change needed — only verification |
| HOST-05 | `railway.toml` exists with build command, start command, and `/health` health check path | File does not exist; exact TOML content documented below; monorepo root-directory placement documented |
</phase_requirements>

---

## Summary

Phase 1 is a surgical code removal and reconfiguration task — not a feature build. The codebase already has a working Express server with a health check endpoint, correct JSON-RPC MCP transport, and TypeScript build tooling. The three blocking problems are: (1) the server binds to `127.0.0.1` instead of `0.0.0.0`, making it invisible to Railway's proxy; (2) the server spawns a second HTTPS process on port 3443 using a self-signed cert, which Railway cannot expose; and (3) the `railway.toml` deployment config file does not exist. None of these require new logic — they require removing the dual-server machinery, fixing two string literals, and writing one new file.

The health check endpoint (`GET /health`) already exists at line 523 of `http.ts` and returns a JSON body with `status: "ok"`. It requires no changes for Phase 1. The OAuth routes (`/authorize`, `/callback`, `/token`) live on `oauthApp` (the HTTPS server) and must move to the main `app` for Phase 2 — but Phase 1 does not need to complete that move; it only needs the dual-server to be gone so Railway can start the process at all.

The `selfsigned` package is a runtime dependency in `package.json` that exists only to generate the self-signed cert for the localhost HTTPS workaround. It must be removed from `dependencies` so the production install is clean. TypeScript compilation (`tsc`) already produces `dist/http.js` from `src/http.ts` — the Railway start command can point directly at it.

**Primary recommendation:** Remove `oauthApp`, `startOAuthHttpsServer`, and `selfsigned` from `http.ts`; change the `tryListen` binding from `"127.0.0.1"` to `"0.0.0.0"`; read `process.env.PORT` as the primary port source; write `railway.toml` in the `tools/hlx-admin-mcp/` directory.

---

## Standard Stack

### Core (already in use — no changes to runtime stack)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 22.x LTS | Runtime | Railway Railpack auto-detects via `package.json`. `@types/node` version `^22.0.0` already targets this. |
| TypeScript | ^5.0.0 | Type safety | Already in devDependencies. `tsc` produces `dist/` from `src/`. Build command: `npm run build`. |
| express | ^4.18.0 | HTTP server | Already in dependencies. Single app instance is the correct hosted pattern. |
| uuid | ^9.0.0 | Session ID generation | Already in dependencies. `uuidv4()` used for all session, auth code, and state tokens. |

### Remove (Phase 1 cleanup)

| Package | Current Role | Remove Because |
|---------|-------------|---------------|
| `selfsigned` | Generates self-signed cert for localhost HTTPS server | Railway provides real TLS at the edge; no self-signed cert needed |

**Removal command:**
```bash
cd tools/hlx-admin-mcp
npm uninstall selfsigned
```

### No New Dependencies

Phase 1 adds zero new runtime dependencies. Every fix uses Node.js built-ins or packages already present.

---

## Architecture Patterns

### Current State (what exists in `http.ts`)

```
tools/hlx-admin-mcp/src/http.ts  (624 lines)

TWO servers:
  app        — Express, plain HTTP, binds 127.0.0.1:3000  (MCP endpoint)
  oauthApp   — Express, HTTPS via selfsigned, binds 127.0.0.1:3443  (OAuth routes)

Routes on `app`:
  GET  /.well-known/oauth-authorization-server  (points clients to oauthBase=localhost:3443)
  GET  /.well-known/oauth-protected-resource    (points clients to oauthBase=localhost:3443)
  POST /mcp                                     (JSON-RPC dispatch)
  GET  /mcp                                     (405 — correct)
  DELETE /mcp                                   (session close)
  GET  /health                                  (returns 200 JSON — correct)

Routes on `oauthApp` (unreachable from Railway):
  GET  /              (trust-prompt page)
  GET  /authorize     (PKCE redirect to IMS)
  GET  /callback      (IMS code exchange)
  POST /token         (session token issuance)
```

### Target State After Phase 1

```
tools/hlx-admin-mcp/src/http.ts  (reduced)

ONE server:
  app — Express, plain HTTP, binds 0.0.0.0:${PORT}

Routes on `app` (same as now, minus oauthApp artifacts):
  GET  /.well-known/oauth-authorization-server  (Phase 2 will fix URLs to use PUBLIC_URL)
  GET  /.well-known/oauth-protected-resource    (Phase 2 will fix URLs to use PUBLIC_URL)
  POST /mcp                                     (unchanged)
  GET  /mcp                                     (unchanged — 405)
  DELETE /mcp                                   (unchanged)
  GET  /health                                  (unchanged — already correct)

REMOVED:
  oauthApp Express instance
  startOAuthHttpsServer() function
  selfsigned import
  createHttpsServer import
  OAUTH_PORT constant
  HLX_OAUTH_PORT env var read
  All references to localhost:3443

NOTE: /authorize, /callback, /token routes move to main app in Phase 2.
      Phase 1 does NOT implement them — Phase 1 only removes the oauthApp server.
```

### railway.toml Placement

Railway's Config as Code uses the `railway.toml` file relative to the service's Root Directory. For this monorepo, the Railway service Root Directory must be set to `tools/hlx-admin-mcp` in the Railway dashboard. The `railway.toml` then lives at:

```
tools/hlx-admin-mcp/railway.toml
```

### Pattern: Port Binding for Railway

**What:** Read `process.env.PORT` as primary; fall back to `HLX_MCP_PORT` for local compatibility; bind to `0.0.0.0`.

**Current code (lines 43, 541):**
```typescript
// Line 43 — wrong env var name for Railway:
const BASE_PORT = parseInt(process.env.HLX_MCP_PORT ?? "3000", 10);

// Line 541 — wrong bind address:
const srv = app.listen(port, "127.0.0.1", () => {
```

**Correct for Railway:**
```typescript
// Read PORT first (Railway injects this), fall back to local override
const BASE_PORT = parseInt(process.env.PORT ?? process.env.HLX_MCP_PORT ?? "3000", 10);

// Bind to 0.0.0.0 so Railway's proxy can reach the process
const srv = app.listen(port, "0.0.0.0", () => {
```

Source: Railway docs — "Application failed to respond" error is caused by binding to localhost.

### Pattern: Trust Proxy for Railway

Railway terminates TLS at its edge and forwards plain HTTP to the container. The `X-Forwarded-Proto: https` header is set by Railway. Adding `trust proxy` makes `req.secure`, `req.protocol`, and `req.ip` accurate.

**Add immediately after `const app = express();`:**
```typescript
app.set("trust proxy", 1);
```

This is required so OAuth redirect URI construction in Phase 2 can use `req.protocol` correctly. It is safe to add in Phase 1.

### Anti-Patterns to Avoid

- **Port scanning loop in `main()`:** The current `main()` scans ports `BASE_PORT` through `BASE_PORT + 10`. On Railway, `process.env.PORT` is the exact port Railway allocated — scanning for alternatives is incorrect behavior. The loop must be replaced with a direct single `tryListen(BASE_PORT)` call. If Railway's port is taken, the container has a configuration problem that should fail loudly, not silently increment.
- **`OAUTH_PORT` constant left as dead code:** After removing `oauthApp`, any remaining reference to `OAUTH_PORT` or `HLX_OAUTH_PORT` will be unused. Remove them cleanly to prevent TypeScript warnings and confusion in Phase 2.
- **Leaving `selfsigned` in `dependencies` after removing its usage:** TypeScript will no longer import it, but it still installs on `npm ci` in Railway's build. Remove it from `package.json` explicitly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TLS/HTTPS on Railway | Custom cert generation, `selfsigned`, `node:https` server | Railway's built-in TLS termination | Railway provides a real Let's Encrypt cert at the edge. The app runs plain HTTP internally. |
| Health check endpoint | New middleware, library | The existing `GET /health` at line 523 | Already implemented correctly — returns 200 JSON. |
| Build toolchain | esbuild, webpack | `tsc` (already in `package.json` `build` script) | `npm run build` already runs `tsc`. `dist/http.js` is the correct Railway start target. |

---

## Common Pitfalls

### Pitfall 1: 127.0.0.1 binding — Railway cannot reach the server

**What goes wrong:** `app.listen(port, "127.0.0.1", ...)` — Railway's internal proxy routes to the container's external network interface, not loopback. Health checks fail immediately. Deployment shows "Application failed to respond."

**Why it happens:** localhost binding is correct for local dev (prevents external access). On Railway, the container is isolated — `0.0.0.0` is required for Railway's proxy to reach the process.

**How to avoid:** Change line 541 to `"0.0.0.0"`.

**Warning signs:** Railway dashboard shows repeated health check failures; build succeeds but service status shows "unhealthy."

### Pitfall 2: PORT env var mismatch

**What goes wrong:** Railway injects `PORT` (not `HLX_MCP_PORT`). The current fallback to `3000` may conflict with Railway's allocated port. Railway's health check probes the `PORT` it allocated — if the app is on `3000` but Railway expects `8080`, the health check fails even if the server is running.

**How to avoid:** Read `process.env.PORT` first. Replace `process.env.HLX_MCP_PORT ?? "3000"` with `process.env.PORT ?? process.env.HLX_MCP_PORT ?? "3000"`.

### Pitfall 3: Port scan loop is wrong on Railway

**What goes wrong:** The `main()` loop scans ports `BASE_PORT` through `BASE_PORT + 10`. On Railway, `PORT` is the exact allocated port. If the server binds to `PORT + 3` because the earlier ports appeared busy, Railway's proxy still routes to `PORT` and health checks fail.

**How to avoid:** Replace the loop with a single `tryListen(BASE_PORT)` call followed by `process.exit(1)` on failure. Remove the scan loop entirely.

### Pitfall 4: `selfsigned` import causes TypeScript error after removal

**What goes wrong:** After removing `oauthApp` and `startOAuthHttpsServer`, the `selfsigned` import at line 22 and the `createHttpsServer` import from `node:https` at line 19 become unused. TypeScript strict mode (`"strict": true` in tsconfig.json) will error on unused imports depending on settings, and the Railway build step (`tsc`) will fail.

**How to avoid:** Remove both imports when removing the HTTPS server. Verify `npm run build` succeeds locally before pushing.

### Pitfall 5: `railway.toml` in wrong location for monorepo

**What goes wrong:** Railway's Config as Code looks for `railway.toml` relative to the service's Root Directory. If `railway.toml` is placed at the repo root but Railway's Root Directory is set to `tools/hlx-admin-mcp`, Railway will not find it. Alternatively, if Root Directory is not configured in the Railway dashboard, Railway will look in the repo root for `railway.toml` but `npm run build` will fail because `package.json` is in `tools/hlx-admin-mcp/`.

**How to avoid:** Set Railway service Root Directory to `tools/hlx-admin-mcp` in the Railway dashboard. Place `railway.toml` inside `tools/hlx-admin-mcp/railway.toml`. The `buildCommand` in the toml can then be simply `npm ci && npm run build` (relative to that directory).

---

## Code Examples

### `railway.toml` — exact content

```toml
[build]
buildCommand = "npm ci && npm run build"

[deploy]
startCommand = "node dist/http.js"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
```

Source: Railway Config as Code reference — https://docs.railway.com/reference/config-as-code

**Notes:**
- `buildCommand` runs in the Root Directory (`tools/hlx-admin-mcp`), so `npm run build` invokes `tsc` from `package.json`.
- `startCommand` produces `dist/http.js` which Railway runs with the `node` binary it detects from `package.json` engines field (Node 22 from `@types/node ^22.0.0`).
- `healthcheckPath = "/health"` tells Railway to probe this path after startup. The existing endpoint at line 523 already returns HTTP 200.
- `healthcheckTimeout = 30` is conservative — the Express server starts in under 1 second.
- `restartPolicyType = "on_failure"` restarts on crash but not on clean exit.

### Port binding fix (lines 43 and 541)

```typescript
// Line 43 — before:
const BASE_PORT = parseInt(process.env.HLX_MCP_PORT ?? "3000", 10);

// Line 43 — after:
const BASE_PORT = parseInt(process.env.PORT ?? process.env.HLX_MCP_PORT ?? "3000", 10);
```

```typescript
// Line 541 — before:
const srv = app.listen(port, "127.0.0.1", () => {

// Line 541 — after:
const srv = app.listen(port, "0.0.0.0", () => {
```

### Trust proxy (add after line 176 `const app = express();`)

```typescript
const app = express();
app.set("trust proxy", 1);  // Required for Railway's reverse proxy
```

Source: Express behind proxies guide — https://expressjs.com/en/guide/behind-proxies.html

### Remove from `main()` — port scan loop

```typescript
// BEFORE (lines 577-584) — scan loop, wrong for Railway:
for (let port = BASE_PORT; port <= BASE_PORT + 10; port++) {
  const ok = await tryListen(port);
  if (ok) break;
  if (port === BASE_PORT + 10) {
    process.stderr.write(`...`);
    process.exit(1);
  }
}

// AFTER — single bind, fail loudly:
const ok = await tryListen(BASE_PORT);
if (!ok) {
  process.stderr.write(`[hlx-admin-mcp] ERROR: Could not bind to port ${BASE_PORT}.\n`);
  process.exit(1);
}
```

### Remove from `http.ts` — all dual-server artifacts

Lines and imports to delete entirely:
- Line 19: `import { createServer as createHttpsServer } from "node:https";`
- Line 22-23: `// @ts-ignore — no types for selfsigned` + `import selfsigned from "selfsigned";`
- Line 44: `const OAUTH_PORT = parseInt(process.env.HLX_OAUTH_PORT ?? "3443", 10);`
- Line 55: `const OAUTH_CALLBACK_URI = ...` (will be rewritten in Phase 2 using `PUBLIC_URL`)
- Lines 226-415: the entire `oauthApp` Express instance and all its routes (`/`, `/authorize`, `/callback`, `/token`)
- Lines 556-573: `startOAuthHttpsServer()` function entirely
- Lines 592-600: the `if (IMS_OAUTH_ENABLED) { await startOAuthHttpsServer() ... }` block in `main()`

**Note on OAuth routes:** The `/authorize`, `/callback`, and `/token` route handlers are deleted from `oauthApp` in Phase 1. They will be re-added to the main `app` in Phase 2. Phase 1 does not leave stub routes — it cleanly removes the HTTPS server machinery. The server will build and start without errors, and `/health` will return 200, but OAuth will not function until Phase 2.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Dual HTTP+HTTPS server for OAuth on localhost | Single HTTP server on Railway (platform provides TLS) | Removes `selfsigned`, `node:https`, `oauthApp` — ~200 lines of code gone |
| Hardcoded port `3000` with scan loop | `process.env.PORT` (Railway-injected) | Server always binds the port Railway expects |
| `127.0.0.1` binding | `0.0.0.0` binding | Railway's proxy can reach the process |
| No `railway.toml` | `railway.toml` with build + start + health check | Railway knows how to build, start, and verify the service |

---

## Open Questions

1. **Does `npm run build` succeed on a clean install?**
   - What we know: `package.json` has `"build": "tsc"` and `tsconfig.json` compiles `src/**/*` to `dist/`. A `dist/` folder already exists.
   - What's unclear: Whether the existing `dist/` was built from the current `src/` or is stale. Railway does `npm ci && npm run build`, so stale `dist/` is not a concern for production.
   - Recommendation: Run `npm run build` locally after removing `selfsigned` import to confirm TypeScript compilation succeeds before pushing.

2. **Does the `selfsigned` package have a type declaration file that causes TypeScript to error when removed?**
   - What we know: Line 21 has `// @ts-ignore — no types for selfsigned`, which means TypeScript already ignores the import. Removal should be clean.
   - Recommendation: Delete both the `@ts-ignore` comment and the import line together.

3. **Railway Root Directory — is it configurable without an existing Railway project?**
   - What we know: Root Directory is a Railway dashboard setting on the service, not a `railway.toml` setting.
   - What's unclear: Whether Phase 1 includes creating the Railway service in the dashboard (Phase 3 per the roadmap) or just writing the config file for when it is created.
   - Recommendation: Write `railway.toml` in Phase 1. The Railway service creation is Phase 3. The `railway.toml` file should be committed to the repo now so it is ready when Phase 3 deploys.

---

## Validation Architecture

`nyquist_validation` is enabled in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None installed — manual curl/node invocation |
| Config file | None — Wave 0 must establish a lightweight test approach |
| Quick run command | `node tools/hlx-admin-mcp/dist/http.js &` then `curl -s http://localhost:3000/health` |
| Full suite command | See test map below — all automated checks are curl-based |

No Jest, Vitest, or pytest infrastructure exists. Phase 1 tests are process-start + HTTP probe verifications appropriate for a small server configuration change. Wave 0 gap: a shell script `test-phase1.sh` to run all checks reproducibly.

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HOST-02 | Server starts on `process.env.PORT` and binds `0.0.0.0` | smoke | `PORT=9999 node dist/http.js & sleep 1 && curl -sf http://localhost:9999/health && kill %1` | ❌ Wave 0 |
| HOST-02 | Bind address is `0.0.0.0`, not `127.0.0.1` (verifiable via `ss` or `netstat`) | smoke | `PORT=9999 node dist/http.js & sleep 1 && ss -tlnp | grep 9999 | grep '0.0.0.0' && kill %1` | ❌ Wave 0 |
| HOST-03 | Only one port is open (no `:3443` HTTPS server) | smoke | `PORT=9999 node dist/http.js & sleep 1 && ! ss -tlnp | grep 3443 && kill %1` | ❌ Wave 0 |
| HOST-03 | `selfsigned` package removed from package.json dependencies | static | `node -e "const p=require('./package.json'); process.exit(p.dependencies['selfsigned'] ? 1 : 0)"` | ❌ Wave 0 |
| HOST-04 | `GET /health` returns HTTP 200 | smoke | `PORT=9999 node dist/http.js & sleep 1 && curl -sf -o /dev/null -w "%{http_code}" http://localhost:9999/health | grep 200 && kill %1` | ❌ Wave 0 |
| HOST-04 | `GET /health` response body contains `"status":"ok"` | smoke | `PORT=9999 node dist/http.js & sleep 1 && curl -sf http://localhost:9999/health | grep '"status":"ok"' && kill %1` | ❌ Wave 0 |
| HOST-05 | `railway.toml` file exists in `tools/hlx-admin-mcp/` | static | `test -f tools/hlx-admin-mcp/railway.toml` | ❌ Wave 0 |
| HOST-05 | `railway.toml` contains `healthcheckPath = "/health"` | static | `grep -q 'healthcheckPath.*=.*"/health"' tools/hlx-admin-mcp/railway.toml` | ❌ Wave 0 |
| HOST-05 | `railway.toml` contains a `startCommand` | static | `grep -q 'startCommand' tools/hlx-admin-mcp/railway.toml` | ❌ Wave 0 |
| HOST-05 | `railway.toml` contains a `buildCommand` | static | `grep -q 'buildCommand' tools/hlx-admin-mcp/railway.toml` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run build` in `tools/hlx-admin-mcp/` must exit 0 (TypeScript compile check)
- **Per wave merge:** Run all static checks + all smoke checks from the test map above
- **Phase gate:** All 10 checks green before `/gsd:verify-work 1`

### Wave 0 Gaps

- [ ] `tools/hlx-admin-mcp/test-phase1.sh` — shell script running all 10 checks in sequence; covers all HOST-02 through HOST-05 automated tests
- [ ] Framework install: none needed — bash + curl + node are sufficient

---

## Sources

### Primary (HIGH confidence)

- Railway docs — "Application failed to respond" — https://docs.railway.com/reference/errors/application-failed-to-respond — confirms 0.0.0.0 + PORT requirement
- Railway Config as Code reference — https://docs.railway.com/reference/config-as-code — exact `railway.toml` structure
- Railway Health Checks — https://docs.railway.com/deployments/healthchecks — healthcheckPath and healthcheckTimeout fields
- Railway Monorepo Guide — https://docs.railway.com/guides/monorepo — Root Directory setting for subdirectory services
- Express behind proxies — https://expressjs.com/en/guide/behind-proxies.html — `trust proxy` requirement
- Direct code analysis — `tools/hlx-admin-mcp/src/http.ts` lines 19, 22, 43-44, 55, 226-415, 523, 539-573, 575-600 — exact locations of every change
- `.planning/research/STACK.md` — verified stack decisions (prior research)
- `.planning/research/ARCHITECTURE.md` — dual-server elimination pattern, port binding, trust proxy
- `.planning/research/PITFALLS.md` — Pitfalls 1, 2, 12 directly address Phase 1 changes

### Secondary (MEDIUM confidence)

- Railway community — IPv6 `"::"` binding alternative — multiple community reports; `"0.0.0.0"` is the simpler and more universally correct choice for this codebase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — direct code analysis confirms exact versions and package names
- Architecture changes: HIGH — prior research cross-referenced with code line analysis; no ambiguity
- Pitfalls: HIGH — Pitfalls 1 and 12 from PITFALLS.md are directly mapped to specific lines; Railway docs confirm root cause
- railway.toml format: HIGH — Railway Config as Code reference is authoritative and current

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (Railway `railway.toml` schema is stable; Express 4.x is stable; Node 22 LTS is stable)

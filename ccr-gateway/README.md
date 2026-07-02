# ccr Private Claude Code Gateway (Prototype)

`ccr` is a neutral, code-native control plane running at the enterprise boundary. It intercepts, audits, and governs AI coding agent traffic (Claude Code) before it exits your VPC.

This prototype verifies the security, auditability, and spend ledgers required to safely approve and scale AI coding tools within 10 business days.

---

## 1. System Components

Two processes, both bound to `127.0.0.1` only (no LAN exposure):

* **`ccr-edge` (`src/edge.ts`, `localhost:8080`)**: The only thing Claude Code ever talks to. A deliberately tiny reverse proxy with no AWS SDK, no database, no policy engine — nothing that can crash the way `ccr-core` can. When `ccr-core` is reachable, it proxies transparently. When `ccr-core` is down (crashed, restarting, whatever), it falls back to calling `api.anthropic.com` directly using your own request credentials (subscription/API key) — so a dead gateway never means a dead Claude Code session. Check `localhost:8080/edge-status` any time to see which mode it's in.
* **`ccr-core` (`src/server.ts`, `localhost:8081`, internal only)**: All the actual intelligence — reached only by `ccr-edge`, never directly. Executes policy rules, routes to Mantle/vLLM/Bedrock, and forwards approved requests upstream.
* **Code-Aware Policy Engine (`src/policy.ts`)**: Scans requests for path violations (e.g. `.env`, `.pem` checks), prompt key leaks, and `.ccrignore` directory boundaries.
* **Audit & Spend Ledger (`src/db.ts`)**: Persists structured telemetry, status codes, latencies, and token spend into a plain-text local audit file: `ccr_database.json`.
* **Admin Console (`localhost:8080/admin/dashboard`)**: A visual metrics dashboard tracking total runs, exfiltrations blocked, and CFO-readable savings. Proxied through `ccr-edge`; returns a clean `503` if `ccr-core` is down (the admin dashboard itself has no direct-Anthropic equivalent to fall back to).
* **CISO Approval Report (`localhost:8080/admin/reports/approval`)**: A print-ready compliance evidence report summarizing pilot statistics.

Both processes run under PM2 (`ecosystem.config.js`) with auto-restart, and a Windows Task Scheduler entry (`ccr-gateway-pm2-resurrect`, runs `pm2 resurrect` at logon) brings them back after a reboot.

---

## 2. Installation & Quickstart

### Prerequisites
* Node.js (v18+)
* NPM
* PM2 (`npm install -g pm2`)

### Setup & Run
1. Navigate to the gateway directory:
   ```bash
   cd ccr-gateway
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build and start both processes under PM2:
   ```bash
   npm run build
   pm2 start ecosystem.config.js
   pm2 save
   ```
   Verify: `pm2 status` should show `ccr-edge` and `ccr-core` both `online`.

   For active development on `ccr-core`'s logic, `npm run dev` (tsx watch mode, hot-reloads on save) is still available — just don't run it long-term as your "always on" instance; use the PM2/compiled path for that.

---

## 3. Developer Configuration (Routing Claude Code)

Set `ANTHROPIC_BASE_URL` **once**, as a persistent Windows User environment variable — every new Claude Code session (CLI, IDE extension, whatever) then routes through the gateway automatically. No per-session alias or manual env var needed.

### Windows (PowerShell, one-time)
```powershell
setx ANTHROPIC_BASE_URL "http://localhost:8080"
```
Open a **new** terminal window afterward — already-open shells don't pick up the change.

### macOS / Linux (Bash, one-time — add to your shell profile)
```bash
export ANTHROPIC_BASE_URL="http://localhost:8080"
```

*Note: point at `ccr-edge` (`8080`), not `ccr-core` (`8081`) directly — `ccr-core` is internal-only and has no fallback of its own if it goes down. Claude Code appends `/v1/messages` automatically, so do not include `/v1` in the override.*

---

## 4. Policy Configuration

To add, edit, or configure rules, open [src/policy.ts](src/policy.ts) and modify the `DEFAULT_RULES` array. The TypeScript server will automatically hot-reload and apply the updated rules in real time.

### Available Modes:
* **`enforce`**: Immediately blocks the request, prevents the API call from exiting your boundary, and returns a clean `400` error to the developer.
* **`warn`**: Logs a policy warning in the database but allows the request to proceed.
* **`monitor`**: Silently records the rule trigger event in the audit logs.

---

## 5. Audit Trails & CFO Evidence

* **Raw Audit Export**: The complete structured telemetry ledger is stored locally in [ccr_database.json](ccr_database.json). You can parse or feed this file directly into your SIEM pipeline (Splunk, Datadog) for enterprise reporting.
* **Compliance Report**: Open `http://localhost:8080/admin/reports/approval` in your browser and click **Export / Print Report** to download a formatted PDF summary of your pilot evaluation.

# ccr Private Claude Code Gateway (Prototype)

`ccr` is a neutral, code-native control plane running at the enterprise boundary. It intercepts, audits, and governs AI coding agent traffic (Claude Code) before it exits your VPC.

This prototype verifies the security, auditability, and spend ledgers required to safely approve and scale AI coding tools within 10 business days.

---

## 1. System Components

* **Gateway API (`localhost:8081/v1/messages`)**: Intercepts Claude Code calls, executes policy rules, and forwards approved requests upstream to Anthropic.
* **Code-Aware Policy Engine (`src/policy.ts`)**: Scans requests for path violations (e.g. `.env`, `.pem` checks), prompt key leaks, and `.ccrignore` directory boundaries.
* **Audit & Spend Ledger (`src/db.ts`)**: Persists structured telemetry, status codes, latencies, and token spend into a plain-text local audit file: `ccr_database.json`.
* **Admin Console (`localhost:8081/admin/dashboard`)**: A visual metrics dashboard tracking total runs, exfiltrations blocked, and CFO-readable savings.
* **CISO Approval Report (`localhost:8081/admin/reports/approval`)**: A print-ready compliance evidence report summarizing pilot statistics.

---

## 2. Installation & Quickstart

### Prerequisites
* Node.js (v18+)
* NPM

### Setup & Run
1. Navigate to the gateway directory:
   ```bash
   cd ccr-gateway
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the gateway server in development mode (hot-reloads automatically when policies are edited):
   ```bash
   npm run dev
   ```
   *The console will print:* `[INFO] ccr Gateway listening on port 8081`

---

## 3. Developer Configuration (Routing Claude Code)

Open a new terminal window and direct the Claude Code CLI to route through your local gateway boundary.

### Windows (PowerShell)
```powershell
$env:ANTHROPIC_BASE_URL="http://localhost:8081"
claude
```

### macOS / Linux (Bash)
```bash
export ANTHROPIC_BASE_URL="http://localhost:8081"
claude
```

*Note: Claude Code appends `/v1/messages` automatically, so do not include `/v1` in the `ANTHROPIC_BASE_URL` override.*

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
* **Compliance Report**: Open `http://localhost:8081/admin/reports/approval` in your browser and click **Export / Print Report** to download a formatted PDF summary of your pilot evaluation.

@echo off
REM hlx-admin MCP HTTP Server - Windows starter
REM
REM Authentication modes (in priority order):
REM
REM 1. AEM CLI Login (default — no credentials needed):
REM    Start the server, then call da_login(org, site) from Claude.
REM    Opens your browser to Adobe login. Token saved locally.
REM
REM 2. SERVER-TO-SERVER MODE (headless — no browser login):
REM    Requires: ADOBE_IMS_CLIENT_ID + ADOBE_IMS_CLIENT_SECRET
REM    Get both from: https://developer.adobe.com/console (OAuth Server-to-Server)
REM
REM 3. IMS OAUTH USER AUTH MODE (legacy browser flow):
REM    Requires: ADOBE_IMS_CLIENT_ID only (no secret)
REM    Register redirect URI: https://localhost:3443/callback in Adobe Developer Console

REM ── Optional: Server-to-Server credentials ───────────────────────────────────
REM set ADOBE_IMS_CLIENT_ID=your_client_id_here
REM set ADOBE_IMS_CLIENT_SECRET=your_client_secret_here

REM ── Optional config ───────────────────────────────────────────────────────────
REM set HLX_MCP_PORT=3000

echo Starting hlx-admin MCP HTTP server...
if not "%ADOBE_IMS_CLIENT_ID%"=="" (
  if not "%ADOBE_IMS_CLIENT_SECRET%"=="" (
    echo Mode: Server-to-Server ^(client credentials — no browser login needed^)
  ) else (
    echo Mode: IMS OAuth User Auth ^(browser login via Adobe IMS^)
  )
) else (
  echo Mode: AEM CLI Login ^(call da_login from Claude to authenticate^)
)
echo.

node "C:\Users\remekie\Documents\Antigravity\tools\hlx-admin-mcp\dist\http.js"

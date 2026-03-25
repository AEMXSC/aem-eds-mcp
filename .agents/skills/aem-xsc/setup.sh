#!/usr/bin/env bash
# ============================================================
# XSC Superpower Stack — One-Shot Setup
# Usage: bash <(curl -s https://raw.githubusercontent.com/AEMXSC/SuperSkills/main/setup.sh)
# ============================================================
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
info() { echo -e "  $1"; }

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        XSC Superpower Stack Setup                   ║"
echo "║        SuperSkills + 17 EDS Skills + GSD + MCPs     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── 1. Prerequisites ─────────────────────────────────────────
echo "── Checking prerequisites ──"

command -v node &>/dev/null && ok "Node.js $(node -v)" || { warn "Node.js not found — install from https://nodejs.org"; exit 1; }
command -v npm  &>/dev/null && ok "npm $(npm -v)"      || { warn "npm not found"; exit 1; }
command -v git  &>/dev/null && ok "git $(git --version | cut -d' ' -f3)" || { warn "git not found"; exit 1; }
command -v gh   &>/dev/null && ok "GitHub CLI $(gh --version | head -1)" || warn "GitHub CLI not found — install: https://cli.github.com"
echo ""

# ── 2. Claude Code ───────────────────────────────────────────
echo "── Claude Code ──"
command -v claude &>/dev/null && ok "Claude Code installed" || {
  warn "Claude Code not found — installing..."
  npm install -g @anthropic-ai/claude-code
}
echo ""

# ── 3. Skills ────────────────────────────────────────────────
echo "── Installing skills ──"

info "SuperSkills (AEM XSC)..."
npx skills add https://github.com/AEMXSC/SuperSkills --yes 2>/dev/null && ok "SuperSkills" || warn "SuperSkills install failed"

info "17 AEM EDS Dev Skills..."
npx skills add https://github.com/adobe/skills/tree/main/skills/aem/edge-delivery-services --all --yes 2>/dev/null && ok "17 AEM EDS Skills" || warn "EDS skills install failed"

info "GSD (Get Shit Done — parallel build orchestration)..."
npx get-shit-done-cc@latest --claude --local 2>/dev/null && ok "GSD" || warn "GSD install failed"
echo ""

# ── 4. AEM CLI ───────────────────────────────────────────────
echo "── AEM CLI ──"
command -v aem &>/dev/null && ok "AEM CLI already installed" || {
  info "Installing @adobe/aem-lib..."
  npm install -g @adobe/aem-lib && ok "AEM CLI" || warn "AEM CLI install failed"
}
echo ""

# ── 5. Playwright ────────────────────────────────────────────
echo "── Playwright (visual validation) ──"
if node -e "require('playwright')" 2>/dev/null; then
  ok "Playwright already installed"
else
  info "Installing Playwright + Chromium..."
  npm install -g playwright 2>/dev/null
  npx playwright install chromium && ok "Playwright + Chromium" || warn "Playwright install failed"
fi
echo ""

# ── 6. MCP Servers ───────────────────────────────────────────
echo "── Configuring MCP servers ──"

# DA MCP
claude mcp add da-mcp \
  --transport http \
  --url https://mcp.adobeaemcloud.com/adobe/mcp/da 2>/dev/null \
  && ok "DA MCP (da.live write/preview/publish)" \
  || warn "DA MCP — may already be configured"

# hlx-admin-mcp
claude mcp add hlx-admin \
  --transport http \
  --url http://localhost:3000 2>/dev/null \
  && ok "hlx-admin MCP (localhost:3000 — run: npx @adobe/hlx-admin-mcp)" \
  || warn "hlx-admin MCP — may already be configured"

# n8n MCP
claude mcp add n8n-mcp -- npx n8n-mcp 2>/dev/null \
  && ok "n8n MCP (525+ workflow nodes)" \
  || warn "n8n MCP — may already be configured"

# helix-mcp (bulk preview/publish — requires HELIX_ADMIN_API_TOKEN, configured in manual steps)
claude mcp add helix-mcp -- npx https://github.com/cloudadoption/helix-mcp 2>/dev/null \
  && ok "helix-mcp (bulk preview/publish — add token in manual steps)" \
  || warn "helix-mcp — may already be configured"

echo ""

# ── 7. VSCode MCP config ─────────────────────────────────────
echo "── VSCode MCP config ──"
VSCODE_DIR=".vscode"
MCP_FILE="$VSCODE_DIR/mcp.json"

if [ -f "$MCP_FILE" ]; then
  ok "VSCode MCP config already exists — skipping"
else
  mkdir -p "$VSCODE_DIR"
  cat > "$MCP_FILE" << 'EOF'
{
  "mcpServers": {
    "da-prod-mcp": {
      "url": "https://mcp.adobeaemcloud.com/adobe/mcp/da"
    },
    "hlx-admin": {
      "url": "http://localhost:3000"
    },
    "helix-mcp": {
      "command": "npx",
      "args": ["https://github.com/cloudadoption/helix-mcp"],
      "env": {
        "HELIX_ADMIN_API_TOKEN": "YOUR_TOKEN_HERE",
        "RUM_DOMAIN_KEY": "YOUR_RUM_KEY_HERE"
      }
    }
  }
}
EOF
  ok "VSCode MCP config written to .vscode/mcp.json"
fi
echo ""

# ── 8. Verify ────────────────────────────────────────────────
echo "── Verifying setup ──"
command -v claude   &>/dev/null && ok "claude" || warn "claude — not found"
command -v aem      &>/dev/null && ok "aem CLI" || warn "aem CLI — not found"
command -v npx      &>/dev/null && ok "npx"     || warn "npx — not found"
node -e "require('playwright')" 2>/dev/null && ok "playwright" || warn "playwright — not found"
echo ""

# ── 9. Manual steps ──────────────────────────────────────────
echo -e "${YELLOW}── Manual steps required ──${NC}"
echo ""
echo "  1. CLAUDE.AI MCP CONNECTORS (connect at claude.ai → Settings → Integrations)"
echo "     • AEM Content - Prod"
echo "     • AEM DA - Prod"
echo ""
echo "  2. ADOBE INTERNAL ONLY"
echo "     • FluffyJaws MCP — see your team lead for setup"
echo ""
echo "  3. GITHUB SETUP"
echo "     • Run: gh auth login"
echo "     • Install aem-code-sync GitHub App on your org:"
echo "       https://github.com/apps/aem-code-sync"
echo ""
echo "  4. DA ORG"
echo "     • Confirm your DA org at: https://da.live"
echo "     • Each new project needs fstab.yaml pointing to your DA org"
echo ""
echo "  5. HLX-ADMIN LOCAL SERVER (required for da_write CDN bust)"
echo "     • Run in a separate terminal before any BUILD:"
echo "       npx @adobe/hlx-admin-mcp"
echo ""
echo "  6. HELIX-MCP TOKEN (required for bulk preview/publish)"
echo "     • Get your API token: https://www.aem.live/docs/admin-apikeys"
echo "       OR capture auth_token cookie from admin.hlx.page/login"
echo "     • Add to .vscode/mcp.json → helix-mcp → env → HELIX_ADMIN_API_TOKEN"
echo "     • RUM_DOMAIN_KEY: get from your AEM org admin"
echo ""
echo "────────────────────────────────────────────────────────"
echo -e "${GREEN}Setup complete. You have XSC superpowers.${NC}"
echo "Start with: /aem-xsc"
echo ""

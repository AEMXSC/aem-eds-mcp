#!/usr/bin/env bash
# Phase 1 automated verification — run from tools/hlx-admin-mcp/
# Usage: bash test-phase1.sh
# Prerequisites: npm run build must have been run first

set -e
PASS=0
FAIL=0
SERVER_PID=""

pass() { echo "[PASS] $1"; PASS=$((PASS+1)); }
fail() { echo "[FAIL] $1"; FAIL=$((FAIL+1)); }

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
}
trap cleanup EXIT

echo "=== Phase 1 Static Checks ==="

# HOST-03: selfsigned not in dependencies
if node -e "const p=require('./package.json'); process.exit(p.dependencies['selfsigned'] ? 1 : 0)" 2>/dev/null; then
  pass "HOST-03: selfsigned removed from package.json dependencies"
else
  fail "HOST-03: selfsigned still present in package.json dependencies"
fi

# HOST-05: railway.toml exists
if test -f railway.toml; then
  pass "HOST-05: railway.toml exists"
else
  fail "HOST-05: railway.toml not found"
fi

# HOST-05: railway.toml has healthcheckPath
if grep -q 'healthcheckPath.*=.*"/health"' railway.toml 2>/dev/null; then
  pass "HOST-05: railway.toml contains healthcheckPath = \"/health\""
else
  fail "HOST-05: railway.toml missing healthcheckPath = \"/health\""
fi

# HOST-05: railway.toml has startCommand
if grep -q 'startCommand' railway.toml 2>/dev/null; then
  pass "HOST-05: railway.toml contains startCommand"
else
  fail "HOST-05: railway.toml missing startCommand"
fi

# HOST-05: railway.toml has buildCommand
if grep -q 'buildCommand' railway.toml 2>/dev/null; then
  pass "HOST-05: railway.toml contains buildCommand"
else
  fail "HOST-05: railway.toml missing buildCommand"
fi

echo ""
echo "=== Phase 1 Smoke Checks (starting server on PORT=9999) ==="

# Start server in background
PORT=9999 node dist/http.js &
SERVER_PID=$!
sleep 2

# HOST-04: GET /health returns HTTP 200
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9999/health 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass "HOST-04: GET /health returns HTTP 200"
else
  fail "HOST-04: GET /health returned $HTTP_CODE (expected 200)"
fi

# HOST-04: /health body contains status:ok
BODY=$(curl -s http://localhost:9999/health 2>/dev/null || echo "")
if echo "$BODY" | grep -q '"status"'; then
  pass "HOST-04: GET /health body contains status field"
else
  fail "HOST-04: GET /health body missing status field. Body: $BODY"
fi

# HOST-02: server responds on PORT=9999 (bound to accessible address)
if curl -sf http://localhost:9999/health > /dev/null 2>&1; then
  pass "HOST-02: Server responds on PORT=9999"
else
  fail "HOST-02: Server not reachable on PORT=9999"
fi

# HOST-03: port 3443 not open (no dual server)
if ! curl -sk https://localhost:3443/ > /dev/null 2>&1; then
  pass "HOST-03: Port 3443 not open (no dual HTTPS server)"
else
  fail "HOST-03: Port 3443 is open — dual server still running"
fi

# HOST-02: bind address is 0.0.0.0 (check source, not runtime — static check)
if grep -q '"0\.0\.0\.0"' src/http.ts 2>/dev/null; then
  pass "HOST-02: http.ts binds to 0.0.0.0"
else
  fail "HOST-02: http.ts does not contain 0.0.0.0 bind address"
fi

cleanup

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

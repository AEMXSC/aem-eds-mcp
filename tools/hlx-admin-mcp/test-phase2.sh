#!/usr/bin/env bash
# Phase 2 automated verification — run from tools/hlx-admin-mcp/
# Usage: bash test-phase2.sh
# Prerequisites: npm run build must have been run first (script will attempt rebuild)
#
# Requirements tested:
#   AUTH-01: unauthenticated POST /mcp returns 401 with login_url + WWW-Authenticate
#   AUTH-02: GET /login?session=<id> returns 302 redirect to Adobe IMS
#   AUTH-05: no hardcoded localhost:3000 in src/http.ts (static check)
#   DA-05:   da_login httpMode returns URL string (manual only — see comment below)

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
  rm -f /tmp/phase2-body.tmp
}
trap cleanup EXIT

echo "=== Phase 2 Static Checks ==="

# AUTH-05 static: no hardcoded localhost:3000 in src/http.ts
# After Phase 2, PUBLIC_URL env var replaces hardcoded localhost:3000 references
LOCALHOST_HITS=$(grep -rn 'localhost:3000' src/http.ts 2>/dev/null || true)
if [ -z "$LOCALHOST_HITS" ]; then
  pass "AUTH-05: no hardcoded localhost:3000 in http.ts"
else
  fail "AUTH-05: localhost:3000 still hardcoded in http.ts (found: $(echo "$LOCALHOST_HITS" | wc -l | tr -d ' ') occurrence(s)) — replace with PUBLIC_URL env var"
fi

echo ""
echo "=== Phase 2 Smoke Checks (starting server on PORT=9999) ==="

# Rebuild before smoke checks — non-fatal if build was already current
npm run build 2>/dev/null || true

# Start server with ADOBE_IMS_CLIENT_ID set so IMS_OAUTH_ENABLED=true activates auth guard
# (When ADOBE_IMS_CLIENT_ID is set, the server enforces Bearer token auth on /mcp)
PORT=9999 ADOBE_IMS_CLIENT_ID=test-client node dist/http.js &
SERVER_PID=$!
sleep 2

# AUTH-01 check 1: unauthenticated POST /mcp returns HTTP 401
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:9999/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "401" ]; then
  pass "AUTH-01: unauthenticated POST /mcp returns 401"
else
  fail "AUTH-01: unauthenticated POST /mcp returned $HTTP_CODE (expected 401)"
fi

# AUTH-01 check 2: 401 body contains login_url field
curl -s -o /tmp/phase2-body.tmp \
  -X POST http://localhost:9999/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  2>/dev/null || true
if grep -q '"login_url"' /tmp/phase2-body.tmp 2>/dev/null; then
  pass "AUTH-01: 401 response body contains login_url field"
else
  fail "AUTH-01: 401 response body missing login_url field (body: $(cat /tmp/phase2-body.tmp 2>/dev/null || echo '<empty>'))"
fi

# AUTH-01 check 3: 401 response includes WWW-Authenticate header
WWW_AUTH=$(curl -sI \
  -X POST http://localhost:9999/mcp \
  -H "Content-Type: application/json" \
  2>/dev/null | grep -i 'www-authenticate' || true)
if [ -n "$WWW_AUTH" ]; then
  pass "AUTH-01: 401 response includes WWW-Authenticate header"
else
  fail "AUTH-01: 401 response missing WWW-Authenticate header"
fi

# AUTH-02 check 1: GET /login?session=<id> returns HTTP 302
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:9999/login?session=test-uuid-1234" \
  2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "302" ]; then
  pass "AUTH-02: GET /login?session=<id> returns 302 redirect"
else
  fail "AUTH-02: GET /login?session=<id> returned $HTTP_CODE (expected 302)"
fi

# AUTH-02 check 2: Location header points to Adobe IMS
LOCATION=$(curl -sI \
  "http://localhost:9999/login?session=test-uuid-1234" \
  2>/dev/null | grep -i '^location:' || true)
if echo "$LOCATION" | grep -qi 'ims-na1.adobelogin.com'; then
  pass "AUTH-02: /login redirect points to Adobe IMS (ims-na1.adobelogin.com)"
else
  fail "AUTH-02: /login Location header missing ims-na1.adobelogin.com (got: $LOCATION)"
fi

# DA-05: da_login httpMode — tested manually (requires auth)
# Automated check skipped — full verification requires a live IMS Bearer token.
# Manual test: after AUTH-03/AUTH-04 are passing, call da_login with a valid session Bearer
# and confirm the response contains a URL string, not "Browser opened".
echo "[SKIP] DA-05: da_login httpMode behavior requires live auth — manual verification only"

cleanup

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

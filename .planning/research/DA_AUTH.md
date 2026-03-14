# DA API Authentication Deep Research

**Project:** mcp.aemxsc.com — AEM EDS Content Management MCP Server
**Researched:** 2026-03-14
**Focus:** Server-side authentication for DA (Document Authoring) APIs without browser-based login
**Overall confidence:** HIGH (source code verified, auth mechanism confirmed)

---

## Executive Summary

The DA API authentication problem is real and significant. After examining the da-live and da-admin source code directly, this research confirms that DA APIs (`content.da.live`, `admin.da.live`) use **IMS Bearer tokens exclusively**, validated against Adobe's Identity Management System. The `darkalley` OAuth client is the internal client ID used by the da.live web application, configured with the `aem.frontend.all` scope. No API key path exists for DA. No Adobe Developer Console OAuth Server-to-Server credential has access to this scope. The only viable server-side approach is a **refresh token delegation pattern** where a user authenticates once via browser and the resulting refresh token is stored as a secret for server-side renewal.

---

## 1. tools.aem.live — What It Is

**URL:** https://tools.aem.live/

**What it is:** An internal Adobe administrative control panel for AEM EDS sites. It provides:
- Site Admin (manage sites across an org)
- User and role administration
- Log viewer, page status, site query
- CDN setup and validation
- robots.txt, sitemap, index management
- Deep PSI performance comparison
- Admin API endpoint access via "Admin Edit"
- JSON2HTML template simulator

**What it does NOT offer:**
- No DA (Document Authoring) content.da.live or admin.da.live capabilities
- No API documentation or programmatic access tokens
- No authentication mechanism for external integrations
- No mention of darkalley, IMS client IDs, or service accounts

**Verdict:** tools.aem.live is irrelevant to the DA authentication problem. It is a UI admin console for EDS site management (CDN, publish, preview operations), not a DA content API gateway.

**Confidence:** HIGH (page fetched and analyzed directly)

---

## 2. DA API Authentication Options — Complete Inventory

### 2a. What the Source Code Confirms

**Source:** `adobe/da-live` `scripts/scripts.js` and `adobe/da-admin` `src/utils/auth.js`

The da-live application configures IMS with:
```javascript
// From adobe/da-live scripts/scripts.js (verified via raw GitHub fetch)
const CONFIG = {
  imsClientId: 'darkalley',
  imsScope: 'ab.manage,AdobeID,gnav,openid,org.read,read_organizations,session,aem.frontend.all,additional_info.ownerOrg,additional_info.projectedProductContext,account_cluster.read'
}
```

The da-admin worker (`adobe/da-admin` `src/utils/auth.js`) validates tokens by:
1. Extracting the `Authorization: Bearer <token>` header
2. Verifying the JWT signature against `${IMS_ORIGIN}/ims/keys`
3. Checking token type is `access_token` and not expired
4. Fetching user profile from `${IMS_ORIGIN}/ims/profile/v1`
5. Fetching org/group memberships from IMS
6. Applying path-based ACL checks

**Critical finding from `src/index.js`:**
```javascript
// Anonymous users are hard-blocked with 401
const anon = users.some((user) => user.email === 'anonymous');
if (anon) return daResp({ status: 401 });

// Authenticated but unauthorized users get 403
if (!authorized) return daResp({ status: 403 });
```

There is **no anonymous read access path** and **no API key support** in the da-admin codebase. The `getUsers()` function accepts only `Authorization: Bearer <IMS_JWT>` — no X-Auth-Token, no API key headers.

**Confidence:** HIGH (source code read directly)

### 2b. Option 1: Browser-Based darkalley OAuth (Current Only Confirmed Method)

**How it works:**
1. User visits da.live in a browser
2. Nexter/Milo framework initializes IMS with `client_id: 'darkalley'`
3. IMS redirect/popup flow completes
4. Access token stored in memory/localStorage under `nx-ims`
5. `daFetch()` reads token and injects `Authorization: Bearer <token>` on all calls to `content.da.live` and `admin.da.live`

**Token lifetime:** Access tokens expire in 24 hours. Refresh tokens expire in 14 days (Adobe IMS default).

**Server-side viability:** None directly. This is a browser flow requiring user interaction.

**Confidence:** HIGH

### 2c. Option 2: Refresh Token Storage Pattern (BEST SERVER-SIDE APPROACH)

**Feasibility:** POSSIBLE with limitations.

**How it works:**
1. A user (org admin) authenticates once via browser using the darkalley OAuth flow
2. If the `offline_access` scope is requested and granted, IMS returns a refresh token
3. The refresh token is stored as a Railway env var secret
4. The MCP server uses the refresh token to get fresh access tokens from IMS without user interaction:

```
POST https://ims-na1.adobelogin.com/ims/token/v3
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=<stored_refresh_token>
&client_id=darkalley
&client_secret=<darkalley_secret>
```

**Critical unknowns:**
- The `offline_access` scope is NOT in da-live's configured scope string (confirmed from source). The scopes are: `ab.manage,AdobeID,gnav,openid,org.read,read_organizations,session,aem.frontend.all,additional_info.ownerOrg,additional_info.projectedProductContext,account_cluster.read` — no `offline_access`.
- Without `offline_access`, IMS does not return a refresh token in the OAuth response.
- The `darkalley` client_secret is not public (it's an internal Adobe OAuth app). You cannot perform the token refresh server-side without the client_secret.
- Adobe IMS refresh tokens expire in 14 days by default, requiring re-authentication anyway.

**Verdict:** The refresh token approach is theoretically sound but practically blocked because (a) `offline_access` is not in darkalley's scope configuration and (b) the darkalley client_secret is not accessible externally. Even if you extracted a refresh token from a browser session, you cannot exchange it without the client_secret.

**Confidence:** MEDIUM (token flow verified; scope limitation inferred from source code)

### 2d. Option 3: Per-User Token Delegation (Viable for Hosted MCP)

**How it works:**
Each user of the MCP server provides their own IMS access token obtained from da.live. The MCP server acts as a proxy, passing the user's token to DA APIs.

**Implementation for hosted MCP at mcp.aemxsc.com:**
1. User authenticates at da.live or via an MCP OAuth flow
2. User provides their IMS access token to the MCP server (via MCP auth header, env config, or a dedicated auth endpoint)
3. MCP server stores the token in the user's session context
4. All DA API calls use the user's token: `Authorization: Bearer <user_token>`
5. When token expires (24h), user re-authenticates

**Practical approach:**
- Build a lightweight OAuth callback endpoint at mcp.aemxsc.com/auth that initiates the darkalley IMS flow (if darkalley is an OIDC-capable public client — to be verified)
- Or, document that users must provide their IMS token from da.live (extractable from browser localStorage `nx-ims`)
- Store token per-user-session in the MCP server, refreshing via the IMS token endpoint when possible

**Confidence:** MEDIUM (architecture sound; darkalley PKCE/public client status unverified)

### 2e. Option 4: HLX Admin API Keys (Does NOT Work for DA)

**Source:** https://www.aem.live/docs/admin-apikeys

HLX Admin API keys (`hlx_create_apikey` / `hlx_list_apikeys`) work exclusively with `admin.hlx.page` endpoints:
- `POST/GET https://admin.hlx.page/config/{org}/sites/{site}/apiKeys.json`

These keys use `X-Auth-Token` or `Authorization: token <key>` headers — a completely different auth scheme from the IMS Bearer tokens that DA APIs require.

**The da-admin source code has no `X-Auth-Token` handling.** It only processes `Authorization: Bearer <IMS_JWT>`.

**Verdict:** HLX API keys do NOT work for `content.da.live` or `admin.da.live`. They are entirely separate systems with different authentication infrastructure.

**Confidence:** HIGH (both systems' auth code verified via source)

### 2f. Option 5: Adobe Developer Console OAuth Server-to-Server (Does NOT Work)

Standard Adobe Developer Console OAuth Server-to-Server credentials cannot request the `aem.frontend.all` scope — this scope is restricted to the `darkalley` client registered by Adobe internally. Adobe's public API console does not expose DA API access.

**Verdict:** Confirmed non-viable. This was already known from previous debugging.

**Confidence:** HIGH

### 2g. Option 6: Token Extracted from Active da.live Session (Workaround)

A user can extract their IMS access token from an active da.live browser session:
1. Open da.live in browser, log in
2. Open DevTools > Application > Local Storage or check `window.adobeIMS.getAccessToken()`
3. The token is valid for 24 hours
4. Provide it as an env var to the MCP server: `DA_ACCESS_TOKEN=<extracted_token>`
5. MCP server uses it for all DA API calls
6. Token must be refreshed manually every 24 hours

**Viability for hosted server:** Poor for automated/unattended use. Acceptable for personal/development use where a human can re-authenticate daily.

**Confidence:** HIGH (mechanism understood from source)

---

## 3. Recommended Approach for Hosted Server at mcp.aemxsc.com

### Recommendation: Per-User OAuth Delegation with MCP Auth Flow

**Architecture:**

```
User → MCP Client (Claude Desktop / Cursor)
         ↓
     mcp.aemxsc.com/auth  ←── initiates Adobe IMS OAuth flow (darkalley or alternate client)
         ↓
     Adobe IMS → user grants access → redirect back with code
         ↓
     mcp.aemxsc.com exchanges code for access_token + (if possible) refresh_token
         ↓
     Token stored in encrypted session (Redis/Railway KV)
         ↓
     All DA API calls: Authorization: Bearer <user_token>
         ↓
     content.da.live / admin.da.live
```

**Key implementation decisions:**

1. **OAuth client:** Determine if `darkalley` is a public OIDC client that supports PKCE (no client_secret needed). If yes, the MCP server can initiate auth flows using darkalley client_id with PKCE. If no (confidential client requiring a secret), you need Adobe to issue a new OAuth client for mcp.aemxsc.com — which requires contacting the DA team.

2. **Token storage per user:** Each user of the MCP server has their own token stored server-side. Use an encrypted store (Railway env-scoped Redis or Cloudflare KV) keyed by user session ID.

3. **Token refresh:** If `offline_access` is available (even outside the default darkalley scope — needs testing), store refresh tokens. Otherwise implement a re-auth prompt when the user's 24h token expires.

4. **Fallback (simplest):** Accept a `DA_ACCESS_TOKEN` env var for single-user deployments. The user sets this to their token extracted from da.live. The MCP server uses it until it expires, then returns a helpful error directing re-authentication.

### Recommended Phase Approach

**Phase 1 — Ship now (single-user):**
- Accept `DA_ACCESS_TOKEN` as Railway env var
- User extracts token from da.live browser session
- Document the extraction process clearly
- Token valid 24h; user re-sets when expired
- This unblocks the entire MCP server build

**Phase 2 — Self-service auth:**
- Build `/auth` OAuth flow at mcp.aemxsc.com
- Test if darkalley is a public client (PKCE, no secret)
- If public: full OAuth flow works without Adobe involvement
- If confidential: contact DA team to register mcp.aemxsc.com as an OAuth client
- Enable token refresh if `offline_access` becomes available

**Phase 3 — Contact Adobe DA team:**
- File an issue on adobe/da-live requesting server-to-server auth support or API key access for integrations
- The da-live team has active discussion (issue #278, discussion #241) about auth evolution
- This is a legitimate feature request for integration partners

---

## 4. Whether HLX API Keys Work for DA

**Answer: No.** Confirmed via:

1. `admin.hlx.page` API keys use `X-Auth-Token` / `Authorization: token <key>` — documented at aem.live/docs/admin-apikeys
2. `admin.da.live` auth (`da-admin` source) accepts ONLY `Authorization: Bearer <IMS_JWT>`
3. The da-admin `getUsers()` function has zero handling for non-IMS token formats
4. The two systems are entirely separate Cloudflare Worker deployments with separate auth stacks

The `hlx_create_apikey` and `hlx_list_apikeys` MCP tools are useful for `admin.hlx.page` operations (preview, publish, cache purge, site config) but have no path to DA content management.

**Confidence:** HIGH

---

## 5. GitHub and Experience League References

### Source Code (Verified)

| Source | Finding | Confidence |
|--------|---------|------------|
| `adobe/da-live` `scripts/scripts.js` | `imsClientId: 'darkalley'`, full scope string | HIGH |
| `adobe/da-admin` `src/utils/auth.js` | IMS-only JWT validation, no API key support, anonymous → 401 | HIGH |
| `adobe/da-admin` `src/index.js` | Hard 401 for anonymous, 403 for unauthorized | HIGH |
| `adobe/da-admin` `src/utils/daCtx.js` | `daCtx.authorized` from ACL, no bypass | HIGH |
| `adobe/da-admin` `wrangler.toml` | 5 environments (prod, stage, ci, dev, it), R2 + KV bindings | HIGH |
| `adobe/da-live` `blocks/shared/utils.js` | Token from `nx-ims` localStorage, `daFetch()` injects Bearer header | HIGH |

### Official Documentation

| URL | Relevance |
|-----|-----------|
| https://www.aem.live/docs/admin-apikeys | HLX API keys — NOT for DA |
| https://www.aem.live/docs/authentication-setup-authoring | Authoring auth — browser-based Adobe Identity |
| https://developer.adobe.com/developer-console/docs/guides/authentication/UserAuthentication/ims | IMS token lifetimes: access 24h, refresh 14 days |
| https://developer.adobe.com/developer-console/docs/guides/authentication/UserAuthentication/ | `offline_access` scope required for refresh tokens |
| https://opensource.adobe.com/da-admin/ | Older DA admin docs (being migrated to docs.da.live) |

### GitHub Discussions

| Discussion | Relevance |
|-----------|-----------|
| adobe/da-live #241 "Authorization solution proposal" | Sheet-based ACL for user groups — no service account approach |
| adobe/da-live #278 "Auth App" | Group mapping UI — IMS org-based, user tokens only |
| adobe/da-live #67 "Config & KV thoughts" | KV used for auth data per-request — no API key alternative |
| adobe/da-live #453 "Do not send access token on the request line" | Security fix for token exposure |

### AEM MCP (Different System — Not DA)

Adobe has MCP support at `https://mcp.adobeaemcloud.com/adobe/mcp/` for AEM as a Cloud Service — but this is the AEM CS product (Sites, Assets, Cloud Manager), not DA/da.live. It uses user Adobe ID OAuth. No DA API access.

---

## 6. Key Findings Summary

| Finding | Status | Confidence |
|---------|--------|------------|
| `darkalley` is confirmed as the da-live OAuth client_id | CONFIRMED | HIGH |
| DA APIs validate IMS JWT Bearer tokens exclusively | CONFIRMED | HIGH |
| No API key support exists in da-admin | CONFIRMED | HIGH |
| Anonymous access is hard-blocked with 401 | CONFIRMED | HIGH |
| HLX admin API keys do NOT work for DA | CONFIRMED | HIGH |
| Adobe Dev Console S2S credentials cannot access DA | CONFIRMED | HIGH |
| `offline_access` is NOT in darkalley's default scope | LIKELY (inferred from source) | MEDIUM |
| darkalley client_secret is not publicly available | CONFIRMED (internal Adobe app) | HIGH |
| Per-user token delegation is viable architecture | YES | MEDIUM |
| Refresh token approach is blocked by scope + secret | LIKELY BLOCKED | MEDIUM |
| tools.aem.live has no DA API or auth capabilities | CONFIRMED | HIGH |

---

## 7. Gaps and Open Questions

1. **Is darkalley a public OIDC client?** — If it supports PKCE (no client_secret), the MCP server could initiate auth flows using the known client_id. This needs a test: attempt `GET https://ims-na1.adobelogin.com/ims/authorize/v2?client_id=darkalley&response_type=code&scope=aem.frontend.all&code_challenge=...&code_challenge_method=S256`. If it returns a valid auth dialog, PKCE works.

2. **Does IMS return a refresh token in the darkalley flow?** — Open a browser, log into da.live, check the IMS token response in Network tab for `refresh_token` field. If present, the 14-day refresh token could be extracted and used server-side (still requires client_secret for exchange, but worth knowing).

3. **Can Adobe issue a partner OAuth client for mcp.aemxsc.com?** — The DA team would need to register a new OAuth application with appropriate scopes. This is the cleanest long-term solution but requires Adobe involvement. Contact: adobe/da-live GitHub issues.

4. **Does `content.da.live` (read-only endpoint) have different auth than `admin.da.live`?** — The read endpoint may have more permissive auth for public/unlocked content. Needs empirical testing with no auth header vs. Bearer token on a public DA-hosted page.

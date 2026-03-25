# Personalize the Demo Site via MCP — No Browser Required

**Trigger:** XSC needs demo site content updated before a call, without opening a browser.

**Execute the MCP calls immediately. Do not explain what you are about to do.**

---

## Pre-flight — run before any writes

```
1. hlx-admin-mcp running?
   → curl http://localhost:3000 — if no response, start it:
     npx @adobe/hlx-admin-mcp
   → Without it, da_write writes content but CDN never busts.
     XSC sees no change on the live site. Do not skip this check.

2. DA auth valid?
   → da_login → da_whoami → confirm identity before touching anything
   → If token expired, re-authenticate via OAuth before proceeding.
     Do not attempt writes with an expired token.
```

## Execute this sequence

```
1. da_login        → check token, re-authenticate via OAuth if expired
2. da_whoami       → confirm identity + derive DA org (no need to ask XSC)
3. da_get_source   → read current page to preserve structure before overwriting
4. da_write        → apply each content change → CDN preview triggered → published ✓
   (repeat da_get_source + da_write per page — never write blind)
   If 5+ pages: use helix-mcp bulk preview instead — one API call, poll job status
5. /campaign/ check → does /campaign/ exist on this site?
   No  → create 5 campaign pages (vertical-appropriate, formal US English tone)
         da_write all 5 → CDN preview triggered → published ✓
   Yes → da_get_source each /campaign/ page → update content to match
         new vertical/regional tone → da_write → published ✓
6. Playwright Bash → screenshot homepage + /campaign/ pages at 1280px
                     confirm changes rendered on live CDN, not just preview
                     delete script after
```

## Run all page updates in parallel where pages are independent

Pages with no content dependency on each other can be updated simultaneously. Do not update sequentially when parallel is possible.

## Return when done

```
✓ Hero headline updated — [preview URL]
✓ Sub-headline updated — [preview URL]
✓ Product descriptions updated (3) — [preview URL]
All changes live on CDN. Visual confirmation: [screenshot summary]

✓ EPA demo ready:
  Campaign pages (5): [preview URLs for /campaign/ pages]
  EPA prompt (copy-paste on the call):
  "Update hero headlines and product descriptions across all pages
  under /campaign/ to reflect [EMEA / APAC / LatAm] regional tone.
  Show me a preview before applying."
```

**Constraint:** `hlx-admin-mcp` must be running locally (`npx @adobe/hlx-admin-mcp`) and connected before `da_write` can trigger CDN preview. If not connected, `da_update_source` writes content but does not bust the CDN cache — the live site will not reflect changes until manually previewed.

**Time target:** 5 updates live in under 5 minutes.

---

## YOLO Mode — Wake Up With a Personalized Demo Site

**When to use:** You have a demo site. You need content updated for a specific customer, vertical, or regional market before tomorrow's call.

**Give the AI this before you close your laptop:**

```
Demo site: [preview URL or DA org/repo]
Customer / vertical: [name + industry]
Regional market: [e.g. EMEA / APAC / LatAm — or "keep US English"]
Updates needed: [e.g. "hero headline to emphasize patient outcomes" or "all product descriptions to financial services tone"]
Go. Wake me up when it's live.
```

**YOLO rules — AI executes all of these without stopping:**

```
Decision point                      → Rule
hlx-admin-mcp not running          → Start it. If start fails, fall back to
                                      da_update_source. Flag: CDN not busted —
                                      XSC must preview in Sidekick before the call.
DA token expired                    → Re-authenticate via OAuth. Do not attempt
                                      writes with expired token.
Pages unclear                       → da_whoami → read site structure →
                                      identify home + key campaign pages.
                                      Never ask the XSC.
Page order unclear                  → Update home first, then /campaign/ pages,
                                      then supporting pages. Parallel where independent.
Content tone unclear                → Default to benefit-led, conversational,
                                      customer-outcome focused. Adapt to vertical.
Regional variant unclear            → Keep US English. Flag in report.
5+ pages to publish                → Use helix-mcp bulk preview API —
                                      not individual da_write calls.
                                      POST /preview/{org}/{site}/main/*
                                      with all paths in one payload.
                                      Poll job status before declaring done.
                                      Fall back to individual da_write if
                                      HELIX_ADMIN_API_TOKEN not configured.

Campaign pages missing              → Create /campaign/ subfolder with 5 pages.
                                      Vertical-appropriate content, formal US English.
                                      This makes EPA demo runnable on the call.
Playwright screenshot fails         → Retry once. Skip and flag if still failing.
Any ambiguity                       → Make a decision. Log it. Keep going.
```

**Wake-up report — output this when done:**

```
✓ Pages updated: [list with preview URLs]
✓ Content changes: [summary of what was updated]
✓ All changes live on CDN. Visual confirmation: [screenshot summary]

✓ EPA demo ready:
  Campaign pages (5): [preview URLs for /campaign/ pages]
  Content: [vertical]-appropriate, formal US English tone
  Author URL: https://author-<env>.adobeaemcloud.com
  EPA prompt (copy-paste on the call):
  "Update hero headlines and product descriptions across all pages
  under /campaign/ to reflect [EMEA / APAC / LatAm] regional tone.
  Show me a preview before applying."

Ready for your call. Open [preview URL].
```

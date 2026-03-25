# Pre-Demo Checklist + Crisis Playbook

**Primary trigger:** Run this 30 minutes before every demo call.
If everything passes, you never need the crisis section below.

**Crisis trigger:** Something is broken, call is imminent — skip to the failure mode table.

**Diagnose and output the fix immediately. Do not ask clarifying questions unless the symptom is completely ambiguous.**

---

## 30-Minute Pre-Call Checklist — run this before every demo

**Execute all checks in parallel. Flag any failure immediately.**

```
□ Open demo URL in incognito — confirm it loads without auth
□ Run PageSpeed on demo URL — confirm 95+ (100 preferred)
□ Open play.llmo.now in incognito — confirm it loads (fallback play)
□ If ASO demo: paste customer URL, confirm issues appear (not zero)
□ If EPA demo: confirm Author URL — NOT Publish URL
□ If COA demo: open AEM Assets → select asset → "Copy URL" →
               confirm format options visible (= DMwOA active)
□ If GenStudio demo: confirm Firefly sandbox is live with SE
□ If EDS/UE demo: open UE edit URL, confirm blocks load and are editable
□ If DA demo: open da.live, confirm pages are published and accessible
□ Open Frescopa as backup: main--frescopa--hlxsites.aem.live ✓
□ Record a 2-min walkthrough NOW if you do not have one on file
  (Loom or QuickTime — you will need it if anything breaks live)
```

**If all pass → you are ready. Close this use-case.**
**If anything fails → continue to the fix section below.**

---

## ASO showing zero issues — check in this order

**1. URL behind auth wall (most common)**
Test: open in incognito, not signed in.
Fix: use public-facing URL, not authenticated preview or staging.

**2. CDN caching a clean state**
Test: add `?nocache=1` and re-run.
Fix: wait 5 minutes or switch to a URL with known issues.

**3. Wrong URL format**
ASO requires root domain or top-traffic page — not subdirectories.
Fix: run on `https://customersite.com` not `/en/us/products/`.

**4. Site is already clean (rare)**
If PageSpeed is 95+ and meta is clean, ASO has nothing to flag.
Pivot: *"Let me show you something more interesting — how your site appears in AI search."* → switch to LLMO.

## Fallback — switch to Frescopa in under 2 minutes

URL: `https://main--frescopa--hlxsites.aem.live/`
Has known ASO opportunities pre-loaded.
Narrative: *"Let me show you what this looks like on a site we already analyzed — then we run yours live in your trial."*

This is not a retreat. It is the trial close.

## Other failures — immediate fixes

| Symptom | Cause | Fix |
|---|---|---|
| EPA returning nothing | Publish URL — not Author URL | Switch to `author-<env>.adobeaemcloud.com` |
| COA images not generating | DMwOA not enabled | Switch to XSC Showcase, verify DMwOA in manifest |
| UE not loading blocks | Missing `component-definition.json` | Copy from ise-boilerplate, redeploy |
| DA preview not triggering | `aem-code-sync` not installed | Install at `github.com/apps/aem-code-sync`, re-push a commit |
| Agents not in Playground | Wrong org | Use XSC Showcase — Playground is personal folders only |

## If nothing fixes in 30 minutes

Run the recorded walkthrough. *"I want to show you the live version on your site — I'll send you that recording plus a trial link so you can run it yourself before our next call."*

A controlled recorded walkthrough beats a broken live demo.

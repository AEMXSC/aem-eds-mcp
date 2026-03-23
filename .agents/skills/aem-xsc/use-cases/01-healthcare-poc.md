# Build a Custom Healthcare POC Before Tomorrow

**This is a BUILD scenario — the skill executes, not just advises.**

```
I have a discovery call with Memorial Health System tomorrow — CMO + digital VP.
They want to see a healthcare-branded demo site with DA authoring for the content team
and Universal Editor for the IT team, plus the AI content optimization agent workflow.
Build it. Base on ise-boilerplate. Deploy to a new GitHub repo.
```

**What the skill actually does:**

First scans every org for existing healthcare assets before building anything new:
- `AdobeDevXSC`: `blue-shield-ca`, `hillrom-baxter`, `baxter`, `stryker`, `stryker-da`
- `AEMXSC`: `poc-cr-nationwide` (CLAUDE.md + AGENTS.md pre-wired), `poc-cr-nationwide-mutual`
- `aemdemos`: summit series with health-adjacent blocks

If a match exists — clones it and adapts branding. If not — scaffolds from `ise-boilerplate` and executes the full build sequence:

1. `fstab.yaml` configured for DA content mount
2. Custom blocks built for the healthcare demo narrative (`/content-driven-development`)
3. DA authoring configured — content structure, table format, Sidekick setup
4. Universal Editor wired — `component-definition.json`, `component-filters.json`, `component-models.json`, per-block UE model files for every block
5. Demo content pages created in DA table structure
6. GitHub repo created, `aem-code-sync` app installed, code live on CDN
7. PageSpeed validated at 100 before you walk into the call (`/testing-blocks`)

Flags the one constraint that bites every XSC: COA requires DMwOA enabled — verify your Showcase environment has it before you promise it live.

**Time comparison:**
- Last year without AI: 2–3 developer days minimum. XSC either waited for  Dev support or showed a generic demo
- With SuperSkills: 4–6 hours to first live preview. Run it overnight, walk in with a branded healthcare site the customer has never seen before

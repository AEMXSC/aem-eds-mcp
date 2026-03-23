---
name: validation-agent
description: Compares implemented navigation to source screenshots and invokes excat-page-critique. Detects row, spacing, font, interaction, megamenu mismatches. Forces re-analysis on mismatch. Invoked by excat-navigation-orchestrator. Do NOT use without running page-critique or block-critique first.
---

# Validation Agent

Compares **implemented** structure against **source** screenshots. Invokes `excat:excat-page-critique` (or block-critique for header). If mismatch detected, reports FAIL and triggers re-analysis loop; does **not** silently adjust.

## Input

| Field | Required | Description |
|-------|----------|-------------|
| `sourceHeaderScreenshot` | Yes | Original header (desktop and optionally mobile). |
| `migratedPageUrl` | Yes | e.g. `http://localhost:3000{migratedPath}.html`. |
| `desktopMapping` | Yes | Structured output from desktop-navigation-agent. |
| `mobileMapping` | No | From mobile-navigation-agent if applicable. |
| `megamenuMapping` | No | From megamenu-analysis-agent if applicable. |

## Dependencies

- **excat:excat-page-critique** — Full page comparison and CSS fix iteration. Use when validating full page including header.
- **excat:excat-block-critique** — Header-only comparison when header is treated as block (blockName `header`). Use when validating header component only.

Invoke one of the above as specified by orchestrator (typically page-critique for full page; block-critique for header-only quality).

## Output (Strict JSON Only)

Return only this shape. No prose.

```json
{
  "status": "PASS | FAIL",
  "similarityScore": 0.0,
  "rowMatch": true,
  "spacingMatch": true,
  "fontMatch": true,
  "interactionMatch": true,
  "megamenuGroupingMatch": true,
  "mismatches": [],
  "critiqueReportPath": "",
  "recommendReAnalysis": false,
  "notes": []
}
```

- `status`: PASS only when no mismatches require re-analysis.
- `similarityScore`: From page-critique or block-critique report (0–1).
- `rowMatch`, `spacingMatch`, `fontMatch`, `interactionMatch`, `megamenuGroupingMatch`: Boolean; false if validation or critique report indicates mismatch.
- `mismatches`: List of strings describing each mismatch (row, spacing, font, interaction, megamenu grouping).
- `critiqueReportPath`: Path to `critique-report.json` or session dir from critique skill.
- `recommendReAnalysis`: true if orchestrator must trigger re-analysis loop.
- `notes`: Any clarification (e.g. viewport, block name).

## Execution Steps

1. Run comparison: Invoke **excat:excat-page-critique** with `originalUrl` (source) and `migratedPath`, **or** invoke **excat:excat-block-critique** with blockName `header` and appropriate page. Use session output and `critique-report.json`.
2. Compare implemented header to source screenshot and to desktop/mobile/megamenu mappings:
   - Row count and structure (rowMatch).
   - Spacing (spacingMatch).
   - Fonts (fontMatch).
   - Trigger and open behavior (interactionMatch).
   - Megamenu columns and grouping (megamenuGroupingMatch).
3. If any mismatch: set `recommendReAnalysis: true`, set corresponding `*Match` to false, append to `mismatches`. Set `status: FAIL`.
4. Return JSON. Orchestrator MUST trigger re-analysis when `recommendReAnalysis` is true; do not silently adjust.

## Schema conformance (required)

Output MUST validate against `../references/validation-agent-schema.json`. Required fields: status, similarityScore, rowMatch, spacingMatch, fontMatch, interactionMatch, megamenuGroupingMatch, mismatches, critiqueReportPath, recommendReAnalysis, notes. status must be exactly "PASS" or "FAIL". No additional properties. Orchestrator validates with `scripts/validate-output.js`.

## Example

**User says:** "Validate migrated header against source"

**Actions:** (1) Invoke page-critique comparing source vs migrated header screenshots. (2) Extract similarity score and mismatch flags. (3) Row count matches (3/3), spacing matches, font differs (weight 600 vs 400), interaction matches. (4) Set `fontMatch: false`, `status: "FAIL"`, `recommendReAnalysis: true`, list font mismatch in `mismatches`.

**Result:** Validation JSON with FAIL status and actionable mismatch list, triggering re-analysis in orchestrator.

## Testing

**Trigger:** "Validate migrated header", "Compare implemented nav to source", "Run validation agent on header".
**Paraphrased:** "Does the migrated header match the original?", "Check header implementation quality".
**Do NOT use for:** Pre-implementation analysis, mobile-only validation, or without running page-critique first.

**Functional:** Confirm output validates with `node scripts/validate-output.js <output.json> references/validation-agent-schema.json`.

## Troubleshooting

| Issue | Cause | Action |
|-------|--------|--------|
| Page-critique not run | Skipped comparison | Must invoke excat-page-critique or excat-block-critique; use report for similarityScore and mismatch flags. |
| Mismatch detected | Implemented differs from source | Set recommendReAnalysis: true, corresponding *Match to false, append to mismatches, status: FAIL. Do not silently fix. |
| Validation fails | Wrong types or missing keys | Emit only the schema-defined shape; all booleans and arrays present. |

## Do NOT

- Silently adjust or “fix” structure; only report.
- Skip invocation of page-critique or block-critique when comparing implemented vs source.
- Set PASS when a clear mismatch exists (row, spacing, font, interaction, megamenu).
- Add properties not in the schema.

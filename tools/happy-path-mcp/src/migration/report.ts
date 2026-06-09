import type { ScoreResult } from "./scorer.js";

export function generateMarkdownReport(result: ScoreResult, customerName?: string): string {
  const { score, ease, blockInventory: inv, riskFactors, phases, assumptions, url, assessedAt } = result;
  const date = assessedAt.slice(0, 10);
  const title = customerName ? `${customerName} — Migration Assessment` : `Migration Assessment: ${url}`;

  const rows = [
    ["Adopt as-is",    inv.adopt,           "Standard EDS blocks, zero migration effort"],
    ["Customize",      inv.customize,       "Minor adaptation needed"],
    ["Custom net-new", inv.custom,          "Full implementation required"],
    ["Simple services",inv.simple_service,  "Stateless API integrations"],
    ["Complex services",inv.complex_service,"Stateful/advanced integrations"],
    ["SPA sections",   inv.spa,             "Single-page app components"],
  ] as const;

  const blockTable = [
    "| Tier | Count | Notes |",
    "|------|------:|-------|",
    ...rows.map(([tier, count, notes]) => `| ${tier} | ${count} | ${notes} |`),
    `| **Total** | **${inv.total}** | |`,
  ].join("\n");

  const riskSection = riskFactors.length > 0
    ? riskFactors.map(r => `- **${r.name}** (+${r.penalty} pts): ${r.detail}`).join("\n")
    : "- No significant risk factors detected";

  const phaseSection = phases.map(p => {
    const [min, max] = p.durationWeeks;
    const deps = p.dependencies.length > 0
      ? `  - **Dependencies:** ${p.dependencies.join(", ")}`
      : "";
    return [
      `### ${p.name}`,
      `- **Scope:** ${p.scope}`,
      `- **Duration:** ${min}–${max} weeks`,
      deps,
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const assumptionsList = assumptions.map(a => `- ${a}`).join("\n");

  return `# ${title}

**Date:** ${date}
**URL:** ${url}
**Score:** ${score}/100 — **${ease}**

> Score interpretation: 76–100 Easy · 51–75 Moderate · 26–50 Hard · 0–25 Very Hard
> Scores are intentionally conservative (upper bound on migration effort).

---

## Block Inventory

${blockTable}

**Complex Block Ratio:** ${(inv.complexRatio * 100).toFixed(0)}%

---

## Risk Factors

${riskSection}

---

## Phase Timeline

${phaseSection}

---

## Assumptions

${assumptionsList}

---

## Next Steps

1. **Refine scoring** — run full block inventory across the complete site (${phases[2]?.durationWeeks ? `est. ${phases[2].durationWeeks[0]}–${phases[2].durationWeeks[1]} weeks` : "see timeline above"})
2. **Generate POV** — combine with customer data via \`customer_pov\` workflow
3. **Generate PowerPoint** — run \`/generate-pptx\` to produce an Adobe-branded deck
`;
}

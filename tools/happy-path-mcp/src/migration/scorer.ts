import type { BlockInventory, PageSignals } from "./classifier.js";
import type { SiteStats } from "./scraper.js";

export type EaseLabel = "Easy" | "Moderate" | "Hard" | "Very Hard";

export interface PhaseEstimate {
  name: string;
  scope: string;
  durationWeeks: [number, number]; // [min, max]
  dependencies: string[];
}

export interface RiskFactor {
  name: string;
  penalty: number;
  detail: string;
}

export interface ScoreResult {
  url: string;
  score: number;
  ease: EaseLabel;
  blockInventory: BlockInventory;
  riskFactors: RiskFactor[];
  phases: PhaseEstimate[];
  assumptions: string[];
  assessedAt: string;
}

function easeLabel(score: number): EaseLabel {
  if (score >= 76) return "Easy";
  if (score >= 51) return "Moderate";
  if (score >= 26) return "Hard";
  return "Very Hard";
}

function computeBlockPenalty(inventory: BlockInventory): number {
  const { complexRatio, complex_service, spa } = inventory;
  if (spa > 0 || complex_service > 2 || complexRatio > 0.40) {
    // High — map ratio to 50-60
    return Math.min(60, 50 + Math.round(complexRatio * 20));
  }
  if (complexRatio >= 0.20 || complex_service > 0) {
    // Medium — map ratio to 25-45
    return Math.min(45, 25 + Math.round(complexRatio * 60));
  }
  // Low — 0-20
  return Math.min(20, Math.round(complexRatio * 50));
}

export function computeScore(
  inventory: BlockInventory,
  stats: SiteStats,
  pages: PageSignals[],
): ScoreResult {
  const blockPenalty = computeBlockPenalty(inventory);

  const riskFactors: RiskFactor[] = [];

  if (stats.hasMultiLocale) {
    riskFactors.push({ name: "Multi-locale", penalty: 5, detail: `${stats.locales.length} locales detected` });
  }

  const hasAuth = pages.some(p => p.hasAuth);
  if (hasAuth) {
    riskFactors.push({ name: "Authentication/gating", penalty: 5, detail: "Login walls or SSO detected" });
  }

  const hasPersonalization = pages.some(p => p.hasPersonalization);
  if (hasPersonalization) {
    riskFactors.push({ name: "Personalization", penalty: 3, detail: "Adobe Target or A/B testing detected" });
  }

  if (stats.pageCount > 500) {
    riskFactors.push({ name: "Large site", penalty: 3, detail: `${stats.pageCount} pages in sitemap` });
  }

  const hasEcommerce = pages.some(p => p.hasEcommerce);
  if (hasEcommerce) {
    riskFactors.push({ name: "E-commerce functionality", penalty: 4, detail: "Cart, checkout, or product pages detected" });
  }

  const riskPenalty = Math.min(15, riskFactors.reduce((s, r) => s + r.penalty, 0));
  const score = Math.max(0, Math.min(100, 100 - blockPenalty - riskPenalty));

  const phases = buildPhases(inventory, stats);
  const assumptions = buildAssumptions(inventory, stats, pages);

  return {
    url: stats.url,
    score,
    ease: easeLabel(score),
    blockInventory: inventory,
    riskFactors,
    phases,
    assumptions,
    assessedAt: new Date().toISOString(),
  };
}

function buildPhases(inventory: BlockInventory, stats: SiteStats): PhaseEstimate[] {
  const customBlocks = inventory.custom + inventory.complex_service;
  const hasSpa = inventory.spa > 0;

  // POC: representative pages, build key blocks
  const pocWeeks: [number, number] = hasSpa ? [4, 6] : customBlocks > 5 ? [3, 4] : [2, 3];
  const pocScope = `5–10 representative pages covering ${Math.min(stats.templateGroups.length, 3) || 1} template group(s)`;

  // Pilot: expand to a section of the site
  const pilotPages = Math.min(stats.pageCount, 100);
  const pilotWeeks: [number, number] = customBlocks > 5 ? [6, 10] : [4, 6];

  // Scaled: full site migration
  let scaledWeeks: [number, number];
  if (stats.pageCount <= 100) scaledWeeks = [4, 8];
  else if (stats.pageCount <= 500) scaledWeeks = [8, 12];
  else scaledWeeks = [12, 20];

  const deps: string[] = [];
  if (inventory.complex_service > 0) deps.push("Headless API contracts for service integrations");
  if (stats.hasMultiLocale) deps.push("Localization framework configuration");
  if (hasSpa) deps.push("SPA decomposition and React/Next.js component extraction plan");

  return [
    {
      name: "Proof of Concept (POC)",
      scope: pocScope,
      durationWeeks: pocWeeks,
      dependencies: ["EDS boilerplate setup", "DA / Document Authoring org provisioning"],
    },
    {
      name: "Pilot",
      scope: `${pilotPages} pages — validate authoring workflow and block library`,
      durationWeeks: pilotWeeks,
      dependencies: ["POC sign-off", "Author training", ...(deps.length ? [deps[0]] : [])],
    },
    {
      name: "Scaled Migration",
      scope: `Full site — ${stats.pageCount} pages across ${stats.templateGroups.length || 1} template group(s)`,
      durationWeeks: scaledWeeks,
      dependencies: ["Pilot sign-off", "Content freeze windows", ...deps.slice(1)],
    },
  ];
}

function buildAssumptions(
  inventory: BlockInventory,
  stats: SiteStats,
  pages: PageSignals[],
): string[] {
  const a: string[] = [
    "Scores are intentionally conservative — use as an upper bound for effort planning",
    "Block counts based on sampled pages; full inventory may vary",
  ];

  if (!stats.sitemapFound) {
    a.push("No sitemap found — page count estimated from homepage structure only");
  }

  if (inventory.spa > 0) {
    a.push("SPA sections require decomposition into static EDS blocks — effort may be significant");
  }

  const maxScripts = Math.max(...pages.map(p => p.scriptCount));
  if (maxScripts > 20) {
    a.push(`Heavy JavaScript detected (${maxScripts} script tags on peak page) — may contain additional hidden complexity`);
  }

  return a;
}

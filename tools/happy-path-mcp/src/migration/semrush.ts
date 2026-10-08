export interface SemrushTopPage {
  readonly url: string;
  readonly traffic?: number;
  readonly keywords?: number;
}

export interface SemrushTopKeyword {
  readonly keyword: string;
  readonly position?: number;
  readonly volume?: number;
  readonly traffic?: number;
}

/**
 * Normalized Semrush context. The caller (Claude) maps output from the Semrush
 * MCP (domain_overview, organic_research, backlinks_research) into this shape;
 * the server never talks to Semrush itself.
 */
export interface SemrushContext {
  readonly domain?: string;
  readonly database?: string;
  readonly organicTraffic?: number;
  readonly organicKeywords?: number;
  readonly paidTraffic?: number;
  readonly authorityScore?: number;
  readonly backlinks?: number;
  readonly referringDomains?: number;
  readonly topPages: readonly SemrushTopPage[];
  readonly topKeywords: readonly SemrushTopKeyword[];
  readonly notes?: string;
}

const MAX_LIST = 10;
const MAX_TEXT = 500;

const str = (v: unknown, max = MAX_TEXT): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Accepts untrusted input; returns a cleaned context or throws a user-facing error. */
export function parseSemrushContext(input: unknown): SemrushContext {
  if (!isRecord(input)) throw new Error("semrush_data must be an object");

  const topPages = (Array.isArray(input.top_pages) ? input.top_pages : [])
    .filter(isRecord)
    .flatMap((p): SemrushTopPage[] => {
      const url = str(p.url);
      return url ? [{ url, traffic: num(p.traffic), keywords: num(p.keywords) }] : [];
    })
    .slice(0, MAX_LIST);

  const topKeywords = (Array.isArray(input.top_keywords) ? input.top_keywords : [])
    .filter(isRecord)
    .flatMap((k): SemrushTopKeyword[] => {
      const keyword = str(k.keyword, 120);
      return keyword
        ? [{ keyword, position: num(k.position), volume: num(k.volume), traffic: num(k.traffic) }]
        : [];
    })
    .slice(0, MAX_LIST);

  const ctx: SemrushContext = {
    domain: str(input.domain, 253),
    database: str(input.database, 8),
    organicTraffic: num(input.organic_traffic),
    organicKeywords: num(input.organic_keywords),
    paidTraffic: num(input.paid_traffic),
    authorityScore: num(input.authority_score),
    backlinks: num(input.backlinks),
    referringDomains: num(input.referring_domains),
    topPages,
    topKeywords,
    notes: str(input.notes),
  };

  const hasData =
    topPages.length > 0 ||
    topKeywords.length > 0 ||
    [ctx.organicTraffic, ctx.organicKeywords, ctx.paidTraffic, ctx.authorityScore, ctx.backlinks, ctx.referringDomains]
      .some(v => v !== undefined);
  if (!hasData) throw new Error("semrush_data contained no recognizable metrics");

  return ctx;
}

const fmt = (n: number | undefined): string => (n === undefined ? "—" : n.toLocaleString("en-US"));

// Escape characters that would break a markdown table cell or inject markup.
const cell = (s: string): string => s.replace(/[|\r\n]/g, " ").replace(/[<>]/g, "");

export function renderSemrushSection(ctx: SemrushContext): string {
  const heading = ctx.domain ? `## SEO & Traffic Context (Semrush — ${cell(ctx.domain)})` : "## SEO & Traffic Context (Semrush)";

  const metrics = [
    "| Metric | Value |",
    "|--------|------:|",
    `| Organic traffic (monthly est.) | ${fmt(ctx.organicTraffic)} |`,
    `| Organic keywords | ${fmt(ctx.organicKeywords)} |`,
    `| Paid traffic | ${fmt(ctx.paidTraffic)} |`,
    `| Authority score | ${fmt(ctx.authorityScore)} |`,
    `| Backlinks | ${fmt(ctx.backlinks)} |`,
    `| Referring domains | ${fmt(ctx.referringDomains)} |`,
  ].join("\n");

  const pages = ctx.topPages.length
    ? [
        "",
        "**Top organic pages (protect these in migration — redirects, parity, CWV):**",
        "",
        "| Page | Traffic | Keywords |",
        "|------|--------:|---------:|",
        ...ctx.topPages.map(p => `| ${cell(p.url)} | ${fmt(p.traffic)} | ${fmt(p.keywords)} |`),
      ].join("\n")
    : "";

  const keywords = ctx.topKeywords.length
    ? [
        "",
        "**Top keywords:**",
        "",
        "| Keyword | Position | Volume | Traffic |",
        "|---------|---------:|-------:|--------:|",
        ...ctx.topKeywords.map(
          k => `| ${cell(k.keyword)} | ${fmt(k.position)} | ${fmt(k.volume)} | ${fmt(k.traffic)} |`,
        ),
      ].join("\n")
    : "";

  const notes = ctx.notes ? `\n\n> ${cell(ctx.notes)}` : "";

  return [
    heading,
    "",
    metrics,
    pages,
    keywords,
    notes,
    "",
    "**Migration implication:** pages and keywords above carry the site's organic equity. " +
      "Preserve URLs (or 301-map them), keep content parity on top pages, and baseline Core Web Vitals " +
      "before cutover — EDS typically improves CWV, which is the SEO upside to lead with.",
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");
}

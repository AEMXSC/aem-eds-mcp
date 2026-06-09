import { JSDOM } from "jsdom";

export type BlockTier = "adopt" | "customize" | "custom" | "simple_service" | "complex_service" | "spa";

export interface BlockInventory {
  adopt: number;
  customize: number;
  custom: number;
  simple_service: number;
  complex_service: number;
  spa: number;
  total: number;
  complexRatio: number;
}

export interface PageSignals {
  url: string;
  isSpa: boolean;
  hasAuth: boolean;
  hasPersonalization: boolean;
  hasSearch: boolean;
  hasEcommerce: boolean;
  scriptCount: number;
  thirdPartyDomains: string[];
  sectionTiers: BlockTier[];
}

// Known SPA framework markers
const SPA_MARKERS = [
  "__NEXT_DATA__",
  "__NUXT__",
  "__remixContext",
  "ng-version",
  "data-reactroot",
  "window.__reactFiber",
  "window.__vue",
  "gatsby-announcer",
];

// Complex service signals
const COMPLEX_SERVICE_PATTERNS = [
  /coveo|searchspring|elasticsearch|algolia|attivio|solr/i,    // search
  /adobe\.target|optimizely|monetate|maxymiser|vwo\.com/i,     // personalization
  /marketo|eloqua|pardot|hubspot.*form|sfmc/i,                 // marketing automation
  /checkout|shopping-cart|add-to-cart|product-configurator/i,  // e-commerce
  /login|sign-in|sso|saml|oauth|auth0|okta|ping.*identity/i,  // auth
];

// Simple service signals
const SIMPLE_SERVICE_PATTERNS = [
  /google\.com\/maps|maps\.googleapis|mapbox/i,
  /youtube\.com\/embed|youtu\.be|vimeo\.com\/video/i,
  /twitter\.com\/widgets|platform\.twitter/i,
  /linkedin\.com\/embed/i,
  /instagram\.com\/embed/i,
  /typeform|jotform|formstack|gravity.*form/i,
];

// EDS adopt-as-is block class names
const ADOPT_PATTERNS = [
  /\b(nav|navigation|header|footer)\b/i,
  /\b(hero)\b/i,
  /\b(columns|two-col|three-col|col-\d)\b/i,
  /\b(cards?|card-grid|card-list)\b/i,
  /\b(quote|testimonial|blockquote-container)\b/i,
  /\b(embed|video-embed)\b/i,
];

// EDS customize block class names (need minor adaptation)
const CUSTOMIZE_PATTERNS = [
  /\b(carousel|slider|slideshow|swiper)\b/i,
  /\b(accordion|faq|expandable)\b/i,
  /\b(tabs?|tab-panel|tablist)\b/i,
  /\b(banner|notification|alert-bar)\b/i,
  /\b(featured|highlight|promo)\b/i,
  /\b(table|data-table|comparison)\b/i,
  /\b(breadcrumb)\b/i,
  /\b(modal|dialog|lightbox)\b/i,
];

function detectSpa(html: string): boolean {
  return SPA_MARKERS.some(m => html.includes(m));
}

function getThirdPartyDomains(html: string, baseHost: string): string[] {
  const domains = new Set<string>();
  const scriptSrcs = html.matchAll(/script[^>]*src=["']([^"']+)["']/gi);
  for (const m of scriptSrcs) {
    try {
      const u = new URL(m[1], `https://${baseHost}`);
      if (u.hostname !== baseHost && !u.hostname.endsWith(`.${baseHost}`)) {
        domains.add(u.hostname);
      }
    } catch { /* skip */ }
  }
  return [...domains];
}

function classifySection(el: Element): BlockTier {
  const classStr = el.className ?? "";
  const html = el.outerHTML ?? "";

  // Check SPA
  if (SPA_MARKERS.some(m => html.includes(m))) return "spa";

  // Check complex services
  if (COMPLEX_SERVICE_PATTERNS.some(p => p.test(html))) return "complex_service";

  // Check simple services
  if (SIMPLE_SERVICE_PATTERNS.some(p => p.test(html))) return "simple_service";

  // Check adopt patterns
  if (ADOPT_PATTERNS.some(p => p.test(classStr))) return "adopt";

  // Check customize patterns
  if (CUSTOMIZE_PATTERNS.some(p => p.test(classStr))) return "customize";

  // Heuristic: very deep nesting or many children → custom
  const childDivs = el.querySelectorAll("div").length;
  const depth = getMaxDepth(el);
  if (depth >= 6 || childDivs >= 20) return "custom";

  // Default for standard section-like containers
  const tag = el.tagName.toLowerCase();
  if (tag === "section" || tag === "article" || tag === "main") return "customize";

  return "custom";
}

function getMaxDepth(el: Element, current = 0): number {
  if (el.children.length === 0) return current;
  return Math.max(...Array.from(el.children).map(c => getMaxDepth(c, current + 1)));
}

export function analyzePageHtml(url: string, html: string): PageSignals {
  if (!html) {
    return {
      url, isSpa: false, hasAuth: false, hasPersonalization: false,
      hasSearch: false, hasEcommerce: false, scriptCount: 0,
      thirdPartyDomains: [], sectionTiers: [],
    };
  }

  const isSpa = detectSpa(html);

  // Check complex service presence in full HTML
  const hasAuth = /login|sign-in|sso|saml|okta|auth0/i.test(html);
  const hasPersonalization = /adobe\.target|optimizely|monetate/i.test(html);
  const hasSearch = /coveo|algolia|searchspring|elasticsearch/i.test(html);
  const hasEcommerce = /add-to-cart|checkout|shopping.?cart/i.test(html);

  let host = "";
  try { host = new URL(url).hostname; } catch { /* ok */ }
  const thirdPartyDomains = getThirdPartyDomains(html, host);
  const scriptCount = (html.match(/<script/gi) ?? []).length;

  const sectionTiers: BlockTier[] = [];

  if (isSpa) {
    sectionTiers.push("spa");
  } else {
    // Parse DOM and analyze main content sections
    try {
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      // Use <main> first, fallback to <body>
      const root = doc.querySelector("main") ?? doc.querySelector("body");
      if (root) {
        const topLevel = Array.from(root.children).filter(el => {
          const tag = el.tagName.toLowerCase();
          return ["div", "section", "article", "aside"].includes(tag);
        });

        for (const el of topLevel) {
          sectionTiers.push(classifySection(el));
        }
      }
    } catch { /* JSDOM parse failure → treat as custom */ }

    if (sectionTiers.length === 0) {
      // Couldn't parse — apply content-based heuristics
      if (hasAuth) sectionTiers.push("complex_service");
      if (hasSearch) sectionTiers.push("complex_service");
      if (hasEcommerce) sectionTiers.push("complex_service");
      if (sectionTiers.length === 0) sectionTiers.push("customize");
    }
  }

  return {
    url, isSpa, hasAuth, hasPersonalization, hasSearch, hasEcommerce,
    scriptCount, thirdPartyDomains, sectionTiers,
  };
}

export function aggregateInventory(pages: PageSignals[]): BlockInventory {
  const counts: Record<BlockTier, number> = {
    adopt: 0, customize: 0, custom: 0,
    simple_service: 0, complex_service: 0, spa: 0,
  };

  for (const page of pages) {
    // Use a Set to count each tier once per page (avoid inflating from many sections)
    const seen = new Set<BlockTier>();
    for (const tier of page.sectionTiers) {
      if (!seen.has(tier)) {
        seen.add(tier);
        counts[tier]++;
      }
    }
    // Auth signal may not produce a classified section — add it directly if missed
    if (page.hasAuth && !seen.has("complex_service")) counts.complex_service++;
  }

  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const complex = counts.custom + counts.complex_service + counts.spa;
  const complexRatio = total > 0 ? complex / total : 0;

  return { ...counts, total, complexRatio };
}

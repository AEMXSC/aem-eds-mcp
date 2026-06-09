export interface SiteStats {
  url: string;
  pageCount: number;
  hasMultiLocale: boolean;
  locales: string[];
  templateGroups: string[];
  sitemapFound: boolean;
}

export interface PageSample {
  url: string;
  html: string;
  statusCode: number;
}

export interface SiteData {
  stats: SiteStats;
  samples: PageSample[];
}

const FETCH_TIMEOUT_MS = 15_000;
const LOCALE_PATTERN = /^\/(en|de|fr|ja|es|pt|it|nl|ko|zh|ar|he|ru|pl|sv|da|fi|no|tr|cs|hu|ro|uk|vi|th|id|ms|bg|hr|sk|sl|lt|lv|et)\b/i;
const MAX_SAMPLE_PAGES = 5;

function normalizeUrl(raw: string): string {
  const url = raw.startsWith("http") ? raw : `https://${raw}`;
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "AdobeHappyPath-MCP/1.0 (migration-assessment)" },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function parseSitemap(xml: string): Promise<string[]> {
  const urls: string[] = [];
  // Handles both sitemap index (<sitemap>) and regular sitemaps (<url>)
  const locMatches = xml.matchAll(/<loc>\s*(https?:\/\/[^<]+?)\s*<\/loc>/gi);
  for (const m of locMatches) {
    urls.push(m[1].trim());
  }
  return urls;
}

async function analyzeSitemap(baseUrl: string): Promise<SiteStats> {
  const candidates = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemap-index.xml`,
  ];

  let allUrls: string[] = [];
  let sitemapFound = false;

  for (const candidate of candidates) {
    try {
      const res = await fetchWithTimeout(candidate);
      if (res.ok) {
        const xml = await res.text();
        // Check if it's a sitemap index — if so, fetch first child sitemap
        const childSitemaps = xml.match(/<sitemap>/gi);
        if (childSitemaps && childSitemaps.length > 0) {
          const childUrls = await parseSitemap(xml);
          // Fetch first child sitemap to get real page URLs
          const childSitemapUrls = childUrls.filter(u => u.endsWith(".xml")).slice(0, 3);
          for (const childUrl of childSitemapUrls) {
            try {
              const childRes = await fetchWithTimeout(childUrl);
              if (childRes.ok) {
                const childXml = await childRes.text();
                allUrls.push(...await parseSitemap(childXml));
              }
            } catch { /* skip */ }
          }
        } else {
          allUrls = await parseSitemap(xml);
        }
        sitemapFound = true;
        break;
      }
    } catch { /* try next */ }
  }

  // Filter to page URLs only (exclude images, feeds, etc.)
  const pageUrls = allUrls.filter(u =>
    !u.match(/\.(jpg|jpeg|png|gif|svg|webp|pdf|xml|json|css|js|ico|woff|woff2|ttf)$/i)
  );

  // Detect locales from URL patterns
  const localeSet = new Set<string>();
  for (const u of pageUrls) {
    try {
      const path = new URL(u).pathname;
      const m = path.match(LOCALE_PATTERN);
      if (m) localeSet.add(m[1].toLowerCase());
    } catch { /* skip */ }
  }

  // Detect template groups from URL path depth-1 segments
  const groupCounts = new Map<string, number>();
  for (const u of pageUrls) {
    try {
      const parts = new URL(u).pathname.replace(/^\//, "").split("/");
      const segment = parts[0];
      if (segment && segment.length > 1 && !LOCALE_PATTERN.test(`/${segment}`)) {
        groupCounts.set(segment, (groupCounts.get(segment) ?? 0) + 1);
      }
    } catch { /* skip */ }
  }

  const templateGroups = [...groupCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([g]) => g);

  return {
    url: baseUrl,
    pageCount: pageUrls.length || 1,
    hasMultiLocale: localeSet.size > 1,
    locales: [...localeSet],
    templateGroups,
    sitemapFound,
  };
}

function pickSampleUrls(baseUrl: string, stats: SiteStats): string[] {
  const urls = [baseUrl + "/"];

  // Add one page per template group (up to MAX_SAMPLE_PAGES - 1)
  for (const group of stats.templateGroups.slice(0, MAX_SAMPLE_PAGES - 1)) {
    urls.push(`${baseUrl}/${group}`);
  }

  return urls.slice(0, MAX_SAMPLE_PAGES);
}

export async function scrapeSite(rawUrl: string): Promise<SiteData> {
  const baseUrl = normalizeUrl(rawUrl);
  const stats = await analyzeSitemap(baseUrl);
  const sampleUrls = pickSampleUrls(baseUrl, stats);

  const samples: PageSample[] = [];
  for (const url of sampleUrls) {
    try {
      const res = await fetchWithTimeout(url);
      const html = res.ok ? await res.text() : "";
      samples.push({ url, html, statusCode: res.status });
    } catch {
      samples.push({ url, html: "", statusCode: 0 });
    }
  }

  return { stats, samples };
}

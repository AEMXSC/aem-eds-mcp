import type { Request, Response } from "express";
import { scrapeSite, validatePublicUrl } from "./migration/scraper.js";
import { analyzePageHtml, aggregateInventory } from "./migration/classifier.js";
import { computeScore } from "./migration/scorer.js";

export async function scoreRoute(req: Request, res: Response): Promise<void> {
  const { url, customer_name } = (req.body ?? {}) as { url?: unknown; customer_name?: unknown };

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url must be a non-empty string" });
    return;
  }

  const name = typeof customer_name === "string" ? customer_name : undefined;

  try {
    validatePublicUrl(url);
  } catch (err) {
    res.status(400).json({ error: `Invalid URL: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }

  try {
    const siteData = await scrapeSite(url);
    const pageSignals = siteData.samples
      .filter(s => s.html)
      .map(s => analyzePageHtml(s.url, s.html));
    const inventory = aggregateInventory(pageSignals);
    const result = computeScore(inventory, siteData.stats, pageSignals);
    res.json({ ...result, customer_name: name ?? null });
  } catch (err) {
    process.stderr.write(`[score] scrape failed for ${url}: ${err instanceof Error ? err.message : String(err)}\n`);
    res.status(500).json({ error: "Failed to analyze site. Check that the URL is publicly accessible." });
  }
}

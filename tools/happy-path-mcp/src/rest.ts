import type { Request, Response } from "express";
import { scrapeSite, validatePublicUrl } from "./migration/scraper.js";
import { analyzePageHtml, aggregateInventory } from "./migration/classifier.js";
import { computeScore } from "./migration/scorer.js";

export async function scoreRoute(req: Request, res: Response): Promise<void> {
  const { url, customer_name } = req.body as { url?: string; customer_name?: string };

  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

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
    res.json({ ...result, customer_name: customer_name ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
}

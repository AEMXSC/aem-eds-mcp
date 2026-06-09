import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { scrapeSite } from "./migration/scraper.js";
import { analyzePageHtml, aggregateInventory } from "./migration/classifier.js";
import { computeScore } from "./migration/scorer.js";
import { generateMarkdownReport } from "./migration/report.js";
import type { ScoreResult } from "./migration/scorer.js";

export const SERVER_VERSION = "1.0.0";

export type Args = Record<string, unknown>;

export const TOOLS: Tool[] = [
  {
    name: "migration_score",
    description: "Analyze a customer website and produce an AEM EDS migration complexity score (0–100). " +
      "Fetches the sitemap, samples representative pages, classifies components into the six EDS block tiers, " +
      "and returns a structured JSON result with score, ease label, block inventory, risk factors, and phase timeline. " +
      "Use this before running customer_pov to provide the migration complexity input.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Customer website root URL (e.g. https://www.example.com)",
        },
        customer_name: {
          type: "string",
          description: "Optional customer name to include in the report header",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "migration_score_report",
    description: "Format a migration score result (from migration_score) as a canonical Happy Path markdown report. " +
      "Pass the full JSON object returned by migration_score as score_data.",
    inputSchema: {
      type: "object",
      properties: {
        score_data: {
          type: "object",
          description: "The full JSON object returned by migration_score",
        },
        customer_name: {
          type: "string",
          description: "Customer name for the report title",
        },
      },
      required: ["score_data"],
    },
  },
];

function mcpText(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function mcpError(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

export async function handleTool(name: string, args: Args): Promise<ReturnType<typeof mcpText>> {
  switch (name) {
    case "migration_score": {
      const url = args.url as string | undefined;
      if (!url) return mcpError("url is required");

      let siteData;
      try {
        siteData = await scrapeSite(url);
      } catch (err) {
        return mcpError(`Failed to fetch site: ${err instanceof Error ? err.message : String(err)}`);
      }

      const pageSignals = siteData.samples
        .filter(s => s.html)
        .map(s => analyzePageHtml(s.url, s.html));

      const inventory = aggregateInventory(pageSignals);
      const result = computeScore(inventory, siteData.stats, pageSignals);

      return mcpText(JSON.stringify(result, null, 2));
    }

    case "migration_score_report": {
      const scoreData = args.score_data as ScoreResult | undefined;
      if (!scoreData) return mcpError("score_data is required");

      const customerName = args.customer_name as string | undefined;
      const report = generateMarkdownReport(scoreData, customerName);
      return mcpText(report);
    }

    default:
      return mcpError(`Unknown tool: ${name}`);
  }
}

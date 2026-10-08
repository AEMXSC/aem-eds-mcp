#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { SERVER_VERSION, TOOLS, handleTool, type Args } from "./tools.js";
import { callSemrushTool, isSemrushTool, listSemrushTools } from "./semrush-proxy.js";

const server = new Server(
  { name: "happy-path-mcp", version: SERVER_VERSION },
  { capabilities: { tools: {} } }
);

// stdio is a local, trusted process: Semrush tools are on whenever SEMRUSH_API_KEY is set.
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [...TOOLS, ...(await listSemrushTools())],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  if (!TOOLS.some(t => t.name === name) && (await isSemrushTool(name))) {
    return callSemrushTool(name, args as Args);
  }
  return handleTool(name, args as Args);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`happy-path-mcp v${SERVER_VERSION} ready (stdio)\n`);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});

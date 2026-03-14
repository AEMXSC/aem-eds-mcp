#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { SERVER_VERSION, TOOLS, handleTool, getImsToken, } from "./tools.js";
// ─── Server setup ─────────────────────────────────────────────────────────────
const server = new Server({ name: "hlx-admin", version: SERVER_VERSION }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    return handleTool(name, args);
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    const imsToken = await getImsToken();
    const apiKey = process.env.HLX_API_KEY;
    const hlxToken = process.env.HLX_AUTH_TOKEN;
    const adminAuth = imsToken
        ? "IMS Bearer token"
        : apiKey
            ? "API key (HLX_API_KEY)"
            : hlxToken
                ? "HLX_AUTH_TOKEN (legacy)"
                : "none — run da_login or set HLX_API_KEY";
    const daAuth = imsToken ? "IMS Bearer token" : "none — run da_login";
    process.stderr.write(`hlx-admin MCP v${SERVER_VERSION} — AEM EDS Admin + DA Content API\n` +
        `Admin auth: ${adminAuth}\n` +
        `DA auth:    ${daAuth}\n`);
}
main().catch((err) => {
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(1);
});

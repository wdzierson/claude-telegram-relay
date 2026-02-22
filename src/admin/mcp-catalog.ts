/**
 * MCP Server Catalog
 *
 * Static catalog of known MCP servers with default configs,
 * required env vars, and descriptions. Used by the admin panel
 * "Add Server" UI to offer pre-filled templates.
 */

export interface MCPCatalogEntry {
  name: string;
  description: string;
  command: string;
  args: string[];
  envVars: { key: string; description: string; required: boolean }[];
  approvalPolicy: "never" | "always" | "destructive";
}

export const MCP_SERVER_CATALOG: MCPCatalogEntry[] = [
  {
    name: "google",
    description: "Google Workspace — Gmail, Calendar, Drive, Docs, Sheets, Slides, Chat (49 tools)",
    command: "npx",
    args: ["-y", "@presto-ai/google-workspace-mcp"],
    envVars: [],
    approvalPolicy: "destructive",
  },
  {
    name: "github",
    description: "GitHub — repos, issues, PRs, code search",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    envVars: [
      { key: "GITHUB_PERSONAL_ACCESS_TOKEN", description: "GitHub personal access token", required: true },
    ],
    approvalPolicy: "destructive",
  },
  {
    name: "filesystem",
    description: "Local filesystem — read, write, search files",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/Users/you/Documents"],
    envVars: [],
    approvalPolicy: "destructive",
  },
  {
    name: "brave-search",
    description: "Brave Search — web search API",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    envVars: [
      { key: "BRAVE_API_KEY", description: "Brave Search API key", required: true },
    ],
    approvalPolicy: "never",
  },
  {
    name: "playwright",
    description: "Playwright — deterministic browser automation, screenshots, data extraction, form filling",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
    envVars: [
      { key: "PLAYWRIGHT_MCP_HEADLESS", description: "Run headless (true for servers)", required: false },
      { key: "PLAYWRIGHT_MCP_BROWSER", description: "Browser engine: chromium, firefox, webkit", required: false },
    ],
    approvalPolicy: "destructive",
  },
  {
    name: "stagehand",
    description: "Stagehand — AI-powered browser automation via Browserbase cloud (natural language actions, anti-bot stealth)",
    command: "npx",
    args: ["-y", "@browserbasehq/mcp-server-browserbase"],
    envVars: [
      { key: "BROWSERBASE_API_KEY", description: "Browserbase API key", required: true },
      { key: "BROWSERBASE_PROJECT_ID", description: "Browserbase project ID", required: true },
      { key: "GEMINI_API_KEY", description: "Gemini API key for AI model (or OPENAI_API_KEY)", required: true },
    ],
    approvalPolicy: "destructive",
  },
  {
    name: "notion",
    description: "Notion — pages, databases, blocks",
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    envVars: [
      { key: "OPENAPI_MCP_HEADERS", description: "JSON with Authorization and Notion-Version headers", required: true },
    ],
    approvalPolicy: "destructive",
  },
  {
    name: "slack",
    description: "Slack — channels, messages, users, reactions",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    envVars: [
      { key: "SLACK_BOT_TOKEN", description: "Slack bot token (xoxb-...)", required: true },
      { key: "SLACK_TEAM_ID", description: "Slack workspace team ID", required: true },
    ],
    approvalPolicy: "destructive",
  },
  {
    name: "memory",
    description: "Knowledge graph — entities, relations, persistent memory",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    envVars: [],
    approvalPolicy: "never",
  },
  {
    name: "supabase",
    description: "Supabase — SQL queries, table management",
    command: "npx",
    args: ["-y", "@supabase/mcp-server-supabase@latest", "--access-token", "your-token"],
    envVars: [
      { key: "SUPABASE_ACCESS_TOKEN", description: "Supabase access token (passed via --access-token arg)", required: true },
    ],
    approvalPolicy: "destructive",
  },
  {
    name: "nanobanana",
    description: "Image generation — text-to-image, editing, composition via Gemini",
    command: "npx",
    args: ["-y", "gemini-nanobanana-mcp@latest"],
    envVars: [
      { key: "GEMINI_API_KEY", description: "Google AI Studio API key", required: true },
    ],
    approvalPolicy: "never",
  },
];

/**
 * Web Search Tool — Tavily API
 *
 * Same logic as tasks/tools.ts createWebSearchTool, adapted for ChatTool interface.
 */

import type { ChatTool } from "../types.ts";

export function createSearchTool(tavilyApiKey: string): ChatTool {
  return {
    definition: {
      name: "web_search",
      description:
        "Search the web for current information. Returns relevant results with titles, URLs, and content snippets. " +
        "Use this for questions that need up-to-date data, news, or facts you don't know.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
          max_results: {
            type: "number",
            description: "Max results to return (default 5, max 10)",
          },
        },
        required: ["query"],
      },
    },
    async execute(input) {
      const query = input.query as string;
      const maxResults = Math.min((input.max_results as number) || 5, 10);

      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyApiKey,
          query,
          max_results: maxResults,
          include_answer: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        answer?: string;
        results?: Array<{ title: string; url: string; content: string }>;
      };

      let result = "";
      if (data.answer) result += `Summary: ${data.answer}\n\n`;
      for (const r of data.results || []) {
        result += `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}\n\n`;
      }
      return result || "No results found.";
    },
    scope: "both",
    approval: "never",
    category: "search",
  };
}

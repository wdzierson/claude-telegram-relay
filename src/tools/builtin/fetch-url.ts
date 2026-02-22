/**
 * Fetch URL Tool
 *
 * Fetches a web page and converts HTML to readable text.
 * Same logic as tasks/tools.ts createFetchUrlTool, adapted for ChatTool interface.
 */

import type { ChatTool } from "../types.ts";

export function createFetchUrlTool(): ChatTool {
  return {
    definition: {
      name: "fetch_url",
      description:
        "Fetch the content of a web page and convert it to readable text. " +
        "Use this to read articles, documentation, blog posts, or any web page in detail.",
      input_schema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The URL to fetch",
          },
        },
        required: ["url"],
      },
    },
    async execute(input) {
      const url = input.url as string;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Bright-AI-Assistant/1.0",
          Accept: "text/html,application/xhtml+xml,text/plain",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();

      // Basic HTML to text: strip scripts/styles, remove tags, decode entities
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

      const maxLen = 12000;
      if (text.length > maxLen) {
        return text.substring(0, maxLen) + "\n\n[Truncated — page was too long]";
      }
      return text;
    },
    scope: "both",
    approval: "never",
    category: "search",
  };
}

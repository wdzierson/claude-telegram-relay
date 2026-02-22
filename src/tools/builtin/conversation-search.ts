/**
 * Conversation Search Tool
 *
 * Searches past conversation messages by keyword and time range.
 * Complements semantic search (search_memory) with precise keyword matching.
 */

import type { ChatTool } from "../types.ts";
import type { MemorySystem } from "../../memory/index.ts";

export function createConversationSearchTool(memory: MemorySystem): ChatTool {
  return {
    definition: {
      name: "search_conversations",
      description:
        "Search past conversation messages by keyword and time range. " +
        "Use this when the user asks about something specific they said or discussed " +
        "that isn't in the recent conversation context — e.g., 'what did I say about X last week?', " +
        "'find that recipe I asked about'. More precise than semantic search for keyword lookups.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Keyword or phrase to search for in past messages",
          },
          hours: {
            type: "number",
            description: "How far back to search in hours (default: 72, max: 720)",
          },
        },
        required: ["query"],
      },
    },
    async execute(input) {
      const query = input.query as string;
      const hours = Math.min((input.hours as number) || 72, 720);

      return memory.getConversationHistory({ query, hours });
    },
    scope: "chat",
    approval: "never",
    category: "memory",
  };
}

/**
 * Memory Search Tool
 *
 * Searches the user's stored memories: facts, goals, and past messages.
 * Wraps the existing MemorySystem interface.
 */

import type { ChatTool } from "../types.ts";
import type { MemorySystem } from "../../memory/index.ts";

export function createMemorySearchTool(memory: MemorySystem): ChatTool {
  return {
    definition: {
      name: "search_memory",
      description:
        "Search the user's long-term memory using semantic similarity. " +
        "Use this when the user references something from a PREVIOUS session or from days/weeks ago, " +
        "asks about stored facts, goals, or preferences, or when the recent conversation context " +
        "doesn't contain the information needed. " +
        "Do NOT use this for information visible in the current conversation context above.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Natural language search query",
          },
          type: {
            type: "string",
            enum: ["all", "facts", "goals", "messages"],
            description: "Filter by memory type (default: all)",
          },
        },
        required: ["query"],
      },
    },
    async execute(input) {
      const query = input.query as string;
      const type = (input.type as string) || "all";

      const parts: string[] = [];

      if (type === "all" || type === "messages") {
        const relevant = await memory.getRelevantContext(query);
        if (relevant) parts.push(relevant);
      }

      if (type === "all" || type === "facts" || type === "goals") {
        const memCtx = await memory.getMemoryContext();
        if (memCtx) parts.push(memCtx);
      }

      return parts.join("\n\n") || "No relevant memories found.";
    },
    scope: "chat",
    approval: "never",
    category: "memory",
  };
}

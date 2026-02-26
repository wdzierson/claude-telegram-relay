/**
 * Attachment Search Tool
 *
 * Searches past file uploads (images, documents, audio) by semantic similarity.
 * Returns storage URLs and descriptions so the agent can reference or re-share files.
 */

import type { ChatTool } from "../types.ts";
import type { MemorySystem } from "../../memory/index.ts";

export function createAttachmentSearchTool(memory: MemorySystem): ChatTool {
  return {
    definition: {
      name: "search_attachments",
      description:
        "Search the user's past file uploads (images, documents, audio, voice notes) " +
        "by semantic similarity. Use when the user asks about a file they uploaded previously, " +
        "wants to find an old image or document, or references something they shared in the past. " +
        "Returns file URLs, descriptions, and extracted text.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description:
              "Natural language search query (e.g., 'that building photo', 'the PDF about architecture')",
          },
          file_type: {
            type: "string",
            enum: ["all", "image", "document", "audio"],
            description: "Filter by file type (default: all)",
          },
        },
        required: ["query"],
      },
    },
    async execute(input) {
      if (!memory.client) return "Attachment search not available (no database).";

      const query = input.query as string;
      const fileType = (input.file_type as string) || "all";

      try {
        const { data, error } = await memory.client.functions.invoke("search", {
          body: {
            query,
            match_count: 5,
            table: "attachments",
            match_threshold: 0.35,
          },
        });

        if (error) {
          console.warn("Attachment search error:", error);
          const msg = error?.message || String(error);
          return `Attachment search failed: ${msg}`;
        }

        if (!data?.length) {
          return "No matching attachments found.";
        }

        // Filter by type if requested
        const results =
          fileType === "all"
            ? data
            : data.filter((a: any) => a.file_type === fileType);

        if (!results.length) {
          return `No ${fileType} attachments matching "${query}".`;
        }

        return results
          .map((a: any) => {
            const parts = [
              `[${a.file_type}] ${a.original_filename || "unnamed"}`,
              `URL: ${a.storage_url}`,
              a.description
                ? `Description: ${a.description.substring(0, 300)}`
                : null,
              a.extracted_text
                ? `Content preview: ${a.extracted_text.substring(0, 300)}`
                : null,
              `Uploaded: ${new Date(a.created_at).toLocaleString()}`,
            ].filter(Boolean);
            return parts.join("\n");
          })
          .join("\n\n");
      } catch (err: any) {
        console.warn("Attachment search failed:", err.message);
        return "Attachment search failed.";
      }
    },
    scope: "both",
    approval: "never",
    category: "memory",
  };
}

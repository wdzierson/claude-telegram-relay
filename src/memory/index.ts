/**
 * Memory Module — Public API
 *
 * Manages persistent storage in Supabase: messages, facts, goals, semantic search.
 * All functions are no-ops if Supabase is not configured (graceful degradation).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseConfig } from "../config/index.ts";
import { createSupabaseClient } from "./supabase.ts";
import { processMemoryIntents } from "./intents.ts";

export { processMemoryIntents } from "./intents.ts";

export interface MemorySystem {
  saveMessage(
    role: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;

  getMemoryContext(userId?: string): Promise<string>;

  getRelevantContext(query: string, userId?: string): Promise<string>;

  /** Fetch the N most recent messages for conversational continuity */
  getRecentMessages(limit?: number): Promise<string>;

  /** Search past conversations by keyword and time range (for tool use) */
  getConversationHistory(opts: {
    query?: string;
    hours?: number;
    limit?: number;
  }): Promise<string>;

  processIntents(response: string, userId?: string): Promise<string>;

  readonly client: SupabaseClient | null;
}

export function createMemory(config?: SupabaseConfig): MemorySystem {
  const client = createSupabaseClient(config);

  return {
    client,

    async saveMessage(role, content, metadata) {
      if (!client) return;
      try {
        await client.from("messages").insert({
          role,
          content,
          channel: (metadata?.channel as string) || "telegram",
          metadata: metadata || {},
        });
      } catch (error) {
        console.error("Supabase save error:", error);
      }
    },

    async getMemoryContext(userId?: string) {
      if (!client) return "";

      try {
        const [factsResult, goalsResult] = await Promise.all([
          client.rpc("get_facts"),
          client.rpc("get_active_goals"),
        ]);

        const parts: string[] = [];

        if (factsResult.data?.length) {
          parts.push(
            "FACTS:\n" +
              factsResult.data.map((f: any) => `- ${f.content}`).join("\n")
          );
        }

        if (goalsResult.data?.length) {
          parts.push(
            "GOALS:\n" +
              goalsResult.data
                .map((g: any) => {
                  const deadline = g.deadline
                    ? ` (by ${new Date(g.deadline).toLocaleDateString()})`
                    : "";
                  return `- ${g.content}${deadline}`;
                })
                .join("\n")
          );
        }

        return parts.join("\n\n");
      } catch (error) {
        console.error("Memory context error:", error);
        return "";
      }
    },

    async getRelevantContext(query, userId?) {
      if (!client) return "";

      try {
        const [messagesResult, memoryResult] = await Promise.allSettled([
          client.functions.invoke("search", {
            body: { query, match_count: 5, table: "messages", match_threshold: 0.35 },
          }),
          client.functions.invoke("search", {
            body: { query, match_count: 5, table: "memory", match_threshold: 0.35 },
          }),
        ]);

        const parts: string[] = [];

        if (messagesResult.status === "fulfilled") {
          const { data, error } = messagesResult.value;
          if (error) {
            console.warn("Semantic search (messages) error:", error);
          } else if (data?.length) {
            parts.push(
              "RELEVANT PAST MESSAGES:\n" +
                data.map((m: any) => `[${m.role}]: ${m.content}`).join("\n")
            );
          }
        } else {
          console.warn("Semantic search (messages) rejected:", messagesResult.reason);
        }

        if (memoryResult.status === "fulfilled") {
          const { data, error } = memoryResult.value;
          if (error) {
            console.warn("Semantic search (memory) error:", error);
          } else if (data?.length) {
            parts.push(
              "RELEVANT MEMORY:\n" +
                data.map((m: any) => `[${m.type}]: ${m.content}`).join("\n")
            );
          }
        } else {
          console.warn("Semantic search (memory) rejected:", memoryResult.reason);
        }

        return parts.join("\n\n");
      } catch (err) {
        console.warn("getRelevantContext failed:", err);
        return "";
      }
    },

    async getRecentMessages(limit = 50) {
      if (!client) return "";

      try {
        const { data } = await client
          .from("messages")
          .select("role, content, created_at")
          .order("created_at", { ascending: false })
          .limit(limit);

        if (!data?.length) return "";

        // Reverse so oldest is first (chronological order)
        const messages = data.reverse();
        return (
          "RECENT CONVERSATION:\n" +
          messages
            .map((m: any) => {
              const time = new Date(m.created_at).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              });
              return `[${time}] ${m.role}: ${m.content.substring(0, 500)}`;
            })
            .join("\n")
        );
      } catch {
        return "";
      }
    },

    async getConversationHistory(opts) {
      if (!client) return "Memory not available.";

      const { query, hours = 72, limit = 30 } = opts;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      try {
        let q = client
          .from("messages")
          .select("role, content, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (query) {
          q = q.ilike("content", `%${query}%`);
        }

        const { data } = await q;

        if (!data?.length) {
          return query
            ? `No messages matching "${query}" in the last ${hours} hours.`
            : `No messages in the last ${hours} hours.`;
        }

        const messages = data.reverse();
        return messages
          .map((m: any) => {
            const time = new Date(m.created_at).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            return `[${time}] ${m.role}: ${m.content}`;
          })
          .join("\n");
      } catch {
        return "Failed to search conversation history.";
      }
    },

    async processIntents(response, userId?) {
      return processMemoryIntents(client, response, userId);
    },
  };
}

/**
 * Task System — Tool Implementations
 *
 * Tools available to the background task runner:
 * - web_search: Tavily API for AI-native web search
 * - fetch_url: HTTP fetch + HTML-to-text
 * - send_progress: Proactive Telegram updates
 * - upload_file: Upload local file to Supabase Storage → public URL
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskTool } from "./types.ts";
import { readFileSync, existsSync } from "fs";
import { basename, extname } from "path";

/**
 * Web search via Tavily API.
 * Free tier: 1000 searches/month, no credit card required.
 */
export function createWebSearchTool(tavilyApiKey: string): TaskTool {
  return {
    definition: {
      name: "web_search",
      description:
        "Search the web for current information. Returns relevant results with titles, URLs, and content snippets. " +
        "Use this to find information, compare options, research topics, or answer questions that need up-to-date data.",
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
  };
}

/**
 * Fetch a URL and convert HTML to readable text.
 */
export function createFetchUrlTool(): TaskTool {
  return {
    definition: {
      name: "fetch_url",
      description:
        "Fetch the content of a web page and convert it to readable text. " +
        "Use this to read articles, documentation, blog posts, or any web page in detail after finding it via search.",
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

      // Truncate to stay within context limits
      const maxLen = 12000;
      if (text.length > maxLen) {
        return text.substring(0, maxLen) + "\n\n[Truncated — page was too long]";
      }
      return text;
    },
  };
}

/**
 * Ask the user a question mid-task and wait for their response.
 * The task pauses until the user replies (30-minute timeout).
 */
export function createAskUserTool(
  sendQuestion: (question: string, taskId: string, options?: string[]) => Promise<string>,
  taskId: string
): TaskTool {
  return {
    definition: {
      name: "ask_user",
      description:
        "Ask the user a clarifying question and wait for their response. " +
        "Use this when you genuinely cannot proceed without user input — for example, " +
        "choosing between ambiguous options, confirming a risky action, or getting missing info. " +
        "Do NOT overuse this. Only ask when truly blocked.",
      input_schema: {
        type: "object" as const,
        properties: {
          question: {
            type: "string",
            description: "The question to ask the user",
          },
          options: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional quick-reply options (2-4 short labels). If provided, shown as inline buttons.",
          },
        },
        required: ["question"],
      },
    },
    async execute(input) {
      const question = input.question as string;
      const options = input.options as string[] | undefined;
      const answer = await sendQuestion(question, taskId, options);
      return `User responded: ${answer}`;
    },
  };
}

/**
 * Send a progress update to the user via Telegram.
 */
export function createSendProgressTool(
  sendMessage: (text: string) => Promise<void>
): TaskTool {
  return {
    definition: {
      name: "send_progress",
      description:
        "Send a progress update to the user via Telegram. Use this to share interim findings, " +
        "let the user know what you've discovered so far, or indicate you're still working on a complex task. " +
        "Keep updates brief and informative — save the full detail for your final response.",
      input_schema: {
        type: "object" as const,
        properties: {
          message: {
            type: "string",
            description: "The progress message to send to the user",
          },
        },
        required: ["message"],
      },
    },
    async execute(input) {
      const message = input.message as string;
      await sendMessage(`📋 ${message}`);
      return "Progress update sent to user.";
    },
  };
}

/**
 * Spawn a child subtask that runs in parallel.
 * The parent task can later collect results via get_subtask_results.
 */
export function createSpawnSubtaskTool(
  supabaseClient: SupabaseClient,
  parentTaskId: string,
  userId: string | undefined,
  buildSystemPrompt: (description: string) => string,
  enqueue: (taskId: string) => Promise<void>
): TaskTool {
  return {
    definition: {
      name: "spawn_subtask",
      description:
        "Create a child subtask that runs in parallel with your current work. " +
        "Use this to fan out independent research or creation tasks (e.g., research 3 topics simultaneously). " +
        "Each subtask gets its own tools and iteration budget (15 iterations). " +
        "After spawning, continue your own work or use get_subtask_results to wait for and collect results. " +
        "Do NOT use this for sequential work where step B needs step A's output — just do it yourself.",
      input_schema: {
        type: "object" as const,
        properties: {
          description: {
            type: "string",
            description:
              "Clear description of what the subtask should accomplish. Be specific — this is all the subtask will know.",
          },
        },
        required: ["description"],
      },
    },
    async execute(input) {
      const description = input.description as string;
      const systemPrompt = buildSystemPrompt(description);

      const { data, error } = await supabaseClient
        .from("tasks")
        .insert({
          description,
          status: "queued",
          user_id: userId,
          parent_task_id: parentTaskId,
          system_prompt: systemPrompt,
          max_iterations: 15,
          priority: 2, // Higher priority so subtasks run promptly
        })
        .select()
        .single();

      if (error || !data) {
        return `Failed to create subtask: ${error?.message || "unknown error"}`;
      }

      await enqueue(data.id);
      return `Subtask created: ${data.id}\nDescription: ${description}\nIt is now running in parallel. Use get_subtask_results to check on it later.`;
    },
  };
}

/**
 * Upload a local image file to Supabase Storage and return a public URL.
 * This bridges the gap between MCP tools that save images locally (nanobanana)
 * and tools that need public URLs (Google Docs/Slides image insertion).
 */
export function createUploadFileTool(
  supabaseClient: SupabaseClient,
  supabaseUrl: string
): TaskTool {
  return {
    definition: {
      name: "upload_file",
      description:
        "Upload a local file to cloud storage and get a public URL. " +
        "Supports images, audio, video, PDFs, and other common file types. " +
        "Use this when you have a local file that needs a publicly accessible URL — " +
        "for example, to insert into Google Docs/Slides, share with the user, or reference from other tools. " +
        "Note: MCP tools (nanobanana, etc.) now auto-upload their outputs, so you usually won't need this " +
        "unless you have a file from another source.",
      input_schema: {
        type: "object" as const,
        properties: {
          file_path: {
            type: "string",
            description:
              "The local file path to upload",
          },
        },
        required: ["file_path"],
      },
    },
    async execute(input) {
      const filePath = input.file_path as string;

      if (!existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileData = readFileSync(filePath);
      const ext = extname(filePath).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".m4a": "audio/mp4",
        ".flac": "audio/flac",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".pdf": "application/pdf",
        ".csv": "text/csv",
        ".json": "application/json",
        ".txt": "text/plain",
      };
      const contentType = mimeMap[ext] || "application/octet-stream";

      // Generate a unique storage path
      const timestamp = Date.now();
      const originalName = basename(filePath, ext);
      const storagePath = `${timestamp}_${originalName}${ext}`;

      const { error } = await supabaseClient.storage
        .from("agent-files")
        .upload(storagePath, fileData, {
          contentType,
          upsert: false,
        });

      if (error) {
        throw new Error(`Upload failed: ${error.message}`);
      }

      // Construct the public URL directly (bucket is public)
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/agent-files/${storagePath}`;

      return `File uploaded successfully.\nPublic URL: ${publicUrl}`;
    },
  };
}

/**
 * Check status and collect results from child subtasks.
 * Optionally waits for running subtasks to complete.
 */
export function createGetSubtaskResultsTool(
  supabaseClient: SupabaseClient,
  parentTaskId: string
): TaskTool {
  return {
    definition: {
      name: "get_subtask_results",
      description:
        "Check the status and collect results from your spawned subtasks. " +
        "If wait=true, polls every 5 seconds for up to 60 seconds waiting for running subtasks to finish. " +
        "Use this after spawning subtasks to gather their results for synthesis.",
      input_schema: {
        type: "object" as const,
        properties: {
          wait: {
            type: "boolean",
            description:
              "If true, wait up to 60 seconds for running subtasks to complete. Default: true.",
          },
        },
        required: [],
      },
    },
    async execute(input) {
      const shouldWait = (input.wait as boolean) !== false; // default true
      const maxWaitMs = 60_000;
      const pollMs = 5_000;
      const startTime = Date.now();

      let subtasks: any[] = [];

      const fetchSubtasks = async () => {
        const { data } = await supabaseClient
          .from("tasks")
          .select("id, status, description, result, error, iteration_count, created_at, completed_at")
          .eq("parent_task_id", parentTaskId)
          .order("created_at", { ascending: true });
        return data || [];
      };

      subtasks = await fetchSubtasks();

      if (subtasks.length === 0) {
        return "No subtasks found. Did you spawn any with spawn_subtask?";
      }

      // Wait loop: poll until all subtasks are terminal or timeout
      if (shouldWait) {
        while (Date.now() - startTime < maxWaitMs) {
          const allDone = subtasks.every((t: any) =>
            ["completed", "failed", "cancelled"].includes(t.status)
          );
          if (allDone) break;

          await new Promise((resolve) => setTimeout(resolve, pollMs));
          subtasks = await fetchSubtasks();
        }
      }

      // Format results
      const lines: string[] = [`Subtask results (${subtasks.length} total):\n`];
      for (const t of subtasks) {
        const status = t.status.toUpperCase();
        const desc = t.description.substring(0, 100);
        lines.push(`[${t.id.substring(0, 8)}] ${status}: ${desc}`);

        if (t.status === "completed" && t.result) {
          // Truncate long results to keep context manageable
          const preview = t.result.length > 3000
            ? t.result.substring(0, 3000) + "\n[...truncated]"
            : t.result;
          lines.push(`Result:\n${preview}\n`);
        } else if (t.status === "failed" && t.error) {
          lines.push(`Error: ${t.error}\n`);
        } else if (t.status === "running") {
          lines.push(`Still running (iteration ${t.iteration_count || 0})\n`);
        }
      }

      return lines.join("\n");
    },
  };
}

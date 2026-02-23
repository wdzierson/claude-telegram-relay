/**
 * Task System — Manager
 *
 * Creates tasks in Supabase and enqueues them for execution.
 * The TaskQueue handles concurrency, execution, resume, and delivery.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task, TaskTool } from "./types.ts";
import type { TaskQueue } from "./queue.ts";
import type { ToolRegistry } from "../../tools/registry.ts";
import type { AgentType } from "./agent-types.ts";
import {
  createWebSearchTool,
  createFetchUrlTool,
  createSendProgressTool,
  createAskUserTool,
  createSpawnSubtaskTool,
  createGetSubtaskResultsTool,
  createUploadFileTool,
} from "./tools.ts";

export interface TaskManagerDeps {
  supabaseClient: SupabaseClient | null;
  /** Supabase project URL — needed for constructing public storage URLs */
  supabaseUrl?: string;
  sendMessage: (text: string) => Promise<void>;
  anthropicConfig: { apiKey: string; model: string; maxTokens: number };
  profile: string;
  userName: string;
  timezone: string;
  tavilyApiKey?: string;
  /** Optional: called when a task needs user input. Returns the user's answer. */
  sendQuestion?: (question: string, taskId: string, options?: string[]) => Promise<string>;
  /** Optional: tool registry for MCP and other shared tools */
  registry?: ToolRegistry;
  /** Optional: loaded agent types for specialized tasks */
  agentTypes?: Map<string, AgentType>;
}

export interface TaskFlowNode {
  tempId: string;
  agentType: string;
  description: string;
  dependsOn: string[];
}

export interface TaskManager {
  createAndRunTask: (
    description: string,
    userId?: string,
    agentType?: string
  ) => Promise<string>;
  /** Create a chain of dependent tasks — each step runs after the previous completes */
  createTaskChain: (
    steps: string[],
    userId?: string
  ) => Promise<string | null>;
  /** Create a dependency graph of typed tasks from orchestrator output */
  createTaskFlow: (
    nodes: TaskFlowNode[],
    userId?: string
  ) => Promise<string[]>;
  getActiveTasks: (userId?: string) => Promise<Task[]>;
  /** Fetch recently completed/failed tasks (last N hours) with result previews */
  getRecentCompletions: (userId?: string, hours?: number) => Promise<Task[]>;
  cancelTask: (taskId: string) => Promise<boolean>;
  /** Build tools for a given task (used by the queue) */
  buildTools: (taskId: string, userId?: string) => TaskTool[];
  /** Build system prompt for a given task (used by the queue) */
  buildSystemPrompt: (description: string, agentType?: string) => string;
  /** Set the queue reference (called during wiring) */
  setQueue: (queue: TaskQueue) => void;
  /** Available agent type names (for prompt guidance) */
  getAgentTypeNames: () => string[];
}

export function createTaskManager(deps: TaskManagerDeps): TaskManager {
  const {
    supabaseClient,
    supabaseUrl,
    sendMessage,
    profile,
    userName,
    timezone,
    tavilyApiKey,
    sendQuestion,
    registry,
    agentTypes,
  } = deps;

  let queue: TaskQueue | null = null;

  function setQueue(q: TaskQueue): void {
    queue = q;
  }

  function buildTools(taskId: string, userId?: string): TaskTool[] {
    const tools: TaskTool[] = [
      createFetchUrlTool(),
      createSendProgressTool(sendMessage),
    ];
    if (tavilyApiKey) {
      tools.unshift(createWebSearchTool(tavilyApiKey));
    }
    if (sendQuestion) {
      tools.push(createAskUserTool(sendQuestion, taskId));
    }

    // Sub-task spawning tools (only when Supabase + queue are available)
    if (supabaseClient && queue) {
      tools.push(
        createSpawnSubtaskTool(
          supabaseClient,
          taskId,
          userId,
          buildSystemPrompt,
          (id) => queue!.enqueue(id)
        )
      );
      tools.push(createGetSubtaskResultsTool(supabaseClient, taskId));
    }

    // File upload tool (manual escape hatch — MCP outputs are auto-uploaded)
    if (supabaseClient && supabaseUrl) {
      tools.push(createUploadFileTool(supabaseClient, supabaseUrl));
    }

    // Bridge MCP and other shared tools from the registry
    if (registry) {
      const existingNames = new Set(tools.map((t) => t.definition.name));
      for (const chatTool of registry.getBackgroundTools()) {
        if (existingNames.has(chatTool.definition.name)) continue;

        // Wrap destructive tools with approval via ask_user
        const needsApproval =
          chatTool.approval === "always" ||
          (chatTool.approval === "destructive" &&
            chatTool.describeAction !== undefined);

        const execute =
          needsApproval && sendQuestion
            ? async (input: Record<string, unknown>) => {
                const desc =
                  chatTool.describeAction?.(input) ||
                  `${chatTool.definition.name}: ${JSON.stringify(input).substring(0, 100)}`;
                const answer = await sendQuestion(
                  `Approve tool action?\n${desc}`,
                  taskId,
                  ["Yes", "No"]
                );
                if (answer.toLowerCase().startsWith("y")) {
                  return chatTool.execute(input);
                }
                return "Action denied by user.";
              }
            : chatTool.execute;

        tools.push({ definition: chatTool.definition, execute });
      }
    }

    return tools;
  }

  function buildSystemPrompt(description: string, agentTypeName?: string): string {
    const now = new Date();
    const timeStr = now.toLocaleString("en-US", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Resolve agent type personality
    const agentType = agentTypeName && agentTypes?.has(agentTypeName)
      ? agentTypes.get(agentTypeName)!
      : undefined;

    const identity = agentType?.soul
      ? `You are a specialized ${agentType.name} agent working for ${userName} as part of the Bright AI assistant.\n\n${agentType.soul}`
      : `You are Bright, an autonomous agent working on a task for ${userName}.`;

    const maxIter = agentType?.maxIterations || 25;

    const lines = [
      identity,
      `Current time: ${timeStr}.`,
      profile ? `\nUser profile:\n${profile}` : "",

      "\n## APPROACH",
      "Before taking any action, analyze the task and create an execution plan:",
      "1. PLAN: Break the task into sequential phases (e.g., research → create → refine → deliver).",
      `2. BUDGET: You have a maximum of ${maxIter} tool-use iterations. Allocate them across phases:`,
      "   - Research: 8-12 iterations (web searches + page reads)",
      "   - Creation: 5-10 iterations (creating documents, slides, images)",
      "   - Refinement: 2-3 iterations (review and polish)",
      "3. EXECUTE: Work through your plan phase by phase.",
      "4. CHECKPOINT: After completing each phase, use send_progress to update the user.",
      "",
      "State your plan in your first response before calling any tools.",
      "If you are running low on iterations, prioritize delivering a complete (if simpler) result over an incomplete ambitious one.",

      "\n## CORE TOOLS",
      "- web_search: Search the web for information. Use targeted queries.",
      "- fetch_url: Read a specific web page in detail.",
      "- send_progress: Update the user on progress. Use after each major phase.",
      "- ask_user: Ask a clarifying question. Only when truly blocked.",
      supabaseClient && supabaseUrl
        ? "- upload_file: Upload a local file to get a public URL. MCP tools auto-upload their outputs, so this is mainly for non-MCP files."
        : "",

      "\n## DELIVERABLES",
      "The user may request specific deliverables (documents, presentations, images, etc.).",
      "Your job is to CREATE the requested artifact, not just describe what it would contain.",
      "- If the task says 'create a presentation' → actually create slides using available tools.",
      "- If the task says 'generate infographics' → actually generate images using available tools.",
      "- If no creation tools are available, provide the content in the best available format.",
      "- Always share the deliverable link or file location with the user in your final message.",
    ];

    // Dynamic MCP tool guidance based on what's actually registered
    if (registry) {
      const bgTools = registry.getBackgroundTools();
      const mcpCategories = new Map<string, string[]>();
      for (const t of bgTools) {
        if (t.category?.startsWith("mcp:")) {
          const cat = t.category.replace("mcp:", "");
          if (!mcpCategories.has(cat)) mcpCategories.set(cat, []);
          mcpCategories.get(cat)!.push(t.definition.name);
        }
      }

      if (mcpCategories.size > 0) {
        lines.push("\n## EXTERNAL SERVICE TOOLS");

        // Google Workspace — specific workflow guidance
        if (mcpCategories.has("google")) {
          const googleTools = mcpCategories.get("google")!;
          lines.push(
            "\n### Google Workspace (google__*)",
            "You can create and edit Google Docs, Sheets, and Slides.",
            `Available: ${googleTools.slice(0, 12).join(", ")}${googleTools.length > 12 ? ` (+${googleTools.length - 12} more)` : ""}`,
            "Workflow for Docs/Slides with images:",
            "  1. Create the document or presentation first",
            "  2. Generate any images/diagrams with nanobanana__generate_image",
            "  3. Upload each generated image to Google Drive:",
            "     - Look for a google__* tool that uploads a file to Drive",
            "       (search available tools for names containing: upload, drive, file, create)",
            "     - Use the LOCAL FILE PATH from the nanobanana output (e.g. /tmp/bright-images/mcp_xxx.png)",
            "     - This returns a Drive file URL or ID that Google Docs/Slides can natively reference",
            "  4. Insert the image into the document using the Drive URL or file ID",
            "  5. Share the final document URL with the user",
            "",
            "IMPORTANT: Upload images to Google Drive before inserting into Docs/Slides.",
            "Drive files are natively accessible by Google APIs — no public internet URL needed.",
            "The Supabase [URL: ...] in nanobanana output is for Telegram/phone delivery only.",
            "If no Drive upload tool is available, fall back to that Supabase URL.",
          );
        }

        // Image generation — specific workflow guidance
        if (mcpCategories.has("nanobanana")) {
          lines.push(
            "\n### Image Generation (nanobanana__*)",
            "You can generate images, infographics, and diagrams on demand.",
            "Use nanobanana__generate_image with a detailed prompt describing the visual.",
            "For infographics: describe the data, layout, colors, and style in your prompt.",
            "Generate images BEFORE inserting them into documents or slides.",
            "",
            "The tool output includes two references to the generated file:",
            "  - LOCAL PATH: /tmp/bright-images/mcp_xxx.png  ← use this when uploading to Google Drive",
            "  - [URL: https://supabase...]  ← use this for Telegram/phone delivery",
            "",
            "Routing (context-aware):",
            "  - Writing a Google Doc or Slides?  → upload the local path to Drive first (see Google Workspace above)",
            "  - Sending to user on Telegram/phone? → use the [URL: ...] directly",
            "  - Both?  → Drive for the doc, [URL: ...] for delivery",
          );
        }

        // Browser automation — when Playwright and/or Stagehand are available
        if (mcpCategories.has("playwright") || mcpCategories.has("stagehand")) {
          const playwrightTools = mcpCategories.get("playwright") || [];
          const stagehandTools = mcpCategories.get("stagehand") || [];

          lines.push(
            "\n### Browser Automation",
            "You have browser tools for navigating websites, extracting data, filling forms, and taking screenshots.",
          );

          if (playwrightTools.length > 0) {
            lines.push(
              `\nPlaywright (playwright__*): ${playwrightTools.length} tool(s)`,
              "Use for: deterministic navigation, known page structures, screenshots, data extraction from structured pages.",
            );
          }

          if (stagehandTools.length > 0) {
            lines.push(
              `\nStagehand (stagehand__*): ${stagehandTools.length} tool(s)`,
              "Use for: natural language actions ('click the reservation button'), unknown UIs, complex interactions (date pickers, dropdowns, forms).",
            );
          }

          lines.push(
            "\nWorkflow: navigate to page → observe/screenshot to understand layout → act/click/type to interact → extract/screenshot for results.",
            "Screenshots are auto-uploaded — use the [URL: ...] from the output in reports or Google Docs.",
            "If a site requires login, use ask_user to get credentials.",
          );
        }

        // Generic listing for other MCP categories
        for (const [cat, tools] of mcpCategories) {
          if (cat === "google" || cat === "nanobanana" || cat === "playwright" || cat === "stagehand") continue;
          lines.push(
            `\n### ${cat} (${cat}__*): ${tools.length} tool(s) available`,
          );
        }
      }
    }

    // Sub-task guidance (only when queue is available)
    if (supabaseClient && queue) {
      lines.push(
        "\n## SUB-TASKS",
        "You can parallelize independent work by spawning child tasks:",
        "- spawn_subtask: Create a child task with its own tools and iteration budget (15 iterations).",
        "- get_subtask_results: Check/wait for child task completion and collect their results.",
        "",
        "Use sub-tasks when: researching 3+ independent topics, generating multiple images simultaneously.",
        "Do NOT use sub-tasks for sequential work where step B needs step A's output — just do it yourself.",
        "Workflow: spawn all subtasks → continue your own work or wait → collect results → synthesize.",
      );
    }

    lines.push(
      "\n## OUTPUT",
      "- Keep progress updates brief (1-2 sentences).",
      "- Your final response should summarize what was done and link to any created artifacts.",
      "- Format your final response for Telegram (plain text, light formatting).",
    );

    return lines.join("\n");
  }

  async function createAndRunTask(
    description: string,
    userId?: string,
    agentTypeName?: string
  ): Promise<string> {
    if (!supabaseClient) return "Tasks require Supabase to be configured.";

    // Resolve agent type for iteration budget
    const agentType = agentTypeName && agentTypes?.has(agentTypeName)
      ? agentTypes.get(agentTypeName)!
      : undefined;

    // Build system prompt and store it for resumability
    const systemPrompt = buildSystemPrompt(description, agentTypeName);

    // Insert task into Supabase as 'queued'
    const metadata: Record<string, unknown> = {};
    if (agentTypeName) metadata.agent_type = agentTypeName;

    const { data, error } = await supabaseClient
      .from("tasks")
      .insert({
        description,
        status: "queued",
        user_id: userId,
        system_prompt: systemPrompt,
        max_iterations: agentType?.maxIterations || 25,
        priority: 0,
        metadata,
      })
      .select()
      .single();

    if (error || !data) {
      console.error("Failed to create task:", error);
      return "Failed to create task.";
    }

    // Enqueue for execution
    if (queue) {
      await queue.enqueue(data.id);
    } else {
      console.warn("TaskQueue not available — task will be picked up on next poll");
    }

    return data.id;
  }

  async function getActiveTasks(userId?: string): Promise<Task[]> {
    if (!supabaseClient) return [];

    const { data } = await supabaseClient
      .from("tasks")
      .select("*")
      .in("status", ["queued", "running", "waiting_user"])
      .order("created_at", { ascending: false });

    return (data || []).map((row: any) => ({
      id: row.id,
      status: row.status,
      description: row.description,
      priority: row.priority || 0,
      iterationCount: row.iteration_count || 0,
      maxIterations: row.max_iterations || 25,
      tokenUsage: row.token_usage || { input: 0, output: 0 },
      pendingQuestion: row.pending_question,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async function getRecentCompletions(userId?: string, hours = 24): Promise<Task[]> {
    if (!supabaseClient) return [];

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data } = await supabaseClient
      .from("tasks")
      .select("*")
      .in("status", ["completed", "failed"])
      .gte("completed_at", since)
      .order("completed_at", { ascending: false })
      .limit(10);

    return (data || []).map((row: any) => ({
      id: row.id,
      status: row.status,
      description: row.description,
      result: row.result,
      error: row.error,
      priority: row.priority || 0,
      iterationCount: row.iteration_count || 0,
      maxIterations: row.max_iterations || 25,
      tokenUsage: row.token_usage || { input: 0, output: 0 },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    }));
  }

  async function cancelTask(taskId: string): Promise<boolean> {
    if (queue) {
      return queue.cancel(taskId);
    }

    if (!supabaseClient) return false;

    const { error } = await supabaseClient
      .from("tasks")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    return !error;
  }

  /**
   * Create a chain of dependent tasks. Step 1 runs immediately;
   * when it completes, step 2 starts with step 1's result as context, etc.
   * Chain metadata is stored in the task's metadata JSONB column.
   */
  async function createTaskChain(
    steps: string[],
    userId?: string
  ): Promise<string | null> {
    if (!supabaseClient || steps.length === 0) return null;

    // Create the first step as a normal task
    const firstTaskId = await createAndRunTask(steps[0], userId);
    if (!firstTaskId || firstTaskId.startsWith("Failed") || firstTaskId.startsWith("Tasks require")) {
      return null;
    }

    // Store remaining steps as chain metadata on the first task
    if (steps.length > 1) {
      await supabaseClient
        .from("tasks")
        .update({
          metadata: {
            chain_steps: steps.slice(1),
            chain_step_index: 0,
            chain_total: steps.length,
          },
        })
        .eq("id", firstTaskId);
    }

    return firstTaskId;
  }

  /**
   * Create a dependency graph of typed tasks from orchestrator output.
   * Root tasks (no dependencies) are enqueued immediately.
   * Dependent tasks are created as 'queued' but the queue respects depends_on.
   * Returns the list of created task IDs.
   */
  async function createTaskFlow(
    nodes: TaskFlowNode[],
    userId?: string
  ): Promise<string[]> {
    if (!supabaseClient || nodes.length === 0) return [];

    // First pass: create all tasks and collect temp→real ID mapping
    const tempToReal = new Map<string, string>();
    const createdIds: string[] = [];

    for (const node of nodes) {
      const agentType = node.agentType && agentTypes?.has(node.agentType)
        ? agentTypes.get(node.agentType)!
        : undefined;

      const systemPrompt = buildSystemPrompt(node.description, node.agentType);

      const meta: Record<string, unknown> = {};
      if (node.agentType) meta.agent_type = node.agentType;
      // Dependencies will be resolved in second pass
      meta.flow_temp_id = node.tempId;

      const { data, error } = await supabaseClient
        .from("tasks")
        .insert({
          description: node.description,
          status: "queued",
          user_id: userId,
          system_prompt: systemPrompt,
          max_iterations: agentType?.maxIterations || 25,
          priority: node.dependsOn.length === 0 ? 1 : 0,
          metadata: meta,
        })
        .select()
        .single();

      if (error || !data) {
        console.error("Failed to create flow task:", error);
        continue;
      }

      tempToReal.set(node.tempId, data.id);
      createdIds.push(data.id);
    }

    // Second pass: resolve temp IDs to real UUIDs in depends_on
    for (const node of nodes) {
      if (node.dependsOn.length === 0) continue;

      const realId = tempToReal.get(node.tempId);
      if (!realId) continue;

      const realDeps = node.dependsOn
        .map((tempId) => tempToReal.get(tempId))
        .filter(Boolean) as string[];

      if (realDeps.length > 0) {
        await supabaseClient
          .from("tasks")
          .update({
            metadata: {
              agent_type: node.agentType || undefined,
              depends_on: realDeps,
            },
          })
          .eq("id", realId);
      }
    }

    // Enqueue root tasks (no dependencies) — the queue will handle the rest
    for (const node of nodes) {
      if (node.dependsOn.length > 0) continue;
      const realId = tempToReal.get(node.tempId);
      if (realId && queue) {
        await queue.enqueue(realId);
      }
    }

    return createdIds;
  }

  function getAgentTypeNames(): string[] {
    if (!agentTypes) return [];
    return Array.from(agentTypes.keys()).filter((n) => n !== "default");
  }

  return { createAndRunTask, createTaskChain, createTaskFlow, getActiveTasks, getRecentCompletions, cancelTask, buildTools, buildSystemPrompt, setQueue, getAgentTypeNames };
}

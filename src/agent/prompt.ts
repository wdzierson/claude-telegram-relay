/**
 * Prompt Builder
 *
 * Assembles the system instructions and user message for Claude.
 * Returns them separately so the API backend can use the dedicated system field,
 * while the CLI backend concatenates them into a single string.
 */

import type { UserConfig } from "../config/index.ts";

export interface BuiltPrompt {
  system: string;
  user: string;
}

export function buildPrompt(
  userMessage: string,
  opts: {
    profile?: string;
    userConfig: UserConfig;
    memoryContext?: string;
    recentMessages?: string;
    taskContext?: string;
    completedTaskContext?: string;
    availableTools?: string[];
    channel?: "telegram" | "phone";
    conversationHistory?: Array<{ role: string; content: string }>;
    agentTypeNames?: string[];
  }
): BuiltPrompt {
  const now = new Date();
  const timeStr = now.toLocaleString("en-US", {
    timeZone: opts.userConfig.timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const isPhone = opts.channel === "phone";

  const parts = [
    isPhone
      ? "You are a personal AI assistant responding via telephone call. Keep responses brief, conversational, and natural for spoken delivery. Avoid markdown, lists, code blocks, and special formatting. Use short sentences. Speak as if talking out loud. You have full visibility across all channels — task context and recent Telegram activity are included above so you can seamlessly pick up where any channel left off."
      : "You are a personal AI assistant responding via Telegram. Keep responses concise and conversational.",
  ];

  if (opts.userConfig.name) {
    parts.push(`You are speaking with ${opts.userConfig.name}.`);
  }

  parts.push(`Current time: ${timeStr}`);

  if (opts.profile) parts.push(`\nProfile:\n${opts.profile}`);
  if (opts.memoryContext) parts.push(`\n${opts.memoryContext}`);
  if (opts.recentMessages) parts.push(`\n${opts.recentMessages}`);

  // Inject explicit conversation history (phone channel provides this via Telnyx)
  if (opts.conversationHistory?.length) {
    const historyLines = opts.conversationHistory.map(
      (m) => `${m.role === "user" ? opts.userConfig.name || "User" : "You"}: ${m.content}`
    );
    parts.push(`\nRECENT CONVERSATION:\n${historyLines.join("\n")}`);
  }

  if (opts.taskContext) parts.push(`\n${opts.taskContext}`);
  if (opts.completedTaskContext) parts.push(`\n${opts.completedTaskContext}`);

  parts.push(
    "\nMEMORY MANAGEMENT:" +
      "\nWhen the user shares something worth remembering, sets goals, or completes goals, " +
      "include these tags in your response (they are processed automatically and hidden from the user):" +
      "\n[REMEMBER: fact to store]" +
      "\n[GOAL: goal text | DEADLINE: optional date]" +
      "\n[DONE: search text for completed goal]"
  );

  if (!isPhone) {
    parts.push(
      "\nFORMATTING:" +
        "\nYour responses are rendered in Telegram. You can use markdown:" +
        "\n- **bold** for emphasis" +
        "\n- `code` for inline code, triple backticks for code blocks" +
        "\n- Standard bullet points and numbered lists work fine" +
        "\nKeep formatting light — don't over-format casual messages."
    );

    const agentTypes = opts.agentTypeNames?.length
      ? opts.agentTypeNames
      : [];
    const typedTaskLines = agentTypes.length > 0
      ? [
          "\nFor specialized work, specify an agent type:",
          ...agentTypes.map((t) => `[TASK:${t}: description of the work]`),
          "\nAvailable types: " + agentTypes.join(", "),
          "For general tasks, omit the type: [TASK: description]",
        ]
      : [];
    const taskflowLines = agentTypes.length > 0
      ? [
          "\nFor complex multi-step work that needs multiple specialists:",
          "[TASKFLOW: Research quantum computing from 3 angles (physics, industry, ethics) and write a comprehensive report]",
          "TASKFLOW automatically decomposes the request into parallel and sequential tasks with the right specialist agents.",
          "Use TASKFLOW for ambitious requests. Use [TASK:] for simple single-focus work.",
        ]
      : [];

    parts.push(
      "\nTASK MANAGEMENT:" +
        "\nWhen the user asks you to do research, create documents, compare options, " +
        "or do any substantive work, spawn a background task." +
        "\n" +
        "\nFor a single task:" +
        "\n[TASK: clear description of what to research or do]" +
        (typedTaskLines.length > 0 ? "\n" + typedTaskLines.join("\n") : "") +
        "\n" +
        "\nFor multi-step tasks where later steps depend on earlier results:" +
        "\n[TASKCHAIN:" +
        "\n1. First step (e.g., Research quantum immortality theories)" +
        "\n2. Second step using results of step 1 (e.g., Create a Google Slides presentation based on the research)" +
        "\n]" +
        (taskflowLines.length > 0 ? "\n" + taskflowLines.join("\n") : "") +
        "\n" +
        "\nTasks run autonomously with web search, URL reading, browser automation (Playwright + Stagehand), and external service tools (Google Docs, Slides, image generation, etc.)." +
        "\nUse TASKCHAIN when steps genuinely depend on each other. Use separate [TASK:] tags for independent work." +
        "\nOnly use tasks for real work — answer simple questions directly." +
        "\nInclude an acknowledgment to the user alongside the tag (e.g., 'On it! I\\'ll look into that.')."
    );
  }

  if (opts.availableTools?.length) {
    parts.push(
      "\nAVAILABLE TOOLS:" +
        "\nYou have access to tools for this conversation. " +
        "Use them when they would help answer the user's question accurately. " +
        "For simple conversational messages, respond directly without tools." +
        "\nFor memory: your recent conversation history is included above. " +
        "Use search_memory or search_conversations only when the user references " +
        "something from a previous session or older conversation not in the recent context." +
        `\nTools: ${opts.availableTools.join(", ")}`
    );

    // Image generation guidance (only when nanobanana is available)
    const hasImageGen = opts.availableTools.some((t) => t.startsWith("nanobanana__"));
    const hasGoogle = opts.availableTools.some((t) => t.startsWith("google__"));
    if (hasImageGen) {
      let imagePrompt =
        "\nIMAGE GENERATION:" +
        "\nYou can generate images using the nanobanana tools. " +
        "When the user asks for visuals, infographics, diagrams, or illustrations, " +
        "use nanobanana__generate_image to create them. The image will be sent in the chat automatically." +
        "\nGenerated files are auto-uploaded to cloud storage — the tool output includes a public [URL: ...].";
      if (hasGoogle) {
        imagePrompt +=
          "\nWhen creating Google Docs or Slides, you can enhance them with generated images:" +
          "\n1. Generate the image with nanobanana__generate_image" +
          "\n2. The tool output includes a public URL (auto-uploaded) — use that URL directly" +
          "\n3. Insert the image into the document/slide using the public URL with the appropriate Google tool" +
          "\nProactively add relevant visuals to documents and presentations when it would improve them.";
      }
      parts.push(imagePrompt);
    }
  }

  return {
    system: parts.join("\n"),
    user: userMessage,
  };
}

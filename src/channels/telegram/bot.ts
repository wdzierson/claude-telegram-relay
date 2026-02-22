/**
 * Telegram Bot
 *
 * grammY bot setup, authorization middleware, and message handlers.
 * Converts Telegram events into IncomingMessages and passes to the agent.
 * Wires task queue, pending questions, and approval flows.
 */

import { Bot, InlineKeyboard } from "grammy";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import type { Config } from "../../config/index.ts";
import type { MemorySystem } from "../../memory/index.ts";
import type { IncomingMessage, AgentResponse } from "../../agent/index.ts";
import { handleMessage } from "../../agent/index.ts";
import { transcribe } from "../../voice/index.ts";
import { synthesize } from "../../voice/tts.ts";
import { createTaskManager, TaskQueue } from "../../agent/tasks/index.ts";
import type { TaskManager } from "../../agent/tasks/index.ts";
import type { AgentType } from "../../agent/tasks/agent-types.ts";
import { InputFile } from "grammy";
import { sendResponse, sendLongMessage } from "./send.ts";
import { startTyping } from "./typing.ts";
import { ToolRegistry, ApprovalManager, createBuiltinTools } from "../../tools/index.ts";
import type { ApprovalCallback } from "../../tools/types.ts";
import { MCPClientManager, importMCPTools } from "../../tools/mcp/index.ts";
import type { MCPServerConfig } from "../../tools/mcp/index.ts";
import { FileStore } from "../../utils/file-store.ts";
import { createLogger } from "../../utils/logger.ts";

/**
 * Build an inline keyboard with Cancel buttons for spawned tasks.
 */
function taskKeyboard(taskIds: string[]): InlineKeyboard | undefined {
  if (!taskIds.length) return undefined;
  const kb = new InlineKeyboard();
  for (const id of taskIds) {
    kb.text(`Cancel task ${id.substring(0, 8)}`, `task_cancel:${id}`);
    kb.row();
  }
  return kb;
}

export interface BotResult {
  bot: Bot;
  taskQueue: TaskQueue | null;
  taskManager: TaskManager | null;
  registry: ToolRegistry;
  mcpManager: MCPClientManager | null;
}

export async function createBot(
  config: Config,
  memory: MemorySystem,
  profile: string,
  agentTypes?: Map<string, AgentType>
): Promise<BotResult> {
  const bot = new Bot(config.telegram.botToken);
  const primaryUserId = config.telegram.allowedUserIds[0];
  const log = createLogger(memory.client);

  // --- Tool Registry ---
  const registry = new ToolRegistry();
  const builtinTools = createBuiltinTools(config, memory);
  registry.registerAll(builtinTools);

  // --- MCP Servers ---
  let mcpManager: MCPClientManager | null = null;
  if (config.mcp && config.mcp.servers.length > 0) {
    mcpManager = new MCPClientManager();

    // Auto-upload MCP file outputs to Supabase Storage
    if (config.supabase.url && memory.client) {
      mcpManager.setFileStore(new FileStore(memory.client, config.supabase.url));
    }

    for (const serverConfig of config.mcp.servers) {
      try {
        await mcpManager.connect(serverConfig as MCPServerConfig);
        const mcpTools = importMCPTools(mcpManager, serverConfig as MCPServerConfig);
        registry.registerAll(mcpTools);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`MCP: skipping "${serverConfig.name}": ${msg}`);
      }
    }

    registry.setMCPManager(mcpManager);

    const cleanup = async () => {
      if (mcpManager) await mcpManager.disconnectAll();
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  }

  console.log(`Tools registered: ${registry.listNames().join(", ") || "none"}`);

  // --- Approval Manager ---
  const approvalManager = new ApprovalManager();

  const requestApproval: ApprovalCallback = async (toolName, input, description) => {
    const { id, promise } = approvalManager.request(toolName, input, description);

    const kb = new InlineKeyboard()
      .text("Approve", `approve:${id}`)
      .text("Reject", `reject:${id}`);

    const inputPreview = JSON.stringify(input).substring(0, 200);
    await bot.api.sendMessage(
      primaryUserId,
      `🔐 **Tool approval needed**\n\n${description}\n\nInput: ${inputPreview}`,
      { reply_markup: kb }
    );

    return promise;
  };

  // --- Pending Questions (ask_user mid-task flow) ---
  const pendingQuestions = new Map<string, {
    resolve: (answer: string) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  const QUESTION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Called by the ask_user tool when a task needs user input.
   * Sends a Telegram message and returns a Promise that resolves
   * when the user responds (via inline button or next text message).
   */
  const sendQuestion = async (
    question: string,
    taskId: string,
    options?: string[]
  ): Promise<string> => {
    return new Promise<string>((resolve) => {
      // Clear any existing pending question for this task
      const existing = pendingQuestions.get(taskId);
      if (existing) {
        clearTimeout(existing.timer);
        existing.resolve("User did not respond. Proceed with best judgment.");
      }

      const timer = setTimeout(() => {
        pendingQuestions.delete(taskId);
        resolve("User did not respond within 30 minutes. Proceed with your best judgment.");
      }, QUESTION_TIMEOUT_MS);

      pendingQuestions.set(taskId, { resolve, timer });

      // Build Telegram message with optional inline buttons
      const kb = new InlineKeyboard();
      if (options && options.length > 0) {
        for (let i = 0; i < options.length; i++) {
          kb.text(options[i], `task_respond:${taskId}:${i}`);
        }
        kb.row();
      }
      kb.text("Type my answer...", `task_respond:${taskId}:_freetext`);

      const label = `❓ *Task needs your input* (${taskId.substring(0, 8)})\n\n${question}`;

      bot.api.sendMessage(primaryUserId, label, {
        reply_markup: kb,
      }).catch((err) => {
        console.error("Failed to send task question:", err);
      });

      // Also update Supabase status
      if (memory.client) {
        memory.client.from("tasks").update({
          status: "waiting_user",
          pending_question: question,
          pending_question_id: taskId,
          pending_question_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", taskId).then(() => {}, () => {});
      }
    });
  };

  // --- Task Manager + Queue ---
  let taskManager: TaskManager | null = null;
  let taskQueue: TaskQueue | null = null;

  if (config.anthropic && memory.client) {
    const sendToUser = async (text: string) => {
      await sendLongMessage(bot, primaryUserId, text);
    };

    taskManager = createTaskManager({
      supabaseClient: memory.client,
      supabaseUrl: config.supabase?.url,
      sendMessage: sendToUser,
      anthropicConfig: config.anthropic,
      profile,
      userName: config.user.name,
      timezone: config.user.timezone,
      tavilyApiKey: config.tasks.tavilyApiKey,
      sendQuestion,
      registry,
      agentTypes,
    });

    taskQueue = new TaskQueue(
      {
        maxConcurrent: config.queue.maxConcurrent,
        pollIntervalMs: config.queue.pollIntervalMs,
        heartbeatIntervalMs: config.queue.heartbeatIntervalMs,
      },
      {
        supabaseClient: memory.client,
        buildTools: (taskId) => taskManager!.buildTools(taskId),
        buildSystemPrompt: (desc) => taskManager!.buildSystemPrompt(desc),
        sendMessage: sendToUser,
        saveMessage: async (role, content, metadata) => {
          await memory.saveMessage(role, content, metadata);
        },
        anthropicConfig: config.anthropic!,
        logger: log,
      }
    );

    taskManager.setQueue(taskQueue);
  }

  // Resolve agent type names for prompt guidance
  const agentTypeNames = taskManager?.getAgentTypeNames() || [];

  // ========================================
  // MIDDLEWARE & HANDLERS
  // ========================================

  // Authorization middleware
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id.toString();
    const allowed = config.telegram.allowedUserIds;

    if (allowed.length > 0 && (!userId || !allowed.includes(userId))) {
      console.log(`Unauthorized: ${userId}`);
      await ctx.reply("This bot is private.");
      return;
    }

    await next();
  });

  // Callback queries (inline button presses)
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    // Task cancel buttons
    if (data.startsWith("task_cancel:") && taskManager) {
      const taskId = data.replace("task_cancel:", "");
      const cancelled = await taskManager.cancelTask(taskId);

      if (cancelled) {
        await ctx.answerCallbackQuery({ text: "Task cancelled" });
        await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      } else {
        await ctx.answerCallbackQuery({ text: "Could not cancel task" });
      }
      return;
    }

    // Task question responses (ask_user)
    if (data.startsWith("task_respond:")) {
      const parts = data.replace("task_respond:", "").split(":");
      const taskId = parts[0];
      const optionPart = parts[1];

      const pending = pendingQuestions.get(taskId);
      if (!pending) {
        await ctx.answerCallbackQuery({ text: "Question expired" });
        await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
        return;
      }

      if (optionPart === "_freetext") {
        // User wants to type a free-text answer — keep pending, mark as awaiting text
        await ctx.answerCallbackQuery({ text: "Type your answer below" });
        await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
        // The pending question stays in the map — next text message resolves it
        return;
      }

      // Inline button option selected
      const optionIndex = parseInt(optionPart);
      // Reconstruct the option label (we don't store options, but we can get it from the message)
      const answer = ctx.callbackQuery.message?.reply_markup?.inline_keyboard
        ?.flat()
        ?.find((b) => b.callback_data === data)
        ?.text || `Option ${optionIndex + 1}`;

      clearTimeout(pending.timer);
      pendingQuestions.delete(taskId);
      pending.resolve(answer);

      await ctx.answerCallbackQuery({ text: "Answer sent to task" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      return;
    }

    // Tool approval buttons
    if (data.startsWith("approve:")) {
      const approvalId = data.replace("approve:", "");
      const handled = approvalManager.handleResponse(approvalId, true);
      await ctx.answerCallbackQuery({ text: handled ? "Approved" : "Expired" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      return;
    }

    if (data.startsWith("reject:")) {
      const approvalId = data.replace("reject:", "");
      const handled = approvalManager.handleResponse(approvalId, false);
      await ctx.answerCallbackQuery({ text: handled ? "Rejected" : "Expired" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      return;
    }

    await ctx.answerCallbackQuery();
  });

  // Helper: process agent response and send with optional task buttons + images
  async function sendAgentResponse(
    ctx: Parameters<Parameters<Bot["on"]>[1]>[0],
    response: AgentResponse
  ): Promise<void> {
    // Send any generated images first
    if (response.images?.length) {
      for (const imgPath of response.images) {
        try {
          const inputFile = new InputFile(imgPath);
          await ctx.replyWithPhoto(inputFile);
        } catch (err) {
          console.error(`Failed to send image ${imgPath}:`, err);
        }
      }
    }

    const kb = taskKeyboard(response.taskIds);
    await sendResponse(ctx, response.text, kb ? { reply_markup: kb } : undefined);
  }

  // Text messages
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    log.info("bot", "text_received", { preview: text.substring(0, 50) });

    // Check if this is an answer to a pending task question
    if (pendingQuestions.size > 0) {
      // Resolve the oldest pending question with this text
      const [taskId, pending] = pendingQuestions.entries().next().value!;
      clearTimeout(pending.timer);
      pendingQuestions.delete(taskId);
      pending.resolve(text);
      await ctx.reply(`Answer sent to task ${taskId.substring(0, 8)}.`);
      return;
    }

    const stopTyping = startTyping(ctx);
    try {
      const incoming: IncomingMessage = {
        type: "text",
        text,
        userId: ctx.from?.id.toString(),
      };

      const response = await handleMessage(
        incoming, config, memory, profile, taskManager, registry, requestApproval, agentTypeNames
      );
      await sendAgentResponse(ctx, response);
    } catch (error) {
      log.error("bot", "message_error", { error: String(error) });
      await ctx.reply("Sorry, I hit an error processing that. Try again in a moment.");
    } finally {
      stopTyping();
    }
  });

  // Voice messages
  bot.on("message:voice", async (ctx) => {
    const voice = ctx.message.voice;
    log.info("bot", "voice_received", { duration: voice.duration });

    const stopTyping = startTyping(ctx);
    try {
      if (!config.voice) {
        await ctx.reply(
          "Voice transcription is not set up yet. " +
            "Run the setup again and choose a voice provider (Groq or local Whisper)."
        );
        return;
      }

      const file = await ctx.getFile();
      const url = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
      const resp = await fetch(url);
      const buffer = Buffer.from(await resp.arrayBuffer());

      const transcription = await transcribe(buffer, config.voice);
      if (!transcription) {
        await ctx.reply("Could not transcribe voice message.");
        return;
      }

      const incoming: IncomingMessage = {
        type: "voice",
        text: transcription,
        userId: ctx.from?.id.toString(),
        metadata: { voiceDuration: voice.duration },
      };

      const reply = await handleMessage(
        incoming, config, memory, profile, taskManager, registry, requestApproval, agentTypeNames
      );

      // If TTS is configured, reply with voice + text
      if (config.tts) {
        const ttsResult = await synthesize(reply.text, config.tts);
        if (ttsResult) {
          const filename = ttsResult.format === "ogg" ? "reply.ogg" : "reply.mp3";
          const inputFile = new InputFile(ttsResult.buffer, filename);

          if (ttsResult.format === "ogg") {
            await ctx.replyWithVoice(inputFile);
          } else {
            await ctx.replyWithAudio(inputFile);
          }
        }
      }

      // Always send text too
      await sendAgentResponse(ctx, reply);
    } catch (error) {
      log.error("bot", "voice_error", { error: String(error) });
      await ctx.reply("Could not process voice message. Check logs for details.");
    } finally {
      stopTyping();
    }
  });

  // Photos
  bot.on("message:photo", async (ctx) => {
    log.info("bot", "photo_received");

    const stopTyping = startTyping(ctx);
    try {
      const photos = ctx.message.photo;
      const photo = photos[photos.length - 1];
      const file = await ctx.api.getFile(photo.file_id);

      const timestamp = Date.now();
      const filePath = join(config.paths.uploadsDir, `image_${timestamp}.jpg`);

      const resp = await fetch(
        `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`
      );
      const buffer = await resp.arrayBuffer();
      await writeFile(filePath, Buffer.from(buffer));

      const caption = ctx.message.caption || "Analyze this image.";

      const incoming: IncomingMessage = {
        type: "photo",
        text: caption,
        filePath,
        userId: ctx.from?.id.toString(),
      };

      const reply = await handleMessage(
        incoming, config, memory, profile, taskManager, registry, requestApproval, agentTypeNames
      );

      // Cleanup temp file
      await unlink(filePath).catch(() => {});

      await sendAgentResponse(ctx, reply);
    } catch (error) {
      log.error("bot", "photo_error", { error: String(error) });
      await ctx.reply("Could not process image.");
    } finally {
      stopTyping();
    }
  });

  // Documents
  bot.on("message:document", async (ctx) => {
    const doc = ctx.message.document;
    log.info("bot", "document_received", { filename: doc.file_name });

    const stopTyping = startTyping(ctx);
    try {
      const file = await ctx.getFile();
      const timestamp = Date.now();
      const fileName = doc.file_name || `file_${timestamp}`;
      const filePath = join(config.paths.uploadsDir, `${timestamp}_${fileName}`);

      const resp = await fetch(
        `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`
      );
      const buffer = await resp.arrayBuffer();
      await writeFile(filePath, Buffer.from(buffer));

      const caption = ctx.message.caption || `Analyze: ${doc.file_name}`;

      const incoming: IncomingMessage = {
        type: "document",
        text: caption,
        filePath,
        userId: ctx.from?.id.toString(),
      };

      const reply = await handleMessage(
        incoming, config, memory, profile, taskManager, registry, requestApproval, agentTypeNames
      );

      await unlink(filePath).catch(() => {});

      await sendAgentResponse(ctx, reply);
    } catch (error) {
      log.error("bot", "document_error", { error: String(error) });
      await ctx.reply("Could not process document.");
    } finally {
      stopTyping();
    }
  });

  // Global error handler — prevents unhandled errors from crashing the bot
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error handling update ${ctx.update.update_id}:`, err.error);
    ctx.reply("Something went wrong on my end. Try again in a moment.")
      .catch(() => {});
  });

  return { bot, taskQueue, taskManager, registry, mcpManager };
}

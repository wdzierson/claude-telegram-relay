/**
 * Scheduler Context
 *
 * Shared bootstrap for scheduler scripts (check-in, briefing).
 * Loads config, memory, profile, and provides pre-bound helpers
 * for sending Telegram messages and calling Claude.
 */

import type { Config } from "../config/index.ts";
import type { MemorySystem } from "../memory/index.ts";
import { loadConfig } from "../config/index.ts";
import { loadProfile } from "../config/profile.ts";
import { createMemory } from "../memory/index.ts";
import { callAnthropicAPI } from "../agent/anthropic-api.ts";
import { sendTelegram } from "./telegram.ts";

export interface SchedulerContext {
  config: Config;
  memory: MemorySystem;
  profile: string;
  sendTelegram: (message: string, parseMode?: string) => Promise<boolean>;
  callClaude: (systemPrompt: string, userMessage: string) => Promise<string>;
}

export async function createSchedulerContext(): Promise<SchedulerContext> {
  const config = loadConfig();

  if (!config.anthropic) {
    console.error("Scheduler requires ANTHROPIC_API_KEY");
    process.exit(1);
  }

  if (!config.supabase) {
    console.error("Scheduler requires Supabase configuration");
    process.exit(1);
  }

  const memory = createMemory(config.supabase);
  const profile = await loadProfile(config.paths.projectRoot);
  const chatId = config.telegram.allowedUserIds[0];

  if (!chatId) {
    console.error("No TELEGRAM_USER_ID configured");
    process.exit(1);
  }

  return {
    config,
    memory,
    profile,
    sendTelegram: (message, parseMode?) =>
      sendTelegram(config.telegram.botToken, chatId, message, parseMode),
    callClaude: (systemPrompt, userMessage) =>
      callAnthropicAPI(systemPrompt, userMessage, config.anthropic!),
  };
}

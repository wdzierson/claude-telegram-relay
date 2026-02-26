/**
 * Telegram Channel Adapter
 *
 * Wraps the existing Telegram send function to implement the Channel interface.
 * The underlying grammY bot's message flow remains unchanged — this adapter
 * provides a clean interface for future channel-agnostic code.
 */

import type { Channel } from "../types.ts";

export class TelegramChannel implements Channel {
  readonly id = "telegram";
  readonly name = "Telegram";

  constructor(private readonly sendFn: (text: string) => Promise<void>) {}

  async sendMessage(text: string): Promise<void> {
    await this.sendFn(text);
  }

  async sendTaskUpdate(taskId: string, status: string, detail?: string): Promise<void> {
    const msg = detail
      ? `Task [${status}]: ${detail}`
      : `Task ${taskId.substring(0, 8)} → ${status}`;
    await this.sendMessage(msg);
  }

  async askUser(_taskId: string, _question: string): Promise<string> {
    // Handled by the existing pendingQuestions flow in bot.ts
    throw new Error("askUser is handled by the Telegram pending questions flow");
  }

  isConnected(): boolean {
    return true; // Telegram bot is always connected once started
  }
}

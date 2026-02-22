/**
 * Telegram Response Sender
 *
 * Handles splitting long messages and HTML formatting with plain-text fallback.
 */

import type { Context } from "grammy";
import type { Bot, InlineKeyboard } from "grammy";
import { toTelegramHtml } from "./format.ts";

const MAX_LENGTH = 4000;

export interface SendOptions {
  parse_mode?: "HTML";
  reply_markup?: InlineKeyboard;
}

/**
 * Split text at natural boundaries to fit Telegram's message limit.
 */
export function splitText(text: string, maxLength = MAX_LENGTH): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = remaining.lastIndexOf("\n\n", maxLength);
    if (splitIndex === -1) splitIndex = remaining.lastIndexOf("\n", maxLength);
    if (splitIndex === -1) splitIndex = remaining.lastIndexOf(" ", maxLength);
    if (splitIndex === -1) splitIndex = maxLength;

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks;
}

/**
 * Send a response via ctx.reply() with HTML formatting and plain-text fallback.
 * reply_markup is only attached to the first chunk.
 */
export async function sendResponse(
  ctx: Context,
  response: string,
  opts?: SendOptions
): Promise<void> {
  const htmlText = toTelegramHtml(response);
  const chunks = splitText(htmlText);

  for (let i = 0; i < chunks.length; i++) {
    const isFirst = i === 0;
    try {
      await ctx.reply(chunks[i], {
        parse_mode: "HTML",
        ...(isFirst && opts?.reply_markup ? { reply_markup: opts.reply_markup } : {}),
      });
    } catch (err: unknown) {
      // If HTML parsing fails, fall back to plain text
      const isParseError =
        err instanceof Error && /bad request|parse|can't parse/i.test(err.message);
      if (isParseError) {
        const plainChunks = splitText(response);
        for (const chunk of plainChunks) {
          await ctx.reply(chunk);
        }
        return; // Already sent the full message as plain text
      }
      throw err;
    }
  }
}

/**
 * Send a long message proactively via bot.api.sendMessage().
 * Used by background tasks to deliver results outside of a message handler context.
 */
export async function sendLongMessage(
  bot: Bot,
  chatId: string,
  text: string,
  opts?: SendOptions
): Promise<void> {
  const htmlText = toTelegramHtml(text);
  const chunks = splitText(htmlText);

  for (let i = 0; i < chunks.length; i++) {
    const isFirst = i === 0;
    try {
      await bot.api.sendMessage(chatId, chunks[i], {
        parse_mode: "HTML",
        ...(isFirst && opts?.reply_markup ? { reply_markup: opts.reply_markup } : {}),
      });
    } catch (err: unknown) {
      const isParseError =
        err instanceof Error && /bad request|parse|can't parse/i.test(err.message);
      if (isParseError) {
        const plainChunks = splitText(text);
        for (const chunk of plainChunks) {
          await bot.api.sendMessage(chatId, chunk);
        }
        return;
      }
      throw err;
    }
  }
}

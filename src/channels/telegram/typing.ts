/**
 * Persistent Typing Indicator
 *
 * Telegram's "typing..." indicator expires after ~5 seconds.
 * Claude responses take 5-15 seconds. This repeats the indicator
 * every 4 seconds so it stays visible until the response is ready.
 */

import type { Context } from "grammy";

const TYPING_INTERVAL_MS = 4_000;
const MAX_TYPING_MS = 120_000; // Safety net: stop after 2 minutes

/**
 * Start a persistent typing indicator. Returns a function to stop it.
 *
 * Usage:
 *   const stop = startTyping(ctx);
 *   try { ... } finally { stop(); }
 */
export function startTyping(ctx: Context): () => void {
  let stopped = false;

  const sendTyping = () => {
    if (stopped) return;
    ctx.replyWithChatAction("typing").catch(() => {});
  };

  // Send immediately
  sendTyping();

  // Repeat every 4 seconds
  const interval = setInterval(sendTyping, TYPING_INTERVAL_MS);

  // Safety timeout
  const timeout = setTimeout(() => {
    stopped = true;
    clearInterval(interval);
  }, MAX_TYPING_MS);

  return () => {
    stopped = true;
    clearInterval(interval);
    clearTimeout(timeout);
  };
}

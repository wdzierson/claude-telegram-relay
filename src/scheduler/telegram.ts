/**
 * Standalone Telegram Sender
 *
 * Sends messages via the Telegram Bot API using fetch().
 * No grammY dependency — used by scheduler scripts that run
 * as separate processes outside the main bot.
 */

const MAX_LENGTH = 4000;

export async function sendTelegram(
  botToken: string,
  chatId: string,
  message: string,
  parseMode?: string
): Promise<boolean> {
  const chunks = splitMessage(message);

  for (const chunk of chunks) {
    const body: Record<string, string> = { chat_id: chatId, text: chunk };
    if (parseMode) body.parse_mode = parseMode;

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!response.ok) {
        const err = await response.text();
        console.error("Telegram send failed:", err);
        return false;
      }
    } catch (error) {
      console.error("Telegram send error:", error);
      return false;
    }
  }

  return true;
}

function splitMessage(text: string): string[] {
  if (text.length <= MAX_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = remaining.lastIndexOf("\n\n", MAX_LENGTH);
    if (splitIndex === -1) splitIndex = remaining.lastIndexOf("\n", MAX_LENGTH);
    if (splitIndex === -1) splitIndex = remaining.lastIndexOf(" ", MAX_LENGTH);
    if (splitIndex === -1) splitIndex = MAX_LENGTH;

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks;
}

/**
 * Telegram HTML Formatter
 *
 * Converts Claude's markdown output to Telegram-compatible HTML.
 * HTML parse mode chosen over MarkdownV2 — only need to escape <, >, &.
 */

/**
 * Escape characters that are special in HTML.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convert markdown to Telegram HTML.
 *
 * Handles: fenced code blocks, inline code, bold, italic, strikethrough, links.
 * Headers and bullet points pass through as-is (fine in Telegram).
 */
export function toTelegramHtml(markdown: string): string {
  // First escape HTML entities in the raw text
  let html = escapeHtml(markdown);

  // Fenced code blocks: ```lang\ncode\n```
  html = html.replace(/```(?:\w*)\n([\s\S]*?)```/g, "<pre><code>$1</code></pre>");

  // Inline code: `code`
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

  // Italic: *text* (single asterisk, not already consumed by bold)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<i>$1</i>");

  // Strikethrough: ~~text~~
  html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // Links: [text](url) — entities were escaped, so match escaped version
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>'
  );

  return html;
}

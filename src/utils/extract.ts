/**
 * Text Extraction Utility
 *
 * Extracts text content from different file types:
 * - PDF → pdf-parse
 * - Word (.docx) → mammoth
 * - Text files → UTF-8 decode
 * - Audio → transcription via voice module
 * - Images → returns null (handled by Claude Vision)
 */

import type { VoiceConfig } from "../config/index.ts";
import { transcribe } from "../voice/index.ts";

const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
]);

/**
 * Extract text from a file buffer based on its MIME type.
 * Returns null for images (handled by vision) or unsupported types.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  voiceConfig?: VoiceConfig
): Promise<string | null> {
  // Images — handled by Claude Vision, not text extraction
  if (mimeType.startsWith("image/")) {
    return null;
  }

  // PDF
  if (mimeType === "application/pdf") {
    return extractPdf(buffer);
  }

  // Word documents
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    return extractDocx(buffer);
  }

  // Plain text files
  if (TEXT_MIME_TYPES.has(mimeType)) {
    return buffer.toString("utf-8");
  }

  // Audio — transcribe
  if (mimeType.startsWith("audio/")) {
    if (!voiceConfig) return null;
    const text = await transcribe(buffer, voiceConfig);
    return text || null;
  }

  return null;
}

async function extractPdf(buffer: Buffer): Promise<string | null> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return result.text?.trim() || null;
  } catch (err: any) {
    console.warn("PDF extraction failed:", err.message);
    return null;
  }
}

async function extractDocx(buffer: Buffer): Promise<string | null> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value?.trim() || null;
  } catch (err: any) {
    console.warn("DOCX extraction failed:", err.message);
    return null;
  }
}

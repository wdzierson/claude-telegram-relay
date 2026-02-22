/**
 * Voice Module
 *
 * Routes audio buffers to the configured provider (Groq or local whisper.cpp).
 * Returns transcribed text. No-op if voice is not configured.
 */

import type { VoiceConfig } from "../config/index.ts";
import { transcribeGroq } from "./groq.ts";
import { transcribeLocal } from "./local.ts";

export async function transcribe(
  audioBuffer: Buffer,
  voiceConfig?: VoiceConfig
): Promise<string> {
  if (!voiceConfig) return "";

  if (voiceConfig.provider === "groq") {
    return transcribeGroq(audioBuffer);
  }

  if (voiceConfig.provider === "local") {
    const binary = voiceConfig.whisperBinary || "whisper-cpp";
    const model = voiceConfig.whisperModelPath;
    if (!model) throw new Error("WHISPER_MODEL_PATH not set");
    return transcribeLocal(audioBuffer, binary, model);
  }

  console.error(`Unknown voice provider: ${voiceConfig.provider}`);
  return "";
}

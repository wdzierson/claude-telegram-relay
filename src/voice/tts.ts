/**
 * Text-to-Speech — ElevenLabs
 *
 * Calls the ElevenLabs API to synthesize speech from text.
 * Returns an OGG Opus buffer suitable for Telegram voice messages.
 * Falls back to MP3 if ffmpeg is not available.
 */

import { spawn } from "bun";
import type { TTSConfig } from "../config/index.ts";

export interface TTSResult {
  buffer: Buffer;
  format: "ogg" | "mp3";
}

async function convertToOgg(mp3Buffer: Buffer): Promise<Buffer | null> {
  try {
    const proc = spawn({
      cmd: ["ffmpeg", "-i", "pipe:0", "-c:a", "libopus", "-f", "ogg", "pipe:1"],
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write(mp3Buffer);
    proc.stdin.end();

    const output = await new Response(proc.stdout).arrayBuffer();
    const exitCode = await proc.exited;

    if (exitCode !== 0) return null;
    return Buffer.from(output);
  } catch {
    return null;
  }
}

export async function synthesize(
  text: string,
  config: TTSConfig
): Promise<TTSResult | null> {
  // Trim long text — ElevenLabs has a 5000 char limit
  const trimmed = text.length > 4500 ? text.substring(0, 4500) + "..." : text;

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${config.voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": config.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: trimmed,
          model_id: config.model,
        }),
      }
    );

    if (!response.ok) {
      console.error(`ElevenLabs error: ${response.status} ${response.statusText}`);
      return null;
    }

    const mp3Buffer = Buffer.from(await response.arrayBuffer());

    // Try converting to OGG Opus for Telegram voice messages
    const oggBuffer = await convertToOgg(mp3Buffer);
    if (oggBuffer) {
      return { buffer: oggBuffer, format: "ogg" };
    }

    // Fallback: return MP3 (will be sent as audio file instead of voice bubble)
    return { buffer: mp3Buffer, format: "mp3" };
  } catch (error: any) {
    console.error("TTS error:", error.message || error);
    return null;
  }
}

/**
 * Local Whisper Transcription
 *
 * Uses whisper.cpp for fully offline speech-to-text.
 * Requires ffmpeg and whisper-cpp installed locally.
 */

import { spawn } from "bun";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";

export async function transcribeLocal(
  audioBuffer: Buffer,
  whisperBinary: string,
  modelPath: string
): Promise<string> {
  const timestamp = Date.now();
  const tmpDir = process.env.TMPDIR || "/tmp";
  const oggPath = join(tmpDir, `voice_${timestamp}.ogg`);
  const wavPath = join(tmpDir, `voice_${timestamp}.wav`);
  const txtPath = join(tmpDir, `voice_${timestamp}.txt`);

  try {
    await writeFile(oggPath, audioBuffer);

    // Convert OGG -> WAV via ffmpeg
    const ffmpeg = spawn(
      [
        "ffmpeg", "-i", oggPath,
        "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
        wavPath, "-y",
      ],
      { stdout: "pipe", stderr: "pipe" }
    );
    const ffmpegExit = await ffmpeg.exited;
    if (ffmpegExit !== 0) {
      const stderr = await new Response(ffmpeg.stderr).text();
      throw new Error(`ffmpeg failed (code ${ffmpegExit}): ${stderr}`);
    }

    // Transcribe via whisper.cpp
    const whisper = spawn(
      [
        whisperBinary,
        "--model", modelPath,
        "--file", wavPath,
        "--output-txt",
        "--output-file", join(tmpDir, `voice_${timestamp}`),
        "--no-prints",
      ],
      { stdout: "pipe", stderr: "pipe" }
    );
    const whisperExit = await whisper.exited;
    if (whisperExit !== 0) {
      const stderr = await new Response(whisper.stderr).text();
      throw new Error(`whisper-cpp failed (code ${whisperExit}): ${stderr}`);
    }

    const text = await readFile(txtPath, "utf-8");
    return text.trim();
  } finally {
    await unlink(oggPath).catch(() => {});
    await unlink(wavPath).catch(() => {});
    await unlink(txtPath).catch(() => {});
  }
}

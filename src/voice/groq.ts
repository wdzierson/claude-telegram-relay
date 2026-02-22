/**
 * Groq Cloud Transcription
 *
 * Uses Groq's Whisper API for fast cloud-based speech-to-text.
 * Requires GROQ_API_KEY (read from env by the Groq SDK).
 */

export async function transcribeGroq(audioBuffer: Buffer): Promise<string> {
  const Groq = (await import("groq-sdk")).default;
  const groq = new Groq();

  const file = new File([audioBuffer], "voice.ogg", { type: "audio/ogg" });

  const result = await groq.audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
  });

  return result.text.trim();
}

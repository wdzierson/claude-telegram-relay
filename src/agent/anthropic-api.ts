/**
 * Anthropic API Caller
 *
 * Calls the Anthropic Messages API directly via HTTP.
 * Drop-in alternative to claude-cli.ts for server/VPS use.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicConfig } from "../config/index.ts";

let client: Anthropic | null = null;

function getClient(config: AnthropicConfig): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.apiKey, maxRetries: 3 });
  }
  return client;
}

export async function callAnthropicAPI(
  systemPrompt: string,
  userMessage: string,
  config: AnthropicConfig,
  imageBase64?: { data: string; mediaType: string }
): Promise<string> {
  console.log(`Calling Anthropic API: ${userMessage.substring(0, 50)}...`);

  try {
    const anthropic = getClient(config);

    // Build content blocks — text only, or image + text for vision
    const content: Anthropic.Messages.ContentBlockParam[] = [];

    if (imageBase64) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: imageBase64.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: imageBase64.data,
        },
      });
    }

    content.push({ type: "text", text: userMessage });

    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content }],
    });

    const block = response.content[0];
    if (block.type === "text") {
      return block.text.trim();
    }

    return "Error: Unexpected response format from Anthropic API";
  } catch (error: any) {
    console.error("Anthropic API error:", error.message || error);
    return `Error: ${error.message || "Anthropic API call failed"}`;
  }
}

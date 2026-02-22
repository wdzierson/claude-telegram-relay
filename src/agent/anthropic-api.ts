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
  config: AnthropicConfig
): Promise<string> {
  console.log(`Calling Anthropic API: ${userMessage.substring(0, 50)}...`);

  try {
    const anthropic = getClient(config);
    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
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

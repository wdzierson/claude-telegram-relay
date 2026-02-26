/**
 * Chat-Level Tool-Use Loop
 *
 * Similar to tasks/runner.ts but for the main conversation:
 * - Shorter timeout (30s vs 10min)
 * - Fewer max iterations (10 vs 25)
 * - No Supabase task tracking
 * - Supports human-in-the-loop approval
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicConfig } from "../config/index.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import type { ChatTool, ApprovalCallback } from "../tools/types.ts";

export interface ChatLoopOptions {
  systemPrompt: string;
  userMessage: string;
  config: AnthropicConfig;
  registry: ToolRegistry;
  requestApproval?: ApprovalCallback;
  imageBase64?: { data: string; mediaType: string };
}

export interface ChatLoopResult {
  text: string;
  toolsUsed: string[];
  tokenUsage: { input: number; output: number };
  images: string[];
}

const MAX_ITERATIONS = 10;
const TIMEOUT_MS = 30_000;

let client: Anthropic | null = null;

function getClient(config: AnthropicConfig): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.apiKey, maxRetries: 3 });
  return client;
}

/**
 * Check whether a tool call needs approval.
 * Returns a description string if approval needed, null if not.
 */
function checkApproval(
  tool: ChatTool,
  input: Record<string, unknown>
): string | null {
  if (tool.approval === "never") return null;
  if (tool.approval === "always") return `Use ${tool.definition.name}?`;
  if (tool.approval === "destructive" && tool.describeAction) {
    return tool.describeAction(input);
  }
  return null;
}

export async function runChatLoop(
  options: ChatLoopOptions
): Promise<ChatLoopResult> {
  const { systemPrompt, userMessage, config, registry, requestApproval } =
    options;
  const anthropic = getClient(config);

  const chatTools = registry.getChatTools();
  const toolDefinitions = registry.getChatToolDefinitions();
  const toolMap = new Map<string, ChatTool>(
    chatTools.map((t) => [t.definition.name, t])
  );

  // Build first message — text only, or image + text for vision
  const userContent: Anthropic.Messages.ContentBlockParam[] = [];

  if (options.imageBase64) {
    userContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: options.imageBase64.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: options.imageBase64.data,
      },
    });
  }

  userContent.push({ type: 'text', text: userMessage });

  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userContent },
  ];

  let totalInput = 0;
  let totalOutput = 0;
  const toolsUsed: string[] = [];
  const startTime = Date.now();

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Timeout check
    if (Date.now() - startTime > TIMEOUT_MS) {
      return {
        text: "I was taking too long with tool calls. Let me answer with what I have.",
        toolsUsed,
        tokenUsage: { input: totalInput, output: totalOutput },
        images: registry.takePendingImages(),
      };
    }

    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemPrompt,
      tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
      messages,
    });

    totalInput += response.usage.input_tokens;
    totalOutput += response.usage.output_tokens;

    let resultText = "";
    let hasToolUse = false;
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        resultText += block.text;
      }
      if (block.type === "tool_use") {
        hasToolUse = true;
        const tool = toolMap.get(block.name);

        if (!tool) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: Unknown tool "${block.name}"`,
            is_error: true,
          });
          continue;
        }

        toolsUsed.push(block.name);
        const input = block.input as Record<string, unknown>;

        // Check if approval is needed
        const needsApproval = checkApproval(tool, input);
        if (needsApproval && requestApproval) {
          const approved = await requestApproval(
            block.name,
            input,
            needsApproval
          );
          if (!approved) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: "User denied permission for this action.",
            });
            continue;
          }
        }

        try {
          console.log(`Chat tool: ${block.name}`);
          const result = await tool.execute(input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`Chat tool ${block.name} error:`, message);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: ${message}`,
            is_error: true,
          });
        }
      }
    }

    // If no tool use or Claude said it's done, return
    if (!hasToolUse || response.stop_reason === "end_turn") {
      return {
        text: resultText,
        toolsUsed,
        tokenUsage: { input: totalInput, output: totalOutput },
        images: registry.takePendingImages(),
      };
    }

    // Continue: add assistant response + tool results to history
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  // Hit max iterations
  return {
    text: "I reached the maximum number of tool calls. Here's what I found so far.",
    toolsUsed,
    tokenUsage: { input: totalInput, output: totalOutput },
    images: registry.takePendingImages(),
  };
}

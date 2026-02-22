/**
 * Task System — Agentic Loop Runner
 *
 * Takes a task description, runs Claude in a tool-use loop,
 * and returns the final result. Handles safety limits (max iterations,
 * timeout, token tracking). Supports resume from saved state and
 * cancellation via AbortSignal.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { TaskRunnerOptions } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function runTask(options: TaskRunnerOptions): Promise<string> {
  const {
    task,
    tools,
    systemPrompt,
    resumeHistory,
    signal,
    onStatusChange,
    onIteration,
    onSaveState,
    anthropicConfig,
  } = options;

  const client = new Anthropic({ apiKey: anthropicConfig.apiKey, maxRetries: 5 });
  const toolDefinitions = tools.map((t) => t.definition);
  const toolMap = new Map(tools.map((t) => [t.definition.name, t]));

  // Resume from saved state or start fresh
  const messages: Anthropic.Messages.MessageParam[] = resumeHistory && resumeHistory.length > 0
    ? [...resumeHistory]
    : [{ role: "user", content: task.description }];

  let totalInput = task.tokenUsage?.input || 0;
  let totalOutput = task.tokenUsage?.output || 0;
  let iteration = task.iterationCount || 0;
  const startTime = Date.now();

  if (resumeHistory && resumeHistory.length > 0) {
    console.log(`Task ${task.id}: resuming from iteration ${iteration}`);
  }

  await onStatusChange(task.id, "running");

  // Plan persistence: the agent's first response contains its execution plan.
  // We extract it and re-inject into the system prompt on subsequent iterations
  // so the plan stays visible even as tool results fill the context window.
  let extractedPlan: string | undefined;

  try {
    while (iteration < task.maxIterations) {
      // Abort check
      if (signal?.aborted) {
        await onStatusChange(task.id, "cancelled", "Task cancelled by user.");
        return "Task was cancelled.";
      }

      // Timeout check
      if (Date.now() - startTime > DEFAULT_TIMEOUT_MS) {
        await onStatusChange(
          task.id,
          "completed",
          "Task timed out after 10 minutes. Partial results may have been sent via progress updates."
        );
        return "Task timed out. Check earlier progress updates for partial results.";
      }

      iteration++;
      console.log(`Task ${task.id}: iteration ${iteration}`);

      // Re-inject the plan into the system prompt so it persists across iterations
      const effectiveSystemPrompt = extractedPlan
        ? `${systemPrompt}\n\n## YOUR EXECUTION PLAN (from your initial analysis)\n${extractedPlan}\n\nFollow this plan phase by phase. Note which phases are complete.`
        : systemPrompt;

      const response = await client.messages.create({
        model: anthropicConfig.model,
        max_tokens: anthropicConfig.maxTokens,
        system: effectiveSystemPrompt,
        tools: toolDefinitions,
        messages,
      });

      totalInput += response.usage.input_tokens;
      totalOutput += response.usage.output_tokens;
      await onIteration(task.id, iteration, {
        input: totalInput,
        output: totalOutput,
      });

      // Process content blocks
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

          if (tool) {
            try {
              console.log(`Task ${task.id}: calling ${block.name}`);
              const result = await tool.execute(
                block.input as Record<string, unknown>
              );
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: result,
              });
            } catch (err: any) {
              console.error(`Task ${task.id}: tool ${block.name} error:`, err.message);
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: `Error: ${err.message}`,
                is_error: true,
              });
            }
          } else {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Error: Unknown tool "${block.name}"`,
              is_error: true,
            });
          }
        }
      }

      // Extract plan from the agent's first iteration response
      if (iteration === 1 && resultText && resultText.length > 50 && !extractedPlan) {
        extractedPlan = resultText.trim();
        console.log(`Task ${task.id}: extracted execution plan (${extractedPlan.length} chars)`);
      }

      // If no tool use or stop_reason is end_turn, we're done
      if (!hasToolUse || response.stop_reason === "end_turn") {
        await onStatusChange(task.id, "completed", resultText);
        return resultText;
      }

      // Continue the loop: add assistant response + tool results
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      // Persist state for resumability
      if (onSaveState) {
        await onSaveState(task.id, messages);
      }
    }

    // Hit max iterations
    const maxMsg = `Task reached maximum iterations (${task.maxIterations}). Partial results may have been sent via progress updates.`;
    await onStatusChange(task.id, "completed", maxMsg);
    return maxMsg;
  } catch (error: any) {
    // Don't mark as failed if it was an abort
    if (signal?.aborted) {
      await onStatusChange(task.id, "cancelled", "Task cancelled.");
      return "Task was cancelled.";
    }
    const errMsg = `Task failed: ${error.message}`;
    console.error(`Task ${task.id} error:`, error);
    await onStatusChange(task.id, "failed", undefined, errMsg);
    throw error;
  }
}

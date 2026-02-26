/**
 * Task System — Types
 *
 * Core interfaces for background task execution.
 */

import type Anthropic from "@anthropic-ai/sdk";

export type TaskStatus =
  | "pending"
  | "queued"
  | "running"
  | "waiting_user"
  | "completed"
  | "failed"
  | "cancelled";

export interface Task {
  id: string;
  status: TaskStatus;
  description: string;
  result?: string;
  error?: string;
  userId?: string;
  priority: number;
  iterationCount: number;
  maxIterations: number;
  tokenUsage: { input: number; output: number };
  systemPrompt?: string;
  conversationHistory?: Anthropic.Messages.MessageParam[];
  pendingQuestion?: string;
  pendingQuestionId?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskTool {
  definition: Anthropic.Messages.Tool;
  execute: (input: Record<string, unknown>) => Promise<string>;
}

export interface TaskRunnerOptions {
  task: Task;
  tools: TaskTool[];
  systemPrompt: string;
  sendMessage: (text: string) => Promise<void>;
  /** Optional: resume from saved conversation history */
  resumeHistory?: Anthropic.Messages.MessageParam[];
  /** Optional: abort signal for cancellation */
  signal?: AbortSignal;
  onStatusChange: (
    taskId: string,
    status: TaskStatus,
    result?: string,
    error?: string
  ) => Promise<void>;
  onIteration: (
    taskId: string,
    iteration: number,
    tokenUsage: { input: number; output: number },
    iterationDetail?: {
      toolName?: string;
      thoughtText?: string;
      toolCalls?: { name: string; inputPreview: string }[];
    }
  ) => Promise<void>;
  /** Save conversation state for resumability */
  onSaveState?: (
    taskId: string,
    messages: Anthropic.Messages.MessageParam[]
  ) => Promise<void>;
  /** Returns any pending injected messages and clears them */
  getInjectedMessages?: () => string[];
  anthropicConfig: { apiKey: string; model: string; maxTokens: number };
}

/**
 * Tool System — Core Types
 *
 * Shared interfaces for the chat tool registry, approval flow, and MCP integration.
 */

import type Anthropic from "@anthropic-ai/sdk";

/** Where a tool can be used */
export type ToolScope = "chat" | "background" | "both";

/** Whether the tool needs human approval before executing */
export type ApprovalPolicy = "never" | "always" | "destructive";

/**
 * A tool that can be registered in the ToolRegistry and used in
 * the chat loop, background tasks, or both.
 */
export interface ChatTool {
  /** Anthropic tool definition passed to the API */
  definition: Anthropic.Messages.Tool;

  /** Execute the tool. Returns a string result for the model. */
  execute: (input: Record<string, unknown>) => Promise<string>;

  /** Where this tool can be used */
  scope: ToolScope;

  /** Whether this tool needs human approval */
  approval: ApprovalPolicy;

  /** Human-readable category for grouping */
  category: string;

  /**
   * For "destructive" approval policy: determines per-call whether
   * this invocation needs approval. Returns a description of the action,
   * or null if no approval needed.
   */
  describeAction?: (input: Record<string, unknown>) => string | null;
}

/** A pending approval request */
export interface ApprovalRequest {
  id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  description: string;
  resolve: (approved: boolean) => void;
  createdAt: number;
  timeoutMs: number;
}

/** Callback type for requesting approval from the user */
export type ApprovalCallback = (
  toolName: string,
  input: Record<string, unknown>,
  description: string
) => Promise<boolean>;

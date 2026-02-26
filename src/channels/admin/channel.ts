/**
 * Admin UI Channel Adapter
 *
 * Wraps the WebSocket broadcast function to implement the Channel interface.
 * Messages are pushed to all connected Admin UI clients via WebSocket.
 */

import type { Channel } from "../types.ts";

export class AdminChannel implements Channel {
  readonly id = "admin";
  readonly name = "Admin UI";

  private broadcastFn: ((topic: string, data: unknown) => void) | null = null;

  setBroadcast(fn: (topic: string, data: unknown) => void): void {
    this.broadcastFn = fn;
  }

  async sendMessage(text: string): Promise<void> {
    this.broadcastFn?.("messages", {
      type: "message",
      role: "assistant",
      content: text,
      timestamp: new Date().toISOString(),
    });
  }

  async sendTaskUpdate(taskId: string, status: string, detail?: string): Promise<void> {
    this.broadcastFn?.("tasks", {
      type: "task:status",
      taskId,
      status,
      result: detail ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  async askUser(_taskId: string, _question: string): Promise<string> {
    // Handled by the pending_question DB field flow
    throw new Error("Admin askUser is handled via pending_question DB field");
  }

  isConnected(): boolean {
    return this.broadcastFn !== null;
  }
}

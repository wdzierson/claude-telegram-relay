/**
 * Approval Manager
 *
 * Manages human-in-the-loop approval for sensitive tool calls.
 * Uses a Promise-based pending map: when a tool needs approval, a Promise
 * is created and awaited. The Telegram callback_query handler resolves it
 * when the user presses Approve or Reject.
 */

import type { ApprovalRequest } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 60_000; // 1 minute to approve

export class ApprovalManager {
  private pending = new Map<string, ApprovalRequest>();

  /**
   * Create an approval request. Returns an ID and a Promise that resolves
   * when the user presses Approve (true) or Reject (false).
   * Auto-rejects after timeout.
   */
  request(
    toolName: string,
    toolInput: Record<string, unknown>,
    description: string
  ): { id: string; promise: Promise<boolean> } {
    const id = crypto.randomUUID();

    const promise = new Promise<boolean>((resolve) => {
      const request: ApprovalRequest = {
        id,
        toolName,
        toolInput,
        description,
        resolve,
        createdAt: Date.now(),
        timeoutMs: DEFAULT_TIMEOUT_MS,
      };

      this.pending.set(id, request);

      // Auto-reject after timeout
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve(false);
        }
      }, DEFAULT_TIMEOUT_MS);
    });

    return { id, promise };
  }

  /**
   * Called by Telegram callback_query handler when user presses a button.
   * Returns true if the approval was found and handled.
   */
  handleResponse(approvalId: string, approved: boolean): boolean {
    const request = this.pending.get(approvalId);
    if (!request) return false;

    this.pending.delete(approvalId);
    request.resolve(approved);
    return true;
  }

  /** Get a pending request (for display purposes) */
  getPending(id: string): ApprovalRequest | undefined {
    return this.pending.get(id);
  }
}

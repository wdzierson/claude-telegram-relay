/**
 * Task System — Durable Task Queue
 *
 * Supabase-backed queue with bounded concurrency, heartbeat,
 * crash recovery, and task resume support.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import type { Task, TaskStatus, TaskTool } from "./types.ts";
import type { Logger } from "../../utils/logger.ts";
import { runTask } from "./runner.ts";

export interface TaskQueueConfig {
  maxConcurrent: number;       // Default: 2
  pollIntervalMs: number;      // Default: 5000 (5s)
  heartbeatIntervalMs: number; // Default: 30000 (30s)
}

export interface TaskQueueDeps {
  supabaseClient: SupabaseClient;
  buildTools: (taskId: string, userId?: string) => TaskTool[];
  buildSystemPrompt: (description: string) => string;
  sendMessage: (text: string) => Promise<void>;
  saveMessage: (role: string, content: string, metadata?: Record<string, unknown>) => Promise<void>;
  anthropicConfig: { apiKey: string; model: string; maxTokens: number };
  logger?: Logger;
  broadcast?: (topic: string, data: unknown) => void;
}

interface RunningTask {
  id: string;
  abortController: AbortController;
}

export class TaskQueue {
  private config: TaskQueueConfig;
  private deps: TaskQueueDeps;
  private running = new Map<string, RunningTask>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private log: Logger;

  constructor(config: TaskQueueConfig, deps: TaskQueueDeps) {
    this.config = config;
    this.deps = deps;
    this.log = deps.logger || { info() {}, warn() {}, error() {} };
  }

  /**
   * Start the queue: recover stuck tasks, begin polling and heartbeat.
   */
  async start(): Promise<void> {
    await this.recoverTasks();

    this.pollTimer = setInterval(() => this.tick(), this.config.pollIntervalMs);
    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeats(),
      this.config.heartbeatIntervalMs
    );

    this.log.info("queue", "started", {
      maxConcurrent: this.config.maxConcurrent,
      pollIntervalMs: this.config.pollIntervalMs,
    });
  }

  /**
   * Stop the queue. Running tasks continue to completion.
   */
  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.pollTimer = null;
    this.heartbeatTimer = null;
    this.log.info("queue", "stopped");
  }

  /**
   * Enqueue a task by setting its status to 'queued'.
   */
  async enqueue(taskId: string): Promise<void> {
    await this.deps.supabaseClient
      .from("tasks")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .eq("id", taskId);

    // Try to start it immediately if there's capacity
    await this.tick();
  }

  /**
   * Cancel a running or queued task.
   */
  async cancel(taskId: string): Promise<boolean> {
    const running = this.running.get(taskId);
    if (running) {
      running.abortController.abort();
      this.running.delete(taskId);
    }

    const { error } = await this.deps.supabaseClient
      .from("tasks")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    return !error;
  }

  /**
   * Set the broadcast function (injected after server starts).
   */
  setBroadcast(fn: (topic: string, data: unknown) => void): void {
    this.deps.broadcast = fn;
  }

  get activeCount(): number {
    return this.running.size;
  }

  async queuedCount(): Promise<number> {
    const { count } = await this.deps.supabaseClient
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "queued");
    return count || 0;
  }

  async waitingUserCount(): Promise<number> {
    const { count } = await this.deps.supabaseClient
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "waiting_user");
    return count || 0;
  }

  // --- Internal ---

  private async tick(): Promise<void> {
    const baseMax = this.config.maxConcurrent;

    // Subtask-aware concurrency: allow extra slots for subtasks whose parent is running.
    // This prevents deadlock when a parent task spawns subtasks and waits for them.
    let effectiveMax = baseMax;
    if (this.running.size >= baseMax) {
      // Check if any queued tasks are subtasks of currently running tasks
      const runningIds = Array.from(this.running.keys());
      const { count } = await this.deps.supabaseClient
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("status", "queued")
        .in("parent_task_id", runningIds);

      if (count && count > 0) {
        // Allow up to 2 extra slots for subtasks
        effectiveMax = baseMax + Math.min(count, 2);
      }
    }

    if (this.running.size >= effectiveMax) return;

    const slotsAvailable = effectiveMax - this.running.size;

    const { data: queued } = await this.deps.supabaseClient
      .from("tasks")
      .select("*")
      .eq("status", "queued")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(slotsAvailable);

    if (!queued || queued.length === 0) return;

    for (const row of queued) {
      if (this.running.size >= effectiveMax) break;

      // Dependency check: skip tasks whose prerequisites haven't completed
      const deps = (row.metadata as Record<string, unknown>)?.depends_on as string[] | undefined;
      if (deps && deps.length > 0) {
        const { count } = await this.deps.supabaseClient
          .from("tasks")
          .select("*", { count: "exact", head: true })
          .in("id", deps)
          .eq("status", "completed");
        if (count !== deps.length) continue;
      }

      // Inject dependency results into description for downstream tasks
      if (deps && deps.length > 0) {
        const { data: depResults } = await this.deps.supabaseClient
          .from("tasks")
          .select("description, result")
          .in("id", deps)
          .eq("status", "completed");

        if (depResults && depResults.length > 0) {
          const context = depResults
            .map((d: any) =>
              `[Result from: ${d.description.substring(0, 80)}]\n${(d.result || "").substring(0, 3000)}`
            )
            .join("\n\n---\n\n");
          row.description = `${row.description}\n\n## Context from prerequisite tasks:\n${context}`;
        }
      }

      this.startTask(row);
    }
  }

  private startTask(row: any): void {
    const abortController = new AbortController();
    const taskId = row.id;

    this.running.set(taskId, { id: taskId, abortController });

    // Resolve agent type model override from metadata
    const meta = row.metadata as Record<string, unknown> | undefined;
    const agentModel = meta?.agent_model as string | undefined;

    const task: Task = {
      id: row.id,
      status: "queued",
      description: row.description,
      userId: row.user_id,
      priority: row.priority || 0,
      iterationCount: row.iteration_count || 0,
      maxIterations: row.max_iterations || 25,
      tokenUsage: row.token_usage || { input: 0, output: 0 },
      systemPrompt: row.system_prompt,
      conversationHistory: row.conversation_history,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    const systemPrompt = row.system_prompt || this.deps.buildSystemPrompt(row.description);
    const tools = this.deps.buildTools(taskId, row.user_id);

    // Resume from saved conversation if available
    const resumeHistory: Anthropic.Messages.MessageParam[] | undefined =
      row.conversation_history && row.conversation_history.length > 0
        ? row.conversation_history
        : undefined;

    const run = async () => {
      try {
        this.log.info("queue", "task_starting", { taskId, description: row.description.substring(0, 80) });

        const result = await runTask({
          task,
          tools,
          systemPrompt,
          resumeHistory,
          signal: abortController.signal,
          sendMessage: this.deps.sendMessage,
          anthropicConfig: agentModel
            ? { ...this.deps.anthropicConfig, model: agentModel }
            : this.deps.anthropicConfig,
          onStatusChange: async (id, status, result, error) => {
            this.log.info("queue", "task_status_change", { taskId: id, status });
            const update: Record<string, unknown> = {
              status,
              result: result || null,
              error: error || null,
              updated_at: new Date().toISOString(),
            };
            if (status === "running") {
              update.started_at = new Date().toISOString();
            }
            if (status === "completed" || status === "failed") {
              update.completed_at = new Date().toISOString();
            }
            await this.deps.supabaseClient.from("tasks").update(update).eq("id", id);
            this.deps.broadcast?.("tasks", {
              type: "task:status",
              taskId: id,
              status,
              result: result ? result.substring(0, 500) : null,
              error: error || null,
              timestamp: new Date().toISOString(),
            });
          },
          onIteration: async (id, iteration, tokenUsage, detail) => {
            await this.deps.supabaseClient
              .from("tasks")
              .update({
                iteration_count: iteration,
                token_usage: tokenUsage,
                updated_at: new Date().toISOString(),
              })
              .eq("id", id);
            this.deps.broadcast?.("tasks", {
              type: "task:iteration",
              taskId: id,
              iteration,
              tokenUsage,
              toolName: detail?.toolName,
              thoughtText: detail?.thoughtText,
              toolCalls: detail?.toolCalls,
              timestamp: new Date().toISOString(),
            });
          },
          onSaveState: async (id, messages) => {
            await this.deps.supabaseClient
              .from("tasks")
              .update({
                conversation_history: messages,
                system_prompt: systemPrompt,
                updated_at: new Date().toISOString(),
              })
              .eq("id", id);
          },
        });

        this.log.info("queue", "task_completed", { taskId, resultLength: result.length });

        // Check for chain continuation — auto-create next step if this task is part of a chain
        const chainContinued = await this.continueChain(taskId, row, result);

        if (!chainContinued) {
          // Only send "Task complete" if this is the final step (or not a chain)
          await this.deps.sendMessage(`Task complete:\n\n${result}`).catch(() => {});
        }
        // Save task result to messages table so it's available for chat context
        await this.deps.saveMessage("assistant", result, {
          source: "task",
          taskId,
          taskDescription: row.description,
        }).catch(() => {});
      } catch (err: any) {
        if (!abortController.signal.aborted) {
          this.log.error("queue", "task_failed", { taskId, error: err.message });
          await this.deps.sendMessage(`Task failed: ${err.message}`).catch(() => {});
          await this.deps.saveMessage("assistant", `Task failed: ${err.message}`, {
            source: "task",
            taskId,
            taskDescription: row.description,
          }).catch(() => {});
        }
      } finally {
        this.running.delete(taskId);
      }
    };

    // Fire and forget — the queue manages lifecycle
    run();
  }

  /**
   * Check if a completed task is part of a chain and start the next step.
   * Returns true if a chain continuation was created.
   */
  private async continueChain(
    taskId: string,
    row: any,
    result: string
  ): Promise<boolean> {
    // Re-read metadata from DB (it may have been set after the row was first loaded)
    const { data: taskRow } = await this.deps.supabaseClient
      .from("tasks")
      .select("metadata, user_id")
      .eq("id", taskId)
      .single();

    const meta = taskRow?.metadata as Record<string, unknown> | undefined;
    if (!meta?.chain_steps || !Array.isArray(meta.chain_steps) || meta.chain_steps.length === 0) {
      return false;
    }

    const remainingSteps = meta.chain_steps as string[];
    const nextStep = remainingSteps[0];
    const stepIndex = ((meta.chain_step_index as number) || 0) + 1;
    const chainTotal = (meta.chain_total as number) || stepIndex + remainingSteps.length;

    // Build description for next step with context from previous result
    const contextPreview = result.substring(0, 3000);
    const nextDescription =
      `${nextStep}\n\n` +
      `[Context from step ${stepIndex} of ${chainTotal}:\n${contextPreview}]`;

    const nextSystemPrompt = this.deps.buildSystemPrompt(nextDescription);

    const { data: nextTask } = await this.deps.supabaseClient
      .from("tasks")
      .insert({
        description: nextDescription,
        status: "queued",
        user_id: taskRow?.user_id,
        system_prompt: nextSystemPrompt,
        priority: 1, // Slightly higher priority for chain continuations
        metadata: {
          chain_steps: remainingSteps.slice(1),
          chain_step_index: stepIndex,
          chain_total: chainTotal,
          chain_parent_id: taskId,
        },
      })
      .select()
      .single();

    if (nextTask) {
      await this.enqueue(nextTask.id);
      await this.deps.sendMessage(
        `Chain step ${stepIndex + 1}/${chainTotal} starting: ${nextStep.substring(0, 100)}`
      ).catch(() => {});
      this.log.info("queue", "chain_continuation", {
        parentTaskId: taskId,
        nextTaskId: nextTask.id,
        step: stepIndex + 1,
        total: chainTotal,
      });
      return true;
    }

    return false;
  }

  private async sendHeartbeats(): Promise<void> {
    const ids = Array.from(this.running.keys());
    if (ids.length === 0) return;

    const now = new Date().toISOString();
    for (const id of ids) {
      await this.deps.supabaseClient
        .from("tasks")
        .update({ last_heartbeat: now })
        .eq("id", id);
    }
  }

  private async recoverTasks(): Promise<void> {
    // 1. Find tasks stuck in 'running' (orphaned by crash)
    const { data: running } = await this.deps.supabaseClient
      .from("tasks")
      .select("*")
      .eq("status", "running");

    for (const row of running || []) {
      if (row.conversation_history && row.conversation_history.length > 0) {
        // Has saved state — re-queue for resume
        await this.deps.supabaseClient
          .from("tasks")
          .update({ status: "queued", updated_at: new Date().toISOString() })
          .eq("id", row.id);
        this.log.info("queue", "task_requeued_for_resume", { taskId: row.id });
      } else {
        // No saved state — mark interrupted
        await this.deps.supabaseClient
          .from("tasks")
          .update({
            status: "failed",
            error: "Bot restarted while task was running. No saved state to resume.",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        await this.deps.sendMessage(
          `Task interrupted by restart: ${row.description.substring(0, 80)}...`
        );
        this.log.warn("queue", "task_interrupted_no_state", { taskId: row.id });
      }
    }

    // 2. Find tasks stuck in 'waiting_user' — re-queue them
    const { data: waiting } = await this.deps.supabaseClient
      .from("tasks")
      .select("*")
      .eq("status", "waiting_user");

    for (const row of waiting || []) {
      if (row.pending_question) {
        await this.deps.sendMessage(
          `(Resuming after restart) A task needs your input:\n\n${row.pending_question}`
        );
      }
      await this.deps.supabaseClient
        .from("tasks")
        .update({ status: "queued", updated_at: new Date().toISOString() })
        .eq("id", row.id);
      this.log.info("queue", "task_requeued_waiting", { taskId: row.id });
    }

    // 3. Check for any tasks stuck in 'pending' (old status — migrate to queued)
    await this.deps.supabaseClient
      .from("tasks")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .eq("status", "pending");
  }
}

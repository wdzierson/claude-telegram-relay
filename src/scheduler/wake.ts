/**
 * Heartbeat Wake — Deterministic Pre-checks
 *
 * Runs cheap checks before invoking the LLM. Returns a decision
 * with signals explaining *why* the heartbeat should wake.
 * If no signals, the LLM call is skipped entirely.
 */

import type { HeartbeatState, StateSnapshot } from "./state.ts";

// ============================================================
// Types
// ============================================================

export type WakeSignalType =
  | "user_inactive"
  | "task_completed"
  | "goal_deadline"
  | "state_changed";

export interface WakeSignal {
  type: WakeSignalType;
  detail: string;
  /** 0 = low, 1 = medium, 2 = high */
  priority: number;
}

export interface WakeDecision {
  shouldWake: boolean;
  signals: WakeSignal[];
  /** Why we decided not to wake (for logging) */
  skipReason?: string;
}

export interface WakeConfig {
  /** Minimum ms between check-in messages (default: 2 hours) */
  minIntervalMs: number;
  /** Maximum check-in messages per day (default: 3) */
  maxPerDay: number;
  /** Warn about goal deadlines within this many hours (default: 24) */
  deadlineWarningHours: number;
  /** Consider user inactive after this many hours (default: 4) */
  inactivityThresholdHours: number;
}

/** Goal info with raw deadline for programmatic comparison */
export interface GoalInfo {
  id: string;
  content: string;
  /** Raw ISO date string from Supabase, or undefined */
  deadlineRaw?: string;
}

export const DEFAULT_WAKE_CONFIG: WakeConfig = {
  minIntervalMs: 2 * 60 * 60 * 1000,     // 2 hours
  maxPerDay: 3,
  deadlineWarningHours: 24,
  inactivityThresholdHours: 4,
};

// ============================================================
// Main Wake Check
// ============================================================

/**
 * Determine whether the heartbeat should proceed to a full LLM check-in.
 *
 * Runs deterministic checks in order — guards first (hard stops),
 * then signal detection. Returns shouldWake: true only if at least
 * one signal is found.
 */
export function shouldWake(
  state: HeartbeatState,
  snapshot: StateSnapshot,
  goals: GoalInfo[],
  config: WakeConfig
): WakeDecision {
  const signals: WakeSignal[] = [];
  const now = Date.now();

  // ── Guard 1: Time since last check-in ──
  if (state.lastCheckinAt) {
    const elapsed = now - new Date(state.lastCheckinAt).getTime();
    if (elapsed < config.minIntervalMs) {
      return {
        shouldWake: false,
        signals: [],
        skipReason: `Only ${Math.round(elapsed / 60000)}min since last check-in`,
      };
    }
  }

  // ── Guard 2: Daily limit ──
  if (state.checkinsSentToday >= config.maxPerDay) {
    return {
      shouldWake: false,
      signals: [],
      skipReason: `Daily limit reached (${state.checkinsSentToday}/${config.maxPerDay})`,
    };
  }

  // ── Signal: User inactivity ──
  if (snapshot.lastUserMessageAt) {
    const hoursSinceMessage =
      (now - new Date(snapshot.lastUserMessageAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceMessage >= config.inactivityThresholdHours) {
      signals.push({
        type: "user_inactive",
        detail: `No messages for ${hoursSinceMessage.toFixed(1)} hours`,
        priority: 0,
      });
    }
  }

  // ── Signal: New completed tasks ──
  const newCompletedTasks = snapshot.completedTaskIds.filter(
    (id) => !state.alertedTaskIds.includes(id)
  );
  if (newCompletedTasks.length > 0) {
    signals.push({
      type: "task_completed",
      detail: `${newCompletedTasks.length} new task(s) completed`,
      priority: 1,
    });
  }

  // ── Signal: Approaching goal deadlines ──
  const warningMs = config.deadlineWarningHours * 60 * 60 * 1000;
  for (const goal of goals) {
    if (!goal.deadlineRaw || state.alertedGoalIds.includes(goal.id)) continue;

    const deadlineMs = new Date(goal.deadlineRaw).getTime();
    const timeUntil = deadlineMs - now;

    if (timeUntil > 0 && timeUntil <= warningMs) {
      const hoursUntil = Math.round(timeUntil / (1000 * 60 * 60));
      signals.push({
        type: "goal_deadline",
        detail: `"${goal.content}" deadline in ~${hoursUntil}h`,
        priority: 2,
      });
    }
  }

  // ── Signal: General state change ──
  const stateChanged =
    snapshot.activeGoalCount !== state.lastKnownState.activeGoalCount ||
    snapshot.activeTaskCount !== state.lastKnownState.activeTaskCount;

  if (stateChanged) {
    signals.push({
      type: "state_changed",
      detail: `Goals: ${state.lastKnownState.activeGoalCount}→${snapshot.activeGoalCount}, Tasks: ${state.lastKnownState.activeTaskCount}→${snapshot.activeTaskCount}`,
      priority: 0,
    });
  }

  // ── Decision ──
  if (signals.length === 0) {
    return {
      shouldWake: false,
      signals: [],
      skipReason: "No signals detected",
    };
  }

  // Sort by priority descending
  signals.sort((a, b) => b.priority - a.priority);

  return { shouldWake: true, signals };
}

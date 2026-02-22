/**
 * Heartbeat State — Persistence Between Cycles
 *
 * Tracks what the heartbeat has already discussed, dedup sets for goals/tasks,
 * and a state snapshot for change detection. Persisted as JSON on the local
 * filesystem (not Supabase — this is operational metadata, not user data).
 */

import { readFile, writeFile, rename } from "fs/promises";
import { join } from "path";

// ============================================================
// Types
// ============================================================

export interface HeartbeatState {
  /** ISO timestamp of last check-in message sent */
  lastCheckinAt: string | null;
  /** ISO timestamp of last morning briefing sent */
  lastBriefingAt: string | null;
  /** ISO timestamp of last wake evaluation (including skips) */
  lastWakeCheckAt: string | null;

  /** Number of check-in messages sent today (reset on new day) */
  checkinsSentToday: number;
  /** Short topic labels of messages sent today */
  topicsDiscussedToday: string[];

  /** Goal IDs already alerted this cycle (prevents duplicate deadline alerts) */
  alertedGoalIds: string[];
  /** Completed task IDs already mentioned (prevents duplicate completion alerts) */
  alertedTaskIds: string[];

  /** Pending follow-ups from previous check-ins (Phase 3) */
  pendingFollowUps: FollowUp[];

  /** Snapshot of last known state for change detection */
  lastKnownState: StateSnapshot;

  /** Date string (YYYY-MM-DD) for daily counter resets */
  currentDay: string;
}

export interface StateSnapshot {
  activeGoalCount: number;
  activeTaskCount: number;
  lastUserMessageAt: string | null;
  completedTaskIds: string[];
}

export interface FollowUp {
  id: string;
  topic: string;
  mentionedAt: string;
  expectedAction?: string;
  resolvedAt?: string | null;
  retryCount: number;
}

// ============================================================
// Default State
// ============================================================

export function defaultState(): HeartbeatState {
  return {
    lastCheckinAt: null,
    lastBriefingAt: null,
    lastWakeCheckAt: null,
    checkinsSentToday: 0,
    topicsDiscussedToday: [],
    alertedGoalIds: [],
    alertedTaskIds: [],
    pendingFollowUps: [],
    lastKnownState: {
      activeGoalCount: 0,
      activeTaskCount: 0,
      lastUserMessageAt: null,
      completedTaskIds: [],
    },
    currentDay: "",
  };
}

// ============================================================
// Persistence (JSON file)
// ============================================================

const STATE_FILENAME = "heartbeat-state.json";

export async function loadState(relayDir: string): Promise<HeartbeatState> {
  try {
    const raw = await readFile(join(relayDir, STATE_FILENAME), "utf-8");
    const parsed = JSON.parse(raw);
    // Merge with defaults to handle schema evolution
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

export async function saveState(relayDir: string, state: HeartbeatState): Promise<void> {
  const filePath = join(relayDir, STATE_FILENAME);
  const tmpPath = filePath + ".tmp";
  try {
    await writeFile(tmpPath, JSON.stringify(state, null, 2));
    await rename(tmpPath, filePath);
  } catch {
    // Best-effort — state loss is acceptable (next cycle rebuilds)
  }
}

// ============================================================
// Daily Reset
// ============================================================

/**
 * Resets daily counters if the day has changed.
 * Call at the start of each cycle.
 */
export function resetDailyCounters(state: HeartbeatState, timezone: string): HeartbeatState {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD
  if (state.currentDay === today) return state;

  return {
    ...state,
    currentDay: today,
    checkinsSentToday: 0,
    topicsDiscussedToday: [],
    alertedGoalIds: [],
    alertedTaskIds: [],
    // Keep follow-ups across days (Phase 3)
  };
}

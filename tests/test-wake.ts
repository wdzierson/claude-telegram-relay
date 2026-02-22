/**
 * Unit tests for shouldWake() — the deterministic heartbeat pre-check.
 *
 * Run: bun run tests/test-wake.ts
 */

import { shouldWake, DEFAULT_WAKE_CONFIG } from "../src/scheduler/wake.ts";
import type { WakeConfig, GoalInfo } from "../src/scheduler/wake.ts";
import { defaultState } from "../src/scheduler/state.ts";
import type { HeartbeatState, StateSnapshot } from "../src/scheduler/state.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ── Helpers ──

function freshState(overrides: Partial<HeartbeatState> = {}): HeartbeatState {
  return { ...defaultState(), currentDay: "2026-02-20", ...overrides };
}

function freshSnapshot(overrides: Partial<StateSnapshot> = {}): StateSnapshot {
  return {
    activeGoalCount: 2,
    activeTaskCount: 1,
    lastUserMessageAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5h ago
    completedTaskIds: [],
    ...overrides,
  };
}

const config = DEFAULT_WAKE_CONFIG;
const noGoals: GoalInfo[] = [];

// ============================================================
console.log("\n── Guard: Time since last check-in ──");
// ============================================================

test("Skips if last check-in was < 2 hours ago", () => {
  const state = freshState({
    lastCheckinAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
  });
  const result = shouldWake(state, freshSnapshot(), noGoals, config);
  assert(!result.shouldWake, "Expected shouldWake=false");
  assert(result.skipReason!.includes("since last check-in"), `Unexpected reason: ${result.skipReason}`);
});

test("Proceeds if last check-in was > 2 hours ago", () => {
  const state = freshState({
    lastCheckinAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3h ago
  });
  const result = shouldWake(state, freshSnapshot(), noGoals, config);
  // Should at least pass the time guard (may still skip for other reasons)
  assert(
    result.shouldWake || !result.skipReason!.includes("since last check-in"),
    "Should have passed the time guard"
  );
});

test("Proceeds if no previous check-in exists", () => {
  const state = freshState({ lastCheckinAt: null });
  const result = shouldWake(state, freshSnapshot(), noGoals, config);
  assert(
    result.shouldWake || !result.skipReason!.includes("since last check-in"),
    "Should pass time guard with no previous check-in"
  );
});

// ============================================================
console.log("\n── Guard: Daily limit ──");
// ============================================================

test("Skips if daily limit reached", () => {
  const state = freshState({
    lastCheckinAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    checkinsSentToday: 3,
  });
  const result = shouldWake(state, freshSnapshot(), noGoals, config);
  assert(!result.shouldWake, "Expected shouldWake=false");
  assert(result.skipReason!.includes("Daily limit"), `Unexpected reason: ${result.skipReason}`);
});

test("Proceeds if under daily limit", () => {
  const state = freshState({
    lastCheckinAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    checkinsSentToday: 1,
  });
  const result = shouldWake(state, freshSnapshot(), noGoals, config);
  assert(
    result.shouldWake || !result.skipReason!.includes("Daily limit"),
    "Should pass daily limit check"
  );
});

// ============================================================
console.log("\n── Signal: User inactivity ──");
// ============================================================

test("Signals user inactivity after 4+ hours", () => {
  const state = freshState({ lastCheckinAt: null });
  const snapshot = freshSnapshot({
    lastUserMessageAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  });
  const result = shouldWake(state, snapshot, noGoals, config);
  assert(result.shouldWake, "Expected shouldWake=true for 5h inactivity");
  assert(
    result.signals.some((s) => s.type === "user_inactive"),
    "Expected user_inactive signal"
  );
});

test("No inactivity signal if user messaged 1 hour ago", () => {
  const state = freshState({ lastCheckinAt: null });
  const snapshot = freshSnapshot({
    lastUserMessageAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  });
  const result = shouldWake(state, snapshot, noGoals, config);
  assert(
    !result.signals.some((s) => s.type === "user_inactive"),
    "Should NOT have user_inactive signal"
  );
});

// ============================================================
console.log("\n── Signal: New completed tasks ──");
// ============================================================

test("Signals new completed tasks", () => {
  const state = freshState({
    lastCheckinAt: null,
    alertedTaskIds: ["old-task"],
  });
  const snapshot = freshSnapshot({
    completedTaskIds: ["old-task", "new-task-1", "new-task-2"],
    lastUserMessageAt: new Date().toISOString(), // recent activity (no inactivity signal)
  });
  // Need to also set lastKnownState to match so state_changed doesn't fire
  state.lastKnownState = { ...snapshot };

  const result = shouldWake(state, snapshot, noGoals, config);
  assert(result.shouldWake, "Expected shouldWake=true for new tasks");
  assert(
    result.signals.some((s) => s.type === "task_completed"),
    "Expected task_completed signal"
  );
  assert(
    result.signals.find((s) => s.type === "task_completed")!.detail.includes("2"),
    "Should mention 2 new tasks"
  );
});

test("No task signal if all tasks already alerted", () => {
  const state = freshState({
    lastCheckinAt: null,
    alertedTaskIds: ["task-1", "task-2"],
  });
  const snapshot = freshSnapshot({
    completedTaskIds: ["task-1", "task-2"],
    lastUserMessageAt: new Date().toISOString(),
  });
  state.lastKnownState = { ...snapshot };

  const result = shouldWake(state, snapshot, noGoals, config);
  assert(
    !result.signals.some((s) => s.type === "task_completed"),
    "Should NOT have task_completed signal"
  );
});

// ============================================================
console.log("\n── Signal: Goal deadlines ──");
// ============================================================

test("Signals approaching goal deadline", () => {
  const state = freshState({ lastCheckinAt: null });
  const snapshot = freshSnapshot({ lastUserMessageAt: new Date().toISOString() });
  state.lastKnownState = { ...snapshot };

  const goals: GoalInfo[] = [
    {
      id: "goal-1",
      content: "Ship feature X",
      deadlineRaw: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12h from now
    },
  ];

  const result = shouldWake(state, snapshot, goals, config);
  assert(result.shouldWake, "Expected shouldWake=true for approaching deadline");
  assert(
    result.signals.some((s) => s.type === "goal_deadline"),
    "Expected goal_deadline signal"
  );
});

test("No deadline signal for far-future goal", () => {
  const state = freshState({ lastCheckinAt: null });
  const snapshot = freshSnapshot({ lastUserMessageAt: new Date().toISOString() });
  state.lastKnownState = { ...snapshot };

  const goals: GoalInfo[] = [
    {
      id: "goal-1",
      content: "Ship feature X",
      deadlineRaw: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    },
  ];

  const result = shouldWake(state, snapshot, goals, config);
  assert(
    !result.signals.some((s) => s.type === "goal_deadline"),
    "Should NOT have goal_deadline signal for 7-day deadline"
  );
});

test("No deadline signal for already-alerted goal", () => {
  const state = freshState({
    lastCheckinAt: null,
    alertedGoalIds: ["goal-1"],
  });
  const snapshot = freshSnapshot({ lastUserMessageAt: new Date().toISOString() });
  state.lastKnownState = { ...snapshot };

  const goals: GoalInfo[] = [
    {
      id: "goal-1",
      content: "Ship feature X",
      deadlineRaw: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    },
  ];

  const result = shouldWake(state, snapshot, goals, config);
  assert(
    !result.signals.some((s) => s.type === "goal_deadline"),
    "Should NOT signal already-alerted goal"
  );
});

// ============================================================
console.log("\n── Signal: State change ──");
// ============================================================

test("Signals state change (goal count changed)", () => {
  const state = freshState({
    lastCheckinAt: null,
    lastKnownState: {
      activeGoalCount: 2,
      activeTaskCount: 1,
      lastUserMessageAt: new Date().toISOString(),
      completedTaskIds: [],
    },
  });
  const snapshot = freshSnapshot({
    activeGoalCount: 3, // changed
    activeTaskCount: 1,
    lastUserMessageAt: new Date().toISOString(),
    completedTaskIds: [],
  });

  const result = shouldWake(state, snapshot, noGoals, config);
  assert(
    result.signals.some((s) => s.type === "state_changed"),
    "Expected state_changed signal"
  );
});

test("No state change signal if counts match", () => {
  const state = freshState({
    lastCheckinAt: null,
    lastKnownState: {
      activeGoalCount: 2,
      activeTaskCount: 1,
      lastUserMessageAt: new Date().toISOString(),
      completedTaskIds: [],
    },
  });
  const snapshot = freshSnapshot({
    activeGoalCount: 2,
    activeTaskCount: 1,
    lastUserMessageAt: new Date().toISOString(),
    completedTaskIds: [],
  });

  const result = shouldWake(state, snapshot, noGoals, config);
  assert(
    !result.signals.some((s) => s.type === "state_changed"),
    "Should NOT have state_changed signal"
  );
});

// ============================================================
console.log("\n── Combined: No signals ──");
// ============================================================

test("Skips when nothing has changed", () => {
  const state = freshState({
    lastCheckinAt: null,
    lastKnownState: {
      activeGoalCount: 2,
      activeTaskCount: 1,
      lastUserMessageAt: new Date().toISOString(),
      completedTaskIds: [],
    },
  });
  const snapshot = freshSnapshot({
    activeGoalCount: 2,
    activeTaskCount: 1,
    lastUserMessageAt: new Date().toISOString(), // active (no inactivity)
    completedTaskIds: [],
  });

  const result = shouldWake(state, snapshot, noGoals, config);
  assert(!result.shouldWake, "Expected shouldWake=false when nothing changed");
  assert(result.skipReason === "No signals detected", `Unexpected reason: ${result.skipReason}`);
});

// ============================================================
console.log("\n── Signal priority ──");
// ============================================================

test("Signals sorted by priority (high first)", () => {
  const state = freshState({ lastCheckinAt: null });
  const snapshot = freshSnapshot({
    activeGoalCount: 3, // state change (priority 0)
    lastUserMessageAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // inactive (priority 0)
    completedTaskIds: ["new-task"], // task completed (priority 1)
  });
  state.lastKnownState = {
    activeGoalCount: 2,
    activeTaskCount: 1,
    lastUserMessageAt: null,
    completedTaskIds: [],
  };

  const goals: GoalInfo[] = [
    {
      id: "g1",
      content: "Deadline soon",
      deadlineRaw: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // priority 2
    },
  ];

  const result = shouldWake(state, snapshot, goals, config);
  assert(result.shouldWake, "Expected shouldWake=true with multiple signals");
  assert(result.signals.length >= 3, `Expected 3+ signals, got ${result.signals.length}`);
  assert(
    result.signals[0].priority >= result.signals[result.signals.length - 1].priority,
    "Signals should be sorted by priority descending"
  );
});

// ── Summary ──
console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);

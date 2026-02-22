/**
 * Scheduler Module — Public API
 *
 * Re-exports for use by other modules or tests.
 * The actual entry points are checkin.ts and briefing.ts (run as standalone scripts).
 */

export { createSchedulerContext, type SchedulerContext } from "./context.ts";
export {
  fetchWeather,
  fetchNews,
  fetchGoals,
  fetchGoalsRaw,
  fetchFacts,
  fetchActivitySummary,
  fetchTaskSummary,
} from "./data.ts";
export type { GoalRaw } from "./data.ts";
export { sendTelegram } from "./telegram.ts";
export { Heartbeat, fetchOvernightActivity } from "./heartbeat.ts";
export type { HeartbeatConfig, HeartbeatDeps, OvernightActivity } from "./heartbeat.ts";
export type { HeartbeatState, StateSnapshot, FollowUp } from "./state.ts";
export type { WakeSignal, WakeDecision, WakeConfig } from "./wake.ts";
export { shouldWake, DEFAULT_WAKE_CONFIG } from "./wake.ts";

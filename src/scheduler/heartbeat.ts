/**
 * Integrated Heartbeat
 *
 * Runs inside the main bot process as setInterval timers.
 * Handles periodic smart check-ins and daily morning briefings
 * without requiring separate launchd/cron processes.
 *
 * Uses a two-tier pattern inspired by OpenClaw:
 *   wake() — cheap deterministic pre-checks (no LLM)
 *   run()  — full context fetch + LLM decision (only when signaled)
 *
 * Opt-in via HEARTBEAT_ENABLED=true.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "../config/index.ts";
import type { MemorySystem } from "../memory/index.ts";
import type { Logger } from "../utils/logger.ts";
import { callAnthropicAPI } from "../agent/anthropic-api.ts";
import {
  fetchWeather,
  fetchGoals,
  fetchGoalsRaw,
  fetchFacts,
  fetchActivitySummary,
  fetchTaskSummary,
  fetchNews,
} from "./data.ts";
import type { HeartbeatState, StateSnapshot } from "./state.ts";
import { loadState, saveState, resetDailyCounters } from "./state.ts";
import type { WakeSignal } from "./wake.ts";
import { shouldWake, DEFAULT_WAKE_CONFIG } from "./wake.ts";

export interface HeartbeatConfig {
  enabled: boolean;
  checkinIntervalMs: number;  // Default: 30 min
  briefingHour: number;       // Hour in user's timezone (0-23), default 8
  activeHoursStart: number;   // Default: 8
  activeHoursEnd: number;     // Default: 22
}

export interface HeartbeatDeps {
  config: Config;
  memory: MemorySystem;
  profile: string;
  heartbeatRules: string;
  sendMessage: (text: string) => Promise<void>;
  logger?: Logger;
}

export class Heartbeat {
  private hbConfig: HeartbeatConfig;
  private deps: HeartbeatDeps;
  private log: Logger;
  private checkinTimer: ReturnType<typeof setInterval> | null = null;
  private state: HeartbeatState | null = null;

  constructor(hbConfig: HeartbeatConfig, deps: HeartbeatDeps) {
    this.hbConfig = hbConfig;
    this.deps = deps;
    this.log = deps.logger || { info() {}, warn() {}, error() {} };
  }

  async start(): Promise<void> {
    if (!this.hbConfig.enabled) return;

    // Load persisted state
    this.state = await loadState(this.deps.config.paths.relayDir);

    this.checkinTimer = setInterval(
      () => this.cycle(),
      this.hbConfig.checkinIntervalMs
    );

    this.log.info("heartbeat", "started", {
      checkinIntervalMin: Math.round(this.hbConfig.checkinIntervalMs / 60000),
      briefingHour: this.hbConfig.briefingHour,
      activeHours: `${this.hbConfig.activeHoursStart}-${this.hbConfig.activeHoursEnd}`,
    });
  }

  stop(): void {
    if (this.checkinTimer) clearInterval(this.checkinTimer);
    this.checkinTimer = null;
    this.log.info("heartbeat", "stopped");
  }

  /**
   * Main heartbeat cycle — called every checkinIntervalMs.
   */
  private async cycle(): Promise<void> {
    try {
      const { config } = this.deps;
      const hour = this.getCurrentHour(config.user.timezone);

      // Outside active hours — skip entirely
      if (hour < this.hbConfig.activeHoursStart || hour >= this.hbConfig.activeHoursEnd) {
        return;
      }

      // Ensure state is loaded
      if (!this.state) {
        this.state = await loadState(config.paths.relayDir);
      }

      // Reset daily counters on new day
      this.state = resetDailyCounters(this.state, config.user.timezone);

      // Morning briefing — once per day at the configured hour
      if (
        !this.state.lastBriefingAt &&
        hour >= this.hbConfig.briefingHour &&
        hour < this.hbConfig.briefingHour + 1
      ) {
        await this.sendBriefing();
        return; // Don't also send a check-in right after briefing
      }

      // Check if briefing was already sent today
      if (this.state.lastBriefingAt) {
        const briefingDay = new Date(this.state.lastBriefingAt).toLocaleDateString("en-CA", {
          timeZone: config.user.timezone,
        });
        const today = new Date().toLocaleDateString("en-CA", { timeZone: config.user.timezone });
        if (
          briefingDay !== today &&
          hour >= this.hbConfig.briefingHour &&
          hour < this.hbConfig.briefingHour + 1
        ) {
          await this.sendBriefing();
          return;
        }
      }

      // ── Wake check: cheap deterministic gate ──
      const decision = await this.wake();

      this.state.lastWakeCheckAt = new Date().toISOString();

      if (!decision.shouldWake) {
        this.log.info("heartbeat", "wake_skip", { reason: decision.skipReason });
        await saveState(this.deps.config.paths.relayDir, this.state);
        return;
      }

      this.log.info("heartbeat", "wake_triggered", {
        signals: decision.signals.map((s) => `${s.type}: ${s.detail}`),
      });

      // ── Run: full LLM check-in ──
      await this.run(decision.signals);
      await saveState(this.deps.config.paths.relayDir, this.state);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error("heartbeat", "cycle_error", { error: msg });
    }
  }

  // ============================================================
  // Wake — cheap deterministic pre-checks (no LLM)
  // ============================================================

  private async wake(): Promise<{ shouldWake: boolean; signals: WakeSignal[]; skipReason?: string }> {
    const { config, memory } = this.deps;
    const client = memory.client;
    if (!client || !this.state) {
      return { shouldWake: false, signals: [], skipReason: "No client or state" };
    }

    // Fetch lightweight snapshot + raw goals in parallel
    const [snapshot, goals] = await Promise.all([
      this.fetchSnapshot(client, config.user.timezone),
      fetchGoalsRaw(client),
    ]);

    const decision = shouldWake(this.state, snapshot, goals, DEFAULT_WAKE_CONFIG);

    // Always update the snapshot for next comparison
    if (this.state) {
      this.state.lastKnownState = snapshot;
    }

    return decision;
  }

  // ============================================================
  // Run — full context fetch + LLM decision
  // ============================================================

  private async run(signals: WakeSignal[]): Promise<void> {
    const { config, memory, profile, heartbeatRules } = this.deps;
    const client = memory.client;
    if (!client || !config.anthropic || !this.state) return;

    const now = new Date();
    const hour = this.getCurrentHour(config.user.timezone);
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

    const timeStr = now.toLocaleString("en-US", {
      timeZone: config.user.timezone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Fetch full context for the LLM
    const [goals, activity, tasks, facts] = await Promise.allSettled([
      fetchGoals(client),
      fetchActivitySummary(client, config.user.timezone),
      fetchTaskSummary(client),
      fetchFacts(client),
    ]);

    const goalsData = goals.status === "fulfilled" ? goals.value : [];
    const activityData = activity.status === "fulfilled" ? activity.value : {
      lastMessageTime: null, hoursSinceLastMessage: Infinity, messageCountToday: 0, recentTopics: [],
    };
    const tasksData = tasks.status === "fulfilled" ? tasks.value : { activeTasks: [], completedToday: [] };
    const factsData = facts.status === "fulfilled" ? facts.value : [];

    // Format wake signals for the LLM
    const signalLines = signals.map((s) => `- ${s.detail}`).join("\n");

    const systemPrompt = `You are Bright, a proactive personal AI assistant for ${config.user.name}.
You are deciding whether to send a brief check-in message on Telegram.

${profile ? `User profile:\n${profile}\n` : ""}${heartbeatRules ? `MONITORING RULES (user-configured):\n${heartbeatRules}\n` : ""}
RULES:
1. Maximum ${DEFAULT_WAKE_CONFIG.maxPerDay} proactive check-ins per day. Do NOT be annoying.
2. Only reach out if there is a genuine reason — the WAKE SIGNALS below explain why you were woken.
3. NEVER check in if there's nothing substantive to say.
4. Keep the message SHORT (1-3 sentences).
5. Sound natural and casual.
6. Focus your message on the most important signal.`;

    const userMessage = `Current time: ${timeStr}
Time of day: ${timeOfDay}
Check-ins sent today: ${this.state.checkinsSentToday}/${DEFAULT_WAKE_CONFIG.maxPerDay}

WAKE SIGNALS (why you were woken):
${signalLines}

ACTIVITY:
- Last message: ${activityData.hoursSinceLastMessage === Infinity ? "Never" : `${activityData.hoursSinceLastMessage.toFixed(1)} hours ago`}
- Messages today: ${activityData.messageCountToday}
- Recent topics: ${activityData.recentTopics.length ? activityData.recentTopics.join(" | ") : "None"}

GOALS:
${goalsData.length ? goalsData.map((g) => `- ${g.content}${g.deadline ? ` (deadline: ${g.deadline})` : ""}`).join("\n") : "No active goals"}

TASKS:
- Active: ${tasksData.activeTasks.length ? tasksData.activeTasks.map((t) => t.description).join(", ") : "None"}
- Completed today: ${tasksData.completedToday.length ? tasksData.completedToday.map((t) => t.description).join(", ") : "None"}

FACTS:
${factsData.length ? factsData.slice(0, 10).map((f) => `- ${f}`).join("\n") : "No stored facts"}

Should you check in? Respond in EXACTLY this format:
DECISION: YES or NO
MESSAGE: [Your message if YES, or "none" if NO]
REASON: [Brief explanation]`;

    const response = await callAnthropicAPI(systemPrompt, userMessage, config.anthropic);

    const decisionMatch = response.match(/DECISION:\s*(YES|NO)/i);
    const messageMatch = response.match(/MESSAGE:\s*(.+?)(?=\nREASON:|$)/is);
    const reasonMatch = response.match(/REASON:\s*(.+)/is);

    const shouldSend = decisionMatch?.[1]?.toUpperCase() === "YES";
    const message = messageMatch?.[1]?.trim() || "";
    const reason = reasonMatch?.[1]?.trim() || "";

    this.log.info("heartbeat", "checkin_decision", {
      shouldSend,
      reason,
      signals: signals.map((s) => s.type),
      hoursSinceLastMessage: activityData.hoursSinceLastMessage,
    });

    if (shouldSend && message && message !== "none") {
      await this.deps.sendMessage(message);
      await memory.saveMessage("assistant", message, { source: "checkin" });

      // Update state: record the check-in
      this.state.lastCheckinAt = new Date().toISOString();
      this.state.checkinsSentToday++;
      this.state.topicsDiscussedToday.push(reason.substring(0, 100));

      // Mark signaled items as alerted (dedup)
      for (const signal of signals) {
        if (signal.type === "task_completed") {
          // Add all new completed task IDs to the alerted set
          const newIds = this.state.lastKnownState.completedTaskIds.filter(
            (id) => !this.state!.alertedTaskIds.includes(id)
          );
          this.state.alertedTaskIds.push(...newIds);
        }
        if (signal.type === "goal_deadline") {
          // Extract goal ID from signal detail (approximate — by content match)
          // The signal detail contains the goal content in quotes
          const match = signal.detail.match(/"([^"]+)"/);
          if (match) {
            this.state.alertedGoalIds.push(match[1]);
          }
        }
      }
    }
  }

  // ============================================================
  // Snapshot — cheap parallel queries for state comparison
  // ============================================================

  private async fetchSnapshot(client: SupabaseClient, timezone: string): Promise<StateSnapshot> {
    try {
      const [activity, tasks] = await Promise.allSettled([
        fetchActivitySummary(client, timezone),
        fetchTaskSummary(client),
      ]);

      const activityData = activity.status === "fulfilled" ? activity.value : {
        lastMessageTime: null, hoursSinceLastMessage: Infinity, messageCountToday: 0, recentTopics: [],
      };
      const tasksData = tasks.status === "fulfilled" ? tasks.value : {
        activeTasks: [], completedToday: [],
      };

      return {
        activeGoalCount: 0, // Counted from goals in wake() — avoid double-fetch
        activeTaskCount: tasksData.activeTasks.length,
        lastUserMessageAt: activityData.lastMessageTime,
        completedTaskIds: tasksData.completedToday.map(
          (t) => t.description // Use description as ID (task IDs not exposed yet)
        ),
      };
    } catch {
      return {
        activeGoalCount: 0,
        activeTaskCount: 0,
        lastUserMessageAt: null,
        completedTaskIds: [],
      };
    }
  }

  // ============================================================
  // Morning Briefing (unchanged logic, now updates state)
  // ============================================================

  private async sendBriefing(): Promise<void> {
    const { config, memory, profile, heartbeatRules } = this.deps;
    const client = memory.client;
    if (!client || !config.anthropic) return;

    this.log.info("heartbeat", "briefing_starting");

    // Fetch data
    const [weather, goals, tasks, facts, news, overnight] = await Promise.allSettled([
      config.location
        ? fetchWeather(config.location.latitude, config.location.longitude, config.user.timezone)
        : Promise.resolve(null),
      fetchGoals(client),
      fetchTaskSummary(client),
      fetchFacts(client),
      config.tasks.tavilyApiKey
        ? fetchNews(config.tasks.tavilyApiKey, "AI and technology")
        : Promise.resolve([]),
      fetchOvernightActivity(client, config.user.timezone),
    ]);

    const sections: string[] = [];

    // Date
    const dateStr = new Date().toLocaleDateString("en-US", {
      timeZone: config.user.timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    sections.push(`Date: ${dateStr}`);

    // Weather
    const weatherData = weather.status === "fulfilled" ? weather.value : null;
    if (weatherData) {
      const cityLabel = config.location?.cityName ? ` in ${config.location.cityName}` : "";
      sections.push(
        `Weather${cityLabel}: ${weatherData.weatherDescription}, ${weatherData.temperature}°F ` +
        `(feels like ${weatherData.apparentTemperature}°F). ` +
        `High ${weatherData.high}°F, Low ${weatherData.low}°F. ` +
        `${weatherData.precipitationProbability}% chance of precipitation.`
      );
    }

    // Goals
    const goalsData = goals.status === "fulfilled" ? goals.value : [];
    if (goalsData.length) {
      sections.push(
        "Active Goals:\n" +
        goalsData.map((g) => `- ${g.content}${g.deadline ? ` (by ${g.deadline})` : ""}`).join("\n")
      );
    }

    // Overnight activity
    const overnightData = overnight.status === "fulfilled" ? overnight.value : null;
    if (overnightData && overnightData.hasActivity) {
      let overnightSection = "While you were away:";
      if (overnightData.completedTasks.length) {
        overnightSection += "\n" + overnightData.completedTasks.map((t) => `- Completed: ${t}`).join("\n");
      }
      if (overnightData.failedTasks.length) {
        overnightSection += "\n" + overnightData.failedTasks.map((t) => `- Failed: ${t}`).join("\n");
      }
      if (overnightData.progressUpdates > 0) {
        overnightSection += `\n- ${overnightData.progressUpdates} progress updates sent`;
      }
      sections.push(overnightSection);
    }

    // Tasks
    const tasksData = tasks.status === "fulfilled" ? tasks.value : { activeTasks: [], completedToday: [] };
    if (tasksData.activeTasks.length) {
      sections.push(
        "In Progress:\n" + tasksData.activeTasks.map((t) => `- ${t.description}`).join("\n")
      );
    }

    // News
    const newsData = news.status === "fulfilled" ? news.value : [];
    if (newsData.length) {
      sections.push("AI/Tech News:\n" + newsData.map((n) => `- ${n.title}`).join("\n"));
    }

    // Facts for Claude context
    const factsData = facts.status === "fulfilled" ? facts.value : [];
    if (factsData.length) {
      sections.push("User context:\n" + factsData.slice(0, 10).map((f) => `- ${f}`).join("\n"));
    }

    const rawData = sections.join("\n\n");

    // Have Claude synthesize
    const systemPrompt = `You are Bright, sending a morning briefing to ${config.user.name} on Telegram.

${profile ? `User profile:\n${profile}\n` : ""}${heartbeatRules ? `BRIEFING PREFERENCES (user-configured):\n${heartbeatRules}\n` : ""}
Write a concise, friendly morning briefing based on the data below. Guidelines:
- Start with a brief greeting appropriate for the day/weather.
- Keep each section to 2-3 lines maximum.
- If there's an "While you were away" section, lead with it after the greeting — the user will want to know what happened overnight.
- Highlight anything time-sensitive or relevant to the user's goals.
- If there's no data for a section, skip it — don't mention missing data.
- End with one brief, encouraging or actionable sentence.
- Total length: 15-25 lines. Concise and scannable.
- Do NOT use markdown headers (#). Use simple text with line breaks.
- You can use bold (*text*) sparingly for section labels.`;

    const userMessage = `Here is today's data to synthesize into a morning briefing:\n\n${rawData}`;
    const briefing = await callAnthropicAPI(systemPrompt, userMessage, config.anthropic);

    await this.deps.sendMessage(briefing);
    await memory.saveMessage("assistant", briefing, { source: "briefing" });

    // Update state
    if (this.state) {
      this.state.lastBriefingAt = new Date().toISOString();
      await saveState(this.deps.config.paths.relayDir, this.state);
    }

    this.log.info("heartbeat", "briefing_sent", { briefingLength: briefing.length });
  }

  private getCurrentHour(timezone: string): number {
    return parseInt(
      new Date().toLocaleString("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      })
    );
  }
}

// --- Overnight Activity Helper ---

export interface OvernightActivity {
  hasActivity: boolean;
  completedTasks: string[];
  failedTasks: string[];
  progressUpdates: number;
}

export async function fetchOvernightActivity(
  client: SupabaseClient,
  timezone: string
): Promise<OvernightActivity> {
  try {
    // "Overnight" = since 10pm yesterday in user's timezone
    // Approximation: last 10 hours
    const since = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();

    const [completed, failed, logs] = await Promise.allSettled([
      client
        .from("tasks")
        .select("description")
        .eq("status", "completed")
        .gte("completed_at", since),
      client
        .from("tasks")
        .select("description")
        .eq("status", "failed")
        .gte("completed_at", since),
      client
        .from("logs")
        .select("id", { count: "exact", head: true })
        .eq("event", "task_progress")
        .gte("created_at", since),
    ]);

    const completedTasks = (completed.status === "fulfilled" ? completed.value.data || [] : [])
      .map((t: any) => t.description);
    const failedTasks = (failed.status === "fulfilled" ? failed.value.data || [] : [])
      .map((t: any) => t.description);
    const progressUpdates = logs.status === "fulfilled" ? (logs.value as any).count || 0 : 0;

    return {
      hasActivity: completedTasks.length > 0 || failedTasks.length > 0,
      completedTasks,
      failedTasks,
      progressUpdates,
    };
  } catch (err) {
    console.error("Overnight activity fetch failed:", String(err));
    return { hasActivity: false, completedTasks: [], failedTasks: [], progressUpdates: 0 };
  }
}

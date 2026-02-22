/**
 * Smart Check-in
 *
 * Runs on a schedule (launchd/cron). Gathers real context from Supabase,
 * asks Claude whether to check in, and sends a message if appropriate.
 *
 * Run manually: bun run src/scheduler/checkin.ts
 */

import { createSchedulerContext } from "./context.ts";
import {
  fetchGoals,
  fetchFacts,
  fetchActivitySummary,
  fetchTaskSummary,
} from "./data.ts";

function parseDecision(response: string): {
  shouldSend: boolean;
  message: string;
  reason: string;
} {
  const decisionMatch = response.match(/DECISION:\s*(YES|NO)/i);
  const messageMatch = response.match(/MESSAGE:\s*(.+?)(?=\nREASON:|$)/is);
  const reasonMatch = response.match(/REASON:\s*(.+)/is);

  return {
    shouldSend: decisionMatch?.[1]?.toUpperCase() === "YES",
    message: messageMatch?.[1]?.trim() || "",
    reason: reasonMatch?.[1]?.trim() || "",
  };
}

async function main() {
  console.log("Running smart check-in...");

  const ctx = await createSchedulerContext();
  const { config, memory } = ctx;

  // Hard time guard — don't run outside waking hours
  const now = new Date();
  const hour = parseInt(
    now.toLocaleString("en-US", {
      timeZone: config.user.timezone,
      hour: "numeric",
      hour12: false,
    })
  );
  if (hour < 8 || hour > 21) {
    console.log(`Outside waking hours (${hour}:00), skipping.`);
    process.exit(0);
  }

  const timeStr = now.toLocaleString("en-US", {
    timeZone: config.user.timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const timeOfDay =
    hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  // Fetch context in parallel
  const client = memory.client!;
  const [goals, activity, tasks, facts] = await Promise.all([
    fetchGoals(client),
    fetchActivitySummary(client, config.user.timezone),
    fetchTaskSummary(client),
    fetchFacts(client),
  ]);

  // Build decision prompt
  const systemPrompt = `You are Bright, a proactive personal AI assistant for ${config.user.name}.
You are deciding whether to send a brief check-in message on Telegram.

${ctx.profile ? `User profile:\n${ctx.profile}\n` : ""}
RULES FOR CHECK-INS:
1. Maximum 2-3 proactive check-ins per day. Do NOT be annoying.
2. Only reach out if there is a genuine REASON:
   - A goal has an approaching deadline (today or tomorrow)
   - It has been a long time since the user was active (4+ hours during waking hours)
   - A background task just completed and the user should know
   - Time-sensitive information (e.g., end of work day, deadline approaching)
3. NEVER check in if:
   - The user messaged within the last 2 hours (they're active, leave them alone)
   - There's nothing substantive to say
4. Keep the message SHORT (1-3 sentences). Be helpful, not intrusive.
5. Sound natural and casual, like a thoughtful friend — not a corporate assistant.
6. Reference specific goals, tasks, or facts when relevant.`;

  const userMessage = `Current time: ${timeStr}
Time of day: ${timeOfDay}

ACTIVITY:
- Last message from user: ${activity.hoursSinceLastMessage === Infinity ? "Never" : `${activity.hoursSinceLastMessage.toFixed(1)} hours ago`}
- Messages today: ${activity.messageCountToday}
- Recent topics: ${activity.recentTopics.length ? activity.recentTopics.join(" | ") : "None"}

GOALS:
${goals.length ? goals.map((g) => `- ${g.content}${g.deadline ? ` (deadline: ${g.deadline})` : ""}`).join("\n") : "No active goals"}

TASKS:
- Active: ${tasks.activeTasks.length ? tasks.activeTasks.map((t) => t.description).join(", ") : "None"}
- Completed today: ${tasks.completedToday.length ? tasks.completedToday.map((t) => t.description).join(", ") : "None"}

FACTS ABOUT USER:
${facts.length ? facts.slice(0, 10).map((f) => `- ${f}`).join("\n") : "No stored facts"}

Based on all this context, should you check in? Respond in EXACTLY this format:
DECISION: YES or NO
MESSAGE: [Your check-in message if YES, or "none" if NO]
REASON: [Brief explanation of why]`;

  // Ask Claude to decide
  const response = await ctx.callClaude(systemPrompt, userMessage);
  const decision = parseDecision(response);

  console.log(`Decision: ${decision.shouldSend ? "YES" : "NO"}`);
  console.log(`Reason: ${decision.reason}`);

  if (decision.shouldSend && decision.message && decision.message !== "none") {
    console.log("Sending check-in...");
    const sent = await ctx.sendTelegram(decision.message);

    if (sent) {
      console.log("Check-in sent!");

      // Save to messages table so it appears in conversation history
      await memory.saveMessage("assistant", decision.message, {
        source: "checkin",
      });
    } else {
      console.error("Failed to send check-in");
    }
  } else {
    console.log("No check-in needed.");
  }

  // Log decision to Supabase
  if (memory.client) {
    await memory.client.from("logs").insert({
      event: "checkin_decision",
      level: "info",
      message: `${decision.shouldSend ? "SENT" : "SKIPPED"}: ${decision.reason}`,
      metadata: {
        shouldSend: decision.shouldSend,
        reason: decision.reason,
        hoursSinceLastMessage: activity.hoursSinceLastMessage,
        goalCount: goals.length,
        activeTaskCount: tasks.activeTasks.length,
      },
    });
  }
}

main().catch((err) => {
  console.error("Check-in error:", err);
  process.exit(1);
});

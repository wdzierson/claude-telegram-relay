/**
 * Morning Briefing
 *
 * Runs once daily (launchd/cron). Fetches real data from Supabase,
 * Open-Meteo, and Tavily, then has Claude synthesize a natural
 * morning briefing sent to Telegram.
 *
 * Run manually: bun run src/scheduler/briefing.ts
 */

import { createSchedulerContext } from "./context.ts";
import type { SchedulerContext } from "./context.ts";
import {
  fetchWeather,
  fetchGoals,
  fetchFacts,
  fetchTaskSummary,
  fetchNews,
} from "./data.ts";

async function assembleBriefingData(ctx: SchedulerContext): Promise<string> {
  const { config, memory } = ctx;
  const client = memory.client!;

  // Fetch all data in parallel — allSettled so one failure doesn't block the rest
  const [weather, goals, tasks, facts, news] = await Promise.allSettled([
    config.location
      ? fetchWeather(
          config.location.latitude,
          config.location.longitude,
          config.user.timezone
        )
      : Promise.resolve(null),
    fetchGoals(client),
    fetchTaskSummary(client),
    fetchFacts(client),
    config.tasks.tavilyApiKey
      ? fetchNews(config.tasks.tavilyApiKey, "AI and technology")
      : Promise.resolve([]),
  ]);

  const sections: string[] = [];

  // Date header
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    timeZone: config.user.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  sections.push(`Date: ${dateStr}`);

  // Weather
  const weatherData = weather.status === "fulfilled" ? weather.value : null;
  if (weatherData) {
    const cityLabel = config.location?.cityName
      ? ` in ${config.location.cityName}`
      : "";
    sections.push(
      `Weather${cityLabel}: ${weatherData.weatherDescription}, ${weatherData.temperature}°F ` +
        `(feels like ${weatherData.apparentTemperature}°F). ` +
        `High ${weatherData.high}°F, Low ${weatherData.low}°F. ` +
        `${weatherData.precipitationProbability}% chance of precipitation. ` +
        `Wind ${weatherData.windSpeed} mph.`
    );
  }

  // Active goals
  const goalsData = goals.status === "fulfilled" ? goals.value : [];
  if (goalsData.length) {
    sections.push(
      "Active Goals:\n" +
        goalsData
          .map(
            (g) =>
              `- ${g.content}${g.deadline ? ` (by ${g.deadline})` : ""}`
          )
          .join("\n")
    );
  }

  // Tasks
  const tasksData =
    tasks.status === "fulfilled"
      ? tasks.value
      : { activeTasks: [], completedToday: [] };

  if (tasksData.completedToday.length) {
    sections.push(
      "Recently Completed:\n" +
        tasksData.completedToday.map((t) => `- ${t.description}`).join("\n")
    );
  }
  if (tasksData.activeTasks.length) {
    sections.push(
      "In Progress:\n" +
        tasksData.activeTasks.map((t) => `- ${t.description}`).join("\n")
    );
  }

  // News
  const newsData = news.status === "fulfilled" ? news.value : [];
  if (newsData.length) {
    sections.push(
      "AI/Tech News:\n" +
        newsData.map((n) => `- ${n.title}`).join("\n")
    );
  }

  // User facts (for Claude personalization context)
  const factsData = facts.status === "fulfilled" ? facts.value : [];
  if (factsData.length) {
    sections.push(
      "User context:\n" +
        factsData
          .slice(0, 10)
          .map((f) => `- ${f}`)
          .join("\n")
    );
  }

  return sections.join("\n\n");
}

async function main() {
  console.log("Building morning briefing...");

  const ctx = await createSchedulerContext();
  const { config, memory } = ctx;

  // Assemble raw data
  const rawData = await assembleBriefingData(ctx);
  console.log("Data assembled. Synthesizing with Claude...");

  // Have Claude synthesize into natural language
  const systemPrompt = `You are Bright, sending a morning briefing to ${config.user.name} on Telegram.

${ctx.profile ? `User profile:\n${ctx.profile}\n` : ""}
Write a concise, friendly morning briefing based on the data below. Guidelines:
- Start with a brief greeting appropriate for the day/weather.
- Keep each section to 2-3 lines maximum.
- Highlight anything time-sensitive or particularly relevant to the user's goals.
- If there's no data for a section, skip it entirely — don't mention missing data.
- End with one brief, encouraging or actionable sentence.
- Total length: aim for 15-25 lines. Concise and scannable.
- Do NOT use markdown headers (#). Use simple text with line breaks.
- You can use bold (*text*) sparingly for section labels.`;

  const userMessage = `Here is today's data to synthesize into a morning briefing:\n\n${rawData}`;

  const briefing = await ctx.callClaude(systemPrompt, userMessage);

  // Send to Telegram
  console.log("Sending briefing...");
  const sent = await ctx.sendTelegram(briefing);

  if (sent) {
    console.log("Briefing sent!");

    // Save to messages table so it appears in conversation history
    await memory.saveMessage("assistant", briefing, {
      source: "briefing",
    });
  } else {
    console.error("Failed to send briefing");
    process.exit(1);
  }

  // Log to Supabase
  if (memory.client) {
    await memory.client.from("logs").insert({
      event: "morning_briefing",
      level: "info",
      message: "Briefing sent successfully",
      metadata: {
        briefingLength: briefing.length,
        rawDataLength: rawData.length,
      },
    });
  }
}

main().catch((err) => {
  console.error("Briefing error:", err);
  process.exit(1);
});

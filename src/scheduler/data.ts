/**
 * Scheduler Data Fetchers
 *
 * Real data sources for morning briefings and smart check-ins:
 * - Weather from Open-Meteo (free, no API key)
 * - News from Tavily (already configured)
 * - Goals, facts, tasks, activity from Supabase
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Types
// ============================================================

export interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  weatherCode: number;
  weatherDescription: string;
  high: number;
  low: number;
  precipitationProbability: number;
  humidity: number;
  windSpeed: number;
}

export interface NewsItem {
  title: string;
  url: string;
  snippet: string;
}

export interface GoalData {
  content: string;
  deadline?: string;
}

export interface ActivitySummary {
  lastMessageTime: string | null;
  hoursSinceLastMessage: number;
  messageCountToday: number;
  recentTopics: string[];
}

export interface TaskSummary {
  activeTasks: Array<{ description: string; status: string }>;
  completedToday: Array<{ description: string }>;
}

// ============================================================
// Weather — Open-Meteo (free, no API key)
// ============================================================

const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Heavy freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight showers",
  81: "Moderate showers",
  82: "Violent showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail",
};

export async function fetchWeather(
  latitude: number,
  longitude: number,
  timezone: string
): Promise<WeatherData | null> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", latitude.toString());
    url.searchParams.set("longitude", longitude.toString());
    url.searchParams.set(
      "current",
      "temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m"
    );
    url.searchParams.set(
      "daily",
      "temperature_2m_max,temperature_2m_min,precipitation_probability_max"
    );
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("timezone", timezone);
    url.searchParams.set("forecast_days", "1");

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data = await response.json();
    const current = data.current;
    const daily = data.daily;

    return {
      temperature: Math.round(current.temperature_2m),
      apparentTemperature: Math.round(current.apparent_temperature),
      weatherCode: current.weather_code,
      weatherDescription: WEATHER_CODES[current.weather_code] || "Unknown",
      high: Math.round(daily.temperature_2m_max[0]),
      low: Math.round(daily.temperature_2m_min[0]),
      precipitationProbability: daily.precipitation_probability_max[0] || 0,
      humidity: current.relative_humidity_2m,
      windSpeed: Math.round(current.wind_speed_10m),
    };
  } catch (error) {
    console.error("Weather fetch failed:", error);
    return null;
  }
}

// ============================================================
// News — Tavily API
// ============================================================

export async function fetchNews(
  tavilyApiKey: string,
  topic: string = "AI and technology"
): Promise<NewsItem[]> {
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query: `${topic} news today`,
        max_results: 5,
        search_depth: "basic",
        include_answer: false,
      }),
    });

    if (!response.ok) return [];
    const data = await response.json();

    return (data.results || []).map((r: any) => ({
      title: r.title || "Untitled",
      url: r.url || "",
      snippet: r.content?.substring(0, 200) || "",
    }));
  } catch (error) {
    console.error("News fetch failed:", error);
    return [];
  }
}

// ============================================================
// Goals — Supabase
// ============================================================

export async function fetchGoals(client: SupabaseClient): Promise<GoalData[]> {
  try {
    const { data } = await client.rpc("get_active_goals");
    return (data || []).map((g: any) => ({
      content: g.content,
      deadline: g.deadline
        ? new Date(g.deadline).toLocaleDateString()
        : undefined,
    }));
  } catch (error) {
    console.error("Goals fetch failed:", error);
    return [];
  }
}

/** Raw goal data with IDs and ISO deadlines — used by heartbeat wake checks */
export interface GoalRaw {
  id: string;
  content: string;
  deadlineRaw?: string;
}

export async function fetchGoalsRaw(client: SupabaseClient): Promise<GoalRaw[]> {
  try {
    const { data } = await client.rpc("get_active_goals");
    return (data || []).map((g: any) => ({
      id: g.id?.toString() || g.content,
      content: g.content,
      deadlineRaw: g.deadline || undefined,
    }));
  } catch {
    return [];
  }
}

// ============================================================
// Facts — Supabase
// ============================================================

export async function fetchFacts(client: SupabaseClient): Promise<string[]> {
  try {
    const { data } = await client.rpc("get_facts");
    return (data || []).map((f: any) => f.content);
  } catch (error) {
    console.error("Facts fetch failed:", error);
    return [];
  }
}

// ============================================================
// Activity — Supabase
// ============================================================

export async function fetchActivitySummary(
  client: SupabaseClient,
  timezone: string
): Promise<ActivitySummary> {
  try {
    const { data: recentMessages } = await client.rpc("get_recent_messages", {
      limit_count: 20,
    });

    const now = new Date();
    let lastMessageTime: string | null = null;
    let hoursSinceLastMessage = Infinity;
    let messageCountToday = 0;
    const topics: string[] = [];

    if (recentMessages?.length) {
      lastMessageTime = recentMessages[0].created_at;
      hoursSinceLastMessage =
        (now.getTime() - new Date(lastMessageTime).getTime()) /
        (1000 * 60 * 60);

      // Count today's messages
      const todayStr = now.toLocaleDateString("en-US", { timeZone: timezone });

      for (const msg of recentMessages) {
        const msgDate = new Date(msg.created_at).toLocaleDateString("en-US", {
          timeZone: timezone,
        });
        if (msgDate === todayStr) messageCountToday++;

        // Extract brief topics from user messages
        if (msg.role === "user" && topics.length < 3) {
          topics.push(msg.content.substring(0, 80));
        }
      }
    }

    return {
      lastMessageTime,
      hoursSinceLastMessage,
      messageCountToday,
      recentTopics: topics,
    };
  } catch (error) {
    console.error("Activity fetch failed:", error);
    return {
      lastMessageTime: null,
      hoursSinceLastMessage: Infinity,
      messageCountToday: 0,
      recentTopics: [],
    };
  }
}

// ============================================================
// Tasks — Supabase
// ============================================================

export async function fetchTaskSummary(
  client: SupabaseClient
): Promise<TaskSummary> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [activeResult, completedResult] = await Promise.all([
      client
        .from("tasks")
        .select("description, status")
        .in("status", ["pending", "running"]),
      client
        .from("tasks")
        .select("description")
        .eq("status", "completed")
        .gte("updated_at", todayStart.toISOString()),
    ]);

    return {
      activeTasks: (activeResult.data || []).map((t: any) => ({
        description: t.description,
        status: t.status,
      })),
      completedToday: (completedResult.data || []).map((t: any) => ({
        description: t.description,
      })),
    };
  } catch (error) {
    console.error("Tasks fetch failed:", error);
    return { activeTasks: [], completedToday: [] };
  }
}

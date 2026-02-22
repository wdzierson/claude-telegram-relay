/**
 * Weather Tool — Open-Meteo (free, no API key)
 *
 * Reuses fetchWeather() from scheduler/data.ts.
 */

import type { ChatTool } from "../types.ts";
import type { LocationConfig, UserConfig } from "../../config/index.ts";
import { fetchWeather } from "../../scheduler/data.ts";

export function createWeatherTool(
  location: LocationConfig,
  user: UserConfig
): ChatTool {
  return {
    definition: {
      name: "get_weather",
      description:
        "Get current weather conditions and forecast for the user's location. " +
        "Returns temperature, conditions, high/low, precipitation, humidity, and wind.",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    async execute() {
      const data = await fetchWeather(
        location.latitude,
        location.longitude,
        user.timezone
      );
      if (!data) return "Weather data unavailable.";
      const city = location.cityName ? ` (${location.cityName})` : "";
      return [
        `Weather${city}:`,
        `Current: ${data.temperature}°F (feels like ${data.apparentTemperature}°F)`,
        `Conditions: ${data.weatherDescription}`,
        `High: ${data.high}°F / Low: ${data.low}°F`,
        `Precipitation: ${data.precipitationProbability}%`,
        `Humidity: ${data.humidity}%`,
        `Wind: ${data.windSpeed} mph`,
      ].join("\n");
    },
    scope: "both",
    approval: "never",
    category: "information",
  };
}

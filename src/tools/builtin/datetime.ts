/**
 * Date/Time Tool
 *
 * Current date, time, day of week, and timezone conversion.
 */

import type { ChatTool } from "../types.ts";

export function createDateTimeTool(defaultTimezone: string): ChatTool {
  return {
    definition: {
      name: "get_datetime",
      description:
        "Get the current date, time, day of week, and related information. " +
        "Can convert between timezones. Use this for time-sensitive questions.",
      input_schema: {
        type: "object" as const,
        properties: {
          timezone: {
            type: "string",
            description: `IANA timezone (default: ${defaultTimezone})`,
          },
          format: {
            type: "string",
            enum: ["full", "date", "time", "iso"],
            description: "Output format (default: full)",
          },
        },
        required: [],
      },
    },
    async execute(input) {
      const tz = (input.timezone as string) || defaultTimezone;
      const format = (input.format as string) || "full";
      const now = new Date();

      if (format === "iso") return now.toISOString();

      if (format === "date") {
        return now.toLocaleDateString("en-US", {
          timeZone: tz,
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }

      if (format === "time") {
        return now.toLocaleTimeString("en-US", {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
      }

      // "full"
      return now.toLocaleString("en-US", {
        timeZone: tz,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      });
    },
    scope: "both",
    approval: "never",
    category: "information",
  };
}

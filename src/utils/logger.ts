/**
 * Structured Logger
 *
 * Writes to console (grep-friendly format) and optionally to Supabase logs table.
 * Supabase writes are fire-and-forget — never blocks the caller.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type LogLevel = "info" | "warn" | "error";

export interface Logger {
  info(component: string, event: string, data?: Record<string, unknown>): void;
  warn(component: string, event: string, data?: Record<string, unknown>): void;
  error(component: string, event: string, data?: Record<string, unknown>): void;
}

function formatData(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return "";
  const pairs = Object.entries(data).map(([k, v]) => {
    const val = typeof v === "string" ? v : JSON.stringify(v);
    return `${k}=${val}`;
  });
  return ` — ${pairs.join(", ")}`;
}

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

export function createLogger(supabaseClient?: SupabaseClient | null): Logger {
  function log(
    level: LogLevel,
    component: string,
    event: string,
    data?: Record<string, unknown>
  ): void {
    const ts = timestamp();
    const tag = component.toUpperCase();
    const suffix = formatData(data);
    const line = `[${ts}] [${tag}] ${event}${suffix}`;

    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }

    // Fire-and-forget Supabase write
    if (supabaseClient) {
      supabaseClient
        .from("logs")
        .insert({
          level,
          event: `${component}:${event}`,
          message: suffix || null,
          metadata: data || {},
        })
        .then(() => {}, () => {});
    }
  }

  return {
    info: (component, event, data) => log("info", component, event, data),
    warn: (component, event, data) => log("warn", component, event, data),
    error: (component, event, data) => log("error", component, event, data),
  };
}

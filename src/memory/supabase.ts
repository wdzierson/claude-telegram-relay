/**
 * Supabase Client
 *
 * Creates and exports a Supabase client if configured.
 * All database operations go through this module.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseConfig } from "../config/index.ts";

export function createSupabaseClient(
  config?: SupabaseConfig
): SupabaseClient | null {
  if (!config) return null;
  return createClient(config.url, config.anonKey);
}

export type { SupabaseClient };

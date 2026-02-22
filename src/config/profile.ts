/**
 * Profile & Config Loaders
 *
 * Reads config/*.md files at startup. Returns empty string if missing.
 * soul.md (agent personality) is loaded first, then profile.md (user facts).
 * Both are combined into a single string for downstream injection.
 */

import { readFile } from "fs/promises";
import { join } from "path";

async function loadFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

export async function loadProfile(projectRoot: string): Promise<string> {
  const [soul, profile] = await Promise.all([
    loadFile(join(projectRoot, "config", "soul.md")),
    loadFile(join(projectRoot, "config", "profile.md")),
  ]);

  // Combine: soul (agent identity) first, then profile (user facts)
  // Each file has markdown headers that provide semantic separation
  return [soul, profile].filter(Boolean).join("\n\n");
}

export async function loadHeartbeatRules(projectRoot: string): Promise<string> {
  return loadFile(join(projectRoot, "config", "heartbeat.md"));
}

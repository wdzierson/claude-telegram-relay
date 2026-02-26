/**
 * Agent Types — Loader & Registry
 *
 * Reads config/agents/*.md files to define specialized agent types.
 * Each file defines a personality, iteration budget, and optional model override.
 * Used by the task manager to customize background task behavior per type.
 */

import { readdir, readFile } from "fs/promises";
import { join, basename, extname } from "path";

export interface AgentType {
  name: string;
  soul: string;           // Personality + approach text (everything outside ## Config)
  maxIterations: number;  // Default: 50
  model?: string;         // Override anthropicConfig.model (undefined = use default)
}

/**
 * Load all agent types from config/agents/*.md.
 * Returns a Map keyed by type name (filename without extension).
 */
export async function loadAgentTypes(
  projectRoot: string
): Promise<Map<string, AgentType>> {
  const types = new Map<string, AgentType>();
  const agentsDir = join(projectRoot, "config", "agents");

  let files: string[];
  try {
    files = await readdir(agentsDir);
  } catch {
    // No agents directory — return empty map (all tasks use default behavior)
    return types;
  }

  for (const file of files) {
    if (extname(file) !== ".md") continue;

    const name = basename(file, ".md");
    const content = await readFile(join(agentsDir, file), "utf-8");
    const parsed = parseAgentFile(name, content);
    types.set(name, parsed);
  }

  return types;
}

/**
 * Get an agent type by name, with fallback to "default" type or a minimal default.
 */
export function getAgentType(
  types: Map<string, AgentType>,
  name?: string
): AgentType | undefined {
  if (name && types.has(name)) return types.get(name)!;
  if (types.has("default")) return types.get("default")!;
  return undefined;
}

/**
 * Parse a single agent type .md file.
 *
 * Format:
 *   # Type Name
 *   ## Config
 *   - **Max iterations:** 15
 *   - **Model:** claude-haiku-4-5-20251001
 *   ## Personality
 *   Free-form text...
 *   ## Approach
 *   Free-form text...
 *
 * The ## Config section is parsed for key-value pairs.
 * Everything else becomes the soul text.
 */
function parseAgentFile(name: string, content: string): AgentType {
  let maxIterations = 50;
  let model: string | undefined;

  // Extract ## Config section
  const configMatch = content.match(
    /^## Config\s*\n([\s\S]*?)(?=\n## |\n# |$)/m
  );

  if (configMatch) {
    const configBlock = configMatch[1];

    // Parse "- **Key:** value" or "- Key: value" patterns
    for (const line of configBlock.split("\n")) {
      const kv = line.match(
        /^[-*]\s*\*{0,2}(.+?)\*{0,2}:\*{0,2}\s*(.+)/
      );
      if (!kv) continue;

      const key = kv[1].toLowerCase().trim();
      const value = kv[2].trim();

      if (key === "max iterations") {
        const n = parseInt(value);
        if (!isNaN(n) && n > 0) maxIterations = n;
      } else if (key === "model") {
        if (value !== "default") model = value;
      }
    }
  }

  // Soul = everything except the Config section
  const soul = configMatch
    ? content.replace(configMatch[0], "").trim()
    : content.trim();

  return { name, soul, maxIterations, model };
}

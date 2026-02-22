/**
 * .env Parser
 *
 * Reads and writes .env files while preserving comments, blank lines,
 * and file structure. Creates a backup before any write.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";

export interface EnvEntry {
  type: "comment" | "blank" | "keyvalue";
  raw: string;
  key?: string;
  value?: string;
}

/**
 * Parse a .env file into structured entries.
 */
export function parseEnvFile(path: string): EnvEntry[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  const lines = content.split("\n");
  const entries: EnvEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      entries.push({ type: "blank", raw: line });
    } else if (trimmed.startsWith("#")) {
      entries.push({ type: "comment", raw: line });
    } else {
      const eqIndex = line.indexOf("=");
      if (eqIndex !== -1) {
        const key = line.substring(0, eqIndex).trim();
        let value = line.substring(eqIndex + 1).trim();
        // Strip surrounding quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        entries.push({ type: "keyvalue", raw: line, key, value });
      } else {
        // Malformed line — preserve as comment
        entries.push({ type: "comment", raw: line });
      }
    }
  }

  return entries;
}

/**
 * Get a value from parsed entries.
 */
export function getEnvValue(entries: EnvEntry[], key: string): string | undefined {
  for (const entry of entries) {
    if (entry.type === "keyvalue" && entry.key === key) {
      return entry.value;
    }
  }
  return undefined;
}

/**
 * Set a value in parsed entries. If the key exists, update it in place.
 * If not, append it at the end.
 */
export function setEnvValue(entries: EnvEntry[], key: string, value: string): EnvEntry[] {
  const result = [...entries];
  let found = false;

  for (let i = 0; i < result.length; i++) {
    if (result[i].type === "keyvalue" && result[i].key === key) {
      result[i] = { type: "keyvalue", raw: `${key}=${value}`, key, value };
      found = true;
      break;
    }
    // Also check for commented-out keys — uncomment and set
    if (result[i].type === "comment") {
      const match = result[i].raw.match(/^#\s*([A-Z_]+)\s*=/);
      if (match && match[1] === key) {
        result[i] = { type: "keyvalue", raw: `${key}=${value}`, key, value };
        found = true;
        break;
      }
    }
  }

  if (!found) {
    result.push({ type: "keyvalue", raw: `${key}=${value}`, key, value });
  }

  return result;
}

/**
 * Serialize entries back to .env format.
 */
export function serializeEntries(entries: EnvEntry[]): string {
  return entries.map((e) => {
    if (e.type === "keyvalue") return `${e.key}=${e.value}`;
    return e.raw;
  }).join("\n");
}

/**
 * Write entries to a .env file. Creates a .env.backup first.
 */
export function writeEnvFile(path: string, entries: EnvEntry[]): void {
  if (existsSync(path)) {
    copyFileSync(path, path + ".backup");
  }
  writeFileSync(path, serializeEntries(entries), "utf-8");
}

/**
 * Claude CLI Spawner
 *
 * Spawns Claude Code CLI as a subprocess and returns the output.
 * Uses a fixed session ID for conversation continuity.
 */

import { spawn } from "bun";
import type { ClaudeConfig } from "../config/index.ts";

const SESSION_ID = "bright-relay";

export async function callClaude(
  prompt: string,
  claudeConfig: ClaudeConfig
): Promise<string> {
  const args = [
    claudeConfig.path,
    "-p",
    prompt,
    "--output-format",
    "text",
    "--resume",
    SESSION_ID,
  ];

  console.log(`Calling Claude: ${prompt.substring(0, 50)}...`);

  try {
    const proc = spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
      cwd: claudeConfig.projectDir || undefined,
      env: { ...process.env, CLAUDECODE: undefined },
    });

    const output = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      console.error("Claude error:", stderr);
      return `Error: ${stderr || "Claude exited with code " + exitCode}`;
    }

    return output.trim();
  } catch (error) {
    console.error("Spawn error:", error);
    return "Error: Could not run Claude CLI";
  }
}

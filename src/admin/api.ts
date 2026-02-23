/**
 * Admin API Handlers
 *
 * Backend logic for the admin dashboard. Each function handles
 * one API endpoint and returns a Response.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "../config/index.ts";
import type { TaskQueue } from "../agent/tasks/queue.ts";
import type { MCPClientManager } from "../tools/mcp/client.ts";
import type { MemorySystem } from "../memory/index.ts";
import type { TaskManager } from "../agent/tasks/manager.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import { handleMessage, type AgentResponse } from "../agent/index.ts";
import {
  parseEnvFile,
  setEnvValue,
  writeEnvFile,
  type EnvEntry,
} from "./env-parser.ts";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export interface AdminDeps {
  config: Config;
  supabaseClient: SupabaseClient | null;
  taskQueue: TaskQueue | null;
  mcpManager?: MCPClientManager | null;
  envFilePath: string;
  startTime: number; // process start timestamp
  broadcast?: (topic: string, data: unknown) => void;
  // Chat deps
  memory?: MemorySystem | null;
  profile?: string;
  taskManager?: TaskManager | null;
  registry?: ToolRegistry | null;
  agentTypes?: Map<string, import("../agent/tasks/agent-types.ts").AgentType> | null;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Keys that contain secrets — mask in GET, allow in PUT
const SENSITIVE_KEYS = new Set([
  "TELEGRAM_BOT_TOKEN",
  "SUPABASE_ANON_KEY",
  "ANTHROPIC_API_KEY",
  "GROQ_API_KEY",
  "ELEVENLABS_API_KEY",
  "TAVILY_API_KEY",
  "TELNYX_API_KEY",
  "SERVER_API_KEY",
]);

// Env var groupings for the config UI
const SECTIONS: Record<string, string[]> = {
  Core: ["AGENT_BACKEND", "USER_NAME", "USER_TIMEZONE"],
  Telegram: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_USER_ID"],
  Anthropic: ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "ANTHROPIC_MAX_TOKENS"],
  Supabase: ["SUPABASE_URL", "SUPABASE_ANON_KEY"],
  Voice: ["VOICE_PROVIDER", "GROQ_API_KEY", "WHISPER_BINARY", "WHISPER_MODEL_PATH"],
  TTS: ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ELEVENLABS_MODEL"],
  Tasks: ["TAVILY_API_KEY", "TASK_MAX_ITERATIONS", "TASK_TIMEOUT_MS"],
  Queue: ["QUEUE_MAX_CONCURRENT", "QUEUE_POLL_INTERVAL_MS", "QUEUE_HEARTBEAT_INTERVAL_MS"],
  Heartbeat: [
    "HEARTBEAT_ENABLED",
    "HEARTBEAT_CHECKIN_INTERVAL_MS",
    "HEARTBEAT_BRIEFING_HOUR",
    "HEARTBEAT_ACTIVE_START",
    "HEARTBEAT_ACTIVE_END",
  ],
  Location: ["LOCATION_LATITUDE", "LOCATION_LONGITUDE", "LOCATION_CITY"],
  MCP: ["MCP_CONFIG_PATH"],
  Telnyx: ["TELNYX_API_KEY", "TELNYX_PHONE_NUMBER", "TELNYX_ASSISTANT_ID"],
  Server: ["HTTP_PORT", "PUBLIC_URL", "SERVER_API_KEY", "PHONE_MODEL"],
  Paths: ["RELAY_DIR", "PROJECT_DIR", "CLAUDE_PATH"],
};

// All known keys (flat set for validation)
const ALLOWED_KEYS = new Set(Object.values(SECTIONS).flat());

function maskValue(key: string, value: string): string {
  if (SENSITIVE_KEYS.has(key) && value.length > 4) {
    return "****" + value.slice(-4);
  }
  return value;
}

// ---- Handlers ----

export async function handleStatus(deps: AdminDeps): Promise<Response> {
  const uptime = Math.floor((Date.now() - deps.startTime) / 1000);

  const status: Record<string, unknown> = {
    uptime,
    bot: "running",
    memory: deps.supabaseClient ? "connected" : "not configured",
  };

  if (deps.taskQueue) {
    status.taskQueue = {
      active: deps.taskQueue.activeCount,
      queued: await deps.taskQueue.queuedCount(),
      waitingUser: await deps.taskQueue.waitingUserCount(),
    };
  }

  return json(status);
}

export async function handleGetConfig(deps: AdminDeps): Promise<Response> {
  const entries = parseEnvFile(deps.envFilePath);

  const sections: {
    section: string;
    vars: { key: string; value: string; masked: boolean; active: boolean }[];
  }[] = [];

  for (const [section, keys] of Object.entries(SECTIONS)) {
    const vars = keys.map((key) => {
      const entry = entries.find((e) => e.key === key);
      // Also check for commented-out entries
      const commentedEntry = entries.find(
        (e) => e.type === "comment" && e.raw.match(new RegExp(`^#\\s*${key}\\s*=`))
      );
      const rawValue = entry?.value ?? "";
      const active = !!entry;

      return {
        key,
        value: active ? maskValue(key, rawValue) : (commentedEntry ? "" : ""),
        masked: SENSITIVE_KEYS.has(key) && active && rawValue.length > 4,
        active,
      };
    });

    sections.push({ section, vars });
  }

  return json({ sections });
}

export async function handlePutConfig(
  req: Request,
  deps: AdminDeps
): Promise<Response> {
  try {
    const body = await req.json();
    const updates: { key: string; value: string }[] = body.updates;

    if (!Array.isArray(updates)) {
      return json({ error: "updates must be an array" }, 400);
    }

    // Validate keys
    for (const { key } of updates) {
      if (!ALLOWED_KEYS.has(key)) {
        return json({ error: `Unknown config key: ${key}` }, 400);
      }
    }

    let entries = parseEnvFile(deps.envFilePath);
    for (const { key, value } of updates) {
      entries = setEnvValue(entries, key, value);
    }

    writeEnvFile(deps.envFilePath, entries);

    return json({ success: true, restartRequired: true });
  } catch (err: any) {
    return json({ error: err.message }, 400);
  }
}

export async function handleGetMcp(deps: AdminDeps): Promise<Response> {
  const mcpPath = process.env.MCP_CONFIG_PATH;
  if (!mcpPath || !existsSync(mcpPath)) {
    return json({ servers: [], configPath: mcpPath || null });
  }

  try {
    const raw = readFileSync(mcpPath, "utf-8");
    const parsed = JSON.parse(raw);
    const servers = parsed.servers || [];

    // Enrich with live connection status from the manager
    const connectedNames = deps.mcpManager
      ? new Set(deps.mcpManager.getServerNames())
      : new Set<string>();

    const enriched = servers.map((s: any) => ({
      ...s,
      connected: connectedNames.has(s.name),
      toolCount: deps.mcpManager
        ? deps.mcpManager.getServerTools(s.name).length
        : 0,
      tools: deps.mcpManager
        ? deps.mcpManager.getServerTools(s.name).map((t) => ({
            name: t.name,
            description: t.description || "",
          }))
        : [],
    }));

    return json({ servers: enriched, configPath: mcpPath });
  } catch {
    return json({ servers: [], configPath: mcpPath, error: "Failed to parse config" });
  }
}

export async function handleGetMcpCatalog(): Promise<Response> {
  // Static catalog of known MCP servers for the "Add Server" UI
  const { MCP_SERVER_CATALOG } = await import("./mcp-catalog.ts");
  return json({ catalog: MCP_SERVER_CATALOG });
}

export async function handlePutMcp(req: Request, deps: AdminDeps): Promise<Response> {
  const mcpPath = process.env.MCP_CONFIG_PATH;
  if (!mcpPath) {
    return json(
      { error: "MCP_CONFIG_PATH not set. Add it to .env first." },
      400
    );
  }

  try {
    const body = await req.json();
    const servers = body.servers;

    if (!Array.isArray(servers)) {
      return json({ error: "servers must be an array" }, 400);
    }

    // Backup existing
    if (existsSync(mcpPath)) {
      const backup = mcpPath + ".backup";
      const existing = readFileSync(mcpPath, "utf-8");
      writeFileSync(backup, existing, "utf-8");
    }

    writeFileSync(mcpPath, JSON.stringify({ servers }, null, 2), "utf-8");
    return json({ success: true, restartRequired: true });
  } catch (err: any) {
    return json({ error: err.message }, 400);
  }
}

export async function handleGetMessages(
  url: URL,
  deps: AdminDeps
): Promise<Response> {
  if (!deps.supabaseClient) {
    return json({ messages: [], error: "Supabase not configured" });
  }

  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const { data, error, count } = await deps.supabaseClient
    .from("messages")
    .select("id, role, content, channel, metadata, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return json({ messages: [], error: error.message });
  }

  return json({ messages: data || [], total: count || 0 });
}

export async function handleGetMemory(
  url: URL,
  deps: AdminDeps
): Promise<Response> {
  if (!deps.supabaseClient) {
    return json({ memory: [], error: "Supabase not configured" });
  }

  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const { data, error, count } = await deps.supabaseClient
    .from("memory")
    .select("id, type, content, metadata, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return json({ memory: [], error: error.message });
  }

  return json({ memory: data || [], total: count || 0 });
}

export async function handleGetTasks(
  url: URL,
  deps: AdminDeps
): Promise<Response> {
  if (!deps.supabaseClient) {
    return json({ tasks: [], error: "Supabase not configured" });
  }

  const limit = parseInt(url.searchParams.get("limit") || "20");
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const status = url.searchParams.get("status");

  let query = deps.supabaseClient
    .from("tasks")
    .select(
      "id, status, description, result, error, priority, iteration_count, max_iterations, token_usage, created_at, updated_at, started_at, completed_at, parent_task_id, pending_question, metadata",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query;

  if (error) {
    return json({ tasks: [], error: error.message });
  }

  return json({ tasks: data || [], total: count || 0 });
}

// ==================== Chat ====================

export async function handleChat(
  req: Request,
  deps: AdminDeps
): Promise<Response> {
  if (!deps.memory || !deps.profile) {
    return json({ error: "Chat not available — memory or profile not configured" }, 503);
  }

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const message = body.message?.trim();
  if (!message) {
    return json({ error: "message is required" }, 400);
  }

  try {
    const response: AgentResponse = await handleMessage(
      { type: "text", text: message, metadata: { channel: "admin" } },
      deps.config,
      deps.memory,
      deps.profile,
      deps.taskManager,
      deps.registry
    );

    return json({
      text: response.text,
      taskIds: response.taskIds,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `Chat failed: ${msg}` }, 500);
  }
}

// ==================== Cancel Task ====================

export async function handleCancelTask(
  taskId: string,
  deps: AdminDeps
): Promise<Response> {
  if (!deps.taskQueue) {
    return json({ error: "Task queue not available" }, 503);
  }

  const success = await deps.taskQueue.cancel(taskId);
  if (success) {
    return json({ ok: true });
  }
  return json({ error: "Failed to cancel task" }, 500);
}

// ==================== Tools ====================

export async function handleGetTools(deps: AdminDeps): Promise<Response> {
  if (!deps.registry) {
    return json({ tools: [] });
  }

  // Get all tools from the registry
  const chatTools = deps.registry.getChatTools();
  const bgTools = deps.registry.getBackgroundTools();

  // Deduplicate (tools with scope "both" appear in both lists)
  const seen = new Set<string>();
  const tools: { name: string; description: string; scope: string; category: string; approval: string }[] = [];

  for (const t of [...chatTools, ...bgTools]) {
    if (seen.has(t.definition.name)) continue;
    seen.add(t.definition.name);
    tools.push({
      name: t.definition.name,
      description: (t.definition as any).description || "",
      scope: t.scope,
      category: t.category,
      approval: t.approval,
    });
  }

  return json({ tools });
}

// ==================== Agent Types ====================

export async function handleGetAgentTypes(deps: AdminDeps): Promise<Response> {
  if (!deps.agentTypes) {
    return json({ agentTypes: [] });
  }

  const types = Array.from(deps.agentTypes.entries()).map(([id, t]) => ({
    id,
    name: t.name,
    maxIterations: t.maxIterations,
    model: t.model || null,
  }));

  return json({ agentTypes: types });
}

// ==================== Heartbeat Config ====================

export async function handleGetHeartbeatConfig(deps: AdminDeps): Promise<Response> {
  return json({
    enabled: deps.config.heartbeat.enabled,
    checkinIntervalMs: deps.config.heartbeat.checkinIntervalMs,
    briefingHour: deps.config.heartbeat.briefingHour,
    activeHoursStart: deps.config.heartbeat.activeHoursStart,
    activeHoursEnd: deps.config.heartbeat.activeHoursEnd,
  });
}

export async function handlePutHeartbeatConfig(req: Request, deps: AdminDeps): Promise<Response> {
  try {
    const body = await req.json();
    const updates: { key: string; value: string }[] = [];

    if (body.enabled !== undefined) updates.push({ key: "HEARTBEAT_ENABLED", value: String(body.enabled) });
    if (body.checkinIntervalMs !== undefined) updates.push({ key: "HEARTBEAT_CHECKIN_INTERVAL_MS", value: String(body.checkinIntervalMs) });
    if (body.briefingHour !== undefined) updates.push({ key: "HEARTBEAT_BRIEFING_HOUR", value: String(body.briefingHour) });
    if (body.activeHoursStart !== undefined) updates.push({ key: "HEARTBEAT_ACTIVE_START", value: String(body.activeHoursStart) });
    if (body.activeHoursEnd !== undefined) updates.push({ key: "HEARTBEAT_ACTIVE_END", value: String(body.activeHoursEnd) });

    if (updates.length === 0) {
      return json({ error: "No valid fields provided" }, 400);
    }

    let entries = parseEnvFile(deps.envFilePath);
    for (const { key, value } of updates) {
      entries = setEnvValue(entries, key, value);
    }
    writeEnvFile(deps.envFilePath, entries);

    return json({ success: true, restartRequired: true });
  } catch (err: any) {
    return json({ error: err.message }, 400);
  }
}

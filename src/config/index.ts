/**
 * Configuration Module
 *
 * Loads .env and exports a single typed Config object.
 * All other modules import config from here — no direct process.env access.
 */

import { join, dirname } from "path";
import { readFileSync } from "fs";

// Project root: two levels up from src/config/
const PROJECT_ROOT = dirname(dirname(dirname(import.meta.path)));

export interface TelegramConfig {
  botToken: string;
  allowedUserIds: string[]; // Supports multiple users; single user = array of one
}

export type AgentBackend = "cli" | "api";

export interface ClaudeConfig {
  path: string;
  projectDir?: string;
}

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface VoiceConfig {
  provider: "groq" | "local";
  groqApiKey?: string;
  whisperBinary?: string;
  whisperModelPath?: string;
}

export interface TTSConfig {
  provider: "elevenlabs";
  apiKey: string;
  voiceId: string;
  model: string;
}

export interface TasksConfig {
  tavilyApiKey?: string;
  maxIterations: number;
  timeoutMs: number;
}

export interface LocationConfig {
  latitude: number;
  longitude: number;
  cityName?: string;
}

export interface UserConfig {
  name: string;
  timezone: string;
}

export interface TelnyxConfig {
  apiKey: string;
  phoneNumber: string;
  assistantId?: string;
}

export interface ServerConfig {
  port: number;
  publicUrl?: string;
  apiKey?: string; // Shared secret for authenticating inbound requests
}

export interface MCPServerEntry {
  /** Unique name for this server (used as tool namespace) */
  name: string;
  /** Command to spawn the server */
  command: string;
  /** Arguments for the command */
  args?: string[];
  /** Environment variables for the server process */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Approval policy for all tools from this server */
  approvalPolicy?: "never" | "always" | "destructive";
}

export interface MCPConfig {
  servers: MCPServerEntry[];
}

export interface PathsConfig {
  projectRoot: string;
  relayDir: string;
  tempDir: string;
  uploadsDir: string;
}

export interface QueueConfig {
  maxConcurrent: number;       // Default: 2
  pollIntervalMs: number;      // Default: 5000
  heartbeatIntervalMs: number; // Default: 30000
}

export interface HeartbeatConfig {
  enabled: boolean;
  checkinIntervalMs: number;  // Default: 30 min
  briefingHour: number;       // Hour in user's timezone (0-23), default 8
  activeHoursStart: number;   // Default: 8
  activeHoursEnd: number;     // Default: 22
}

export interface Config {
  agentBackend: AgentBackend;
  telegram: TelegramConfig;
  claude: ClaudeConfig;
  anthropic?: AnthropicConfig;
  supabase?: SupabaseConfig;
  voice?: VoiceConfig;
  tts?: TTSConfig;
  tasks: TasksConfig;
  queue: QueueConfig;
  heartbeat: HeartbeatConfig;
  location?: LocationConfig;
  mcp?: MCPConfig;
  telnyx?: TelnyxConfig;
  server?: ServerConfig;
  user: UserConfig;
  paths: PathsConfig;
}

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
  return value;
}

export function loadConfig(): Config {
  const relayDir =
    process.env.RELAY_DIR ||
    join(process.env.HOME || "~", ".bright");

  // Telegram — required
  const telegram: TelegramConfig = {
    botToken: requiredEnv("TELEGRAM_BOT_TOKEN"),
    allowedUserIds: process.env.TELEGRAM_USER_ID
      ? process.env.TELEGRAM_USER_ID.split(",").map((id) => id.trim())
      : [],
  };

  // Claude CLI
  const claude: ClaudeConfig = {
    path: process.env.CLAUDE_PATH || "claude",
    projectDir: process.env.PROJECT_DIR || undefined,
  };

  // Supabase — optional
  let supabase: SupabaseConfig | undefined;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    supabase = {
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
    };
  }

  // Voice — optional
  let voice: VoiceConfig | undefined;
  if (process.env.VOICE_PROVIDER) {
    voice = {
      provider: process.env.VOICE_PROVIDER as "groq" | "local",
      groqApiKey: process.env.GROQ_API_KEY,
      whisperBinary: process.env.WHISPER_BINARY,
      whisperModelPath: process.env.WHISPER_MODEL_PATH,
    };
  }

  // User
  const user: UserConfig = {
    name: process.env.USER_NAME || "",
    timezone:
      process.env.USER_TIMEZONE ||
      Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  // Paths
  const paths: PathsConfig = {
    projectRoot: PROJECT_ROOT,
    relayDir,
    tempDir: join(relayDir, "temp"),
    uploadsDir: join(relayDir, "uploads"),
  };

  // Agent backend
  const agentBackend = (process.env.AGENT_BACKEND || "cli") as AgentBackend;

  // Anthropic API — required if backend is "api"
  let anthropic: AnthropicConfig | undefined;
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || "4096"),
    };
  }

  // TTS — optional (ElevenLabs)
  let tts: TTSConfig | undefined;
  if (process.env.ELEVENLABS_API_KEY) {
    tts = {
      provider: "elevenlabs",
      apiKey: process.env.ELEVENLABS_API_KEY,
      voiceId: process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb",
      model: process.env.ELEVENLABS_MODEL || "eleven_turbo_v2_5",
    };
  }

  // Tasks — optional
  const tasks: TasksConfig = {
    tavilyApiKey: process.env.TAVILY_API_KEY,
    maxIterations: parseInt(process.env.TASK_MAX_ITERATIONS || "25"),
    timeoutMs: parseInt(process.env.TASK_TIMEOUT_MS || "600000"),
  };

  // Location — optional (for weather in briefings)
  let location: LocationConfig | undefined;
  if (process.env.LOCATION_LATITUDE && process.env.LOCATION_LONGITUDE) {
    location = {
      latitude: parseFloat(process.env.LOCATION_LATITUDE),
      longitude: parseFloat(process.env.LOCATION_LONGITUDE),
      cityName: process.env.LOCATION_CITY || undefined,
    };
  }

  // MCP — optional (load from JSON config file)
  let mcp: MCPConfig | undefined;
  const mcpConfigPath = process.env.MCP_CONFIG_PATH;
  if (mcpConfigPath) {
    try {
      const rawFile = readFileSync(mcpConfigPath, "utf-8");
      // Substitute ${VAR_NAME} references with process.env values
      const raw = rawFile.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] ?? "");
      const parsed = JSON.parse(raw);
      const servers: MCPServerEntry[] = Array.isArray(parsed.servers)
        ? parsed.servers
        : [];
      if (servers.length > 0) {
        mcp = { servers };
        console.log(`MCP: loaded ${servers.length} server(s) from ${mcpConfigPath}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`MCP: could not load config from ${mcpConfigPath}: ${msg}`);
    }
  }

  // Telnyx — optional (phone channel)
  let telnyx: TelnyxConfig | undefined;
  if (process.env.TELNYX_API_KEY && process.env.TELNYX_PHONE_NUMBER) {
    telnyx = {
      apiKey: process.env.TELNYX_API_KEY,
      phoneNumber: process.env.TELNYX_PHONE_NUMBER,
      assistantId: process.env.TELNYX_ASSISTANT_ID || undefined,
    };
  }

  // HTTP server — optional (required for phone channel)
  let server: ServerConfig | undefined;
  if (process.env.HTTP_PORT) {
    server = {
      port: parseInt(process.env.HTTP_PORT),
      publicUrl: process.env.PUBLIC_URL || undefined,
      apiKey: process.env.SERVER_API_KEY || undefined,
    };
  }

  // Task queue
  const queue: QueueConfig = {
    maxConcurrent: parseInt(process.env.QUEUE_MAX_CONCURRENT || "2"),
    pollIntervalMs: parseInt(process.env.QUEUE_POLL_INTERVAL_MS || "5000"),
    heartbeatIntervalMs: parseInt(process.env.QUEUE_HEARTBEAT_INTERVAL_MS || "30000"),
  };

  // Heartbeat (integrated check-in/briefing)
  const heartbeat: HeartbeatConfig = {
    enabled: process.env.HEARTBEAT_ENABLED === "true",
    checkinIntervalMs: parseInt(process.env.HEARTBEAT_CHECKIN_INTERVAL_MS || "1800000"), // 30 min
    briefingHour: parseInt(process.env.HEARTBEAT_BRIEFING_HOUR || "8"),
    activeHoursStart: parseInt(process.env.HEARTBEAT_ACTIVE_START || "8"),
    activeHoursEnd: parseInt(process.env.HEARTBEAT_ACTIVE_END || "22"),
  };

  if (agentBackend === "api" && !anthropic) {
    console.error("AGENT_BACKEND=api requires ANTHROPIC_API_KEY to be set");
    process.exit(1);
  }

  return { agentBackend, telegram, claude, anthropic, supabase, voice, tts, tasks, queue, heartbeat, location, mcp, telnyx, server, user, paths };
}

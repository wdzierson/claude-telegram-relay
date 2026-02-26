/**
 * Bright — Personal AI Assistant
 *
 * Entry point: loads config, initializes modules, starts the Telegram bot.
 * Also starts the task queue and heartbeat if configured.
 *
 * Run: bun run src/index.ts
 */

import { mkdir } from "fs/promises";
import { readFile, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { loadConfig } from "./config/index.ts";
import { loadProfile, loadHeartbeatRules } from "./config/profile.ts";
import { loadAgentTypes } from "./agent/tasks/agent-types.ts";
import { createMemory } from "./memory/index.ts";
import { createBot } from "./channels/telegram/bot.ts";
import { Heartbeat } from "./scheduler/heartbeat.ts";
import { sendLongMessage } from "./channels/telegram/send.ts";
import { createLogger } from "./utils/logger.ts";
import { ChannelRegistry } from "./channels/registry.ts";
import { TelegramChannel } from "./channels/telegram/channel.ts";
import { AdminChannel } from "./channels/admin/channel.ts";

// ============================================================
// CONFIG
// ============================================================

const config = loadConfig();

// Create directories
await mkdir(config.paths.tempDir, { recursive: true });
await mkdir(config.paths.uploadsDir, { recursive: true });

// ============================================================
// LOCK FILE (prevent multiple instances)
// ============================================================

const LOCK_FILE = join(config.paths.relayDir, "bot.lock");

async function acquireLock(): Promise<boolean> {
  try {
    const existingLock = await readFile(LOCK_FILE, "utf-8").catch(() => null);

    if (existingLock) {
      const pid = parseInt(existingLock);
      try {
        process.kill(pid, 0);
        console.log(`Another instance running (PID: ${pid})`);
        return false;
      } catch {
        console.log("Stale lock found, taking over...");
      }
    }

    await writeFile(LOCK_FILE, process.pid.toString());
    return true;
  } catch (error) {
    console.error("Lock error:", error);
    return false;
  }
}

async function releaseLock(): Promise<void> {
  await unlink(LOCK_FILE).catch(() => {});
}

// Acquire lock
if (!(await acquireLock())) {
  console.error("Could not acquire lock. Another instance may be running.");
  process.exit(1);
}

// ============================================================
// INIT MODULES
// ============================================================

const memory = createMemory(config.supabase);
const [profile, heartbeatRules, agentTypes] = await Promise.all([
  loadProfile(config.paths.projectRoot),
  loadHeartbeatRules(config.paths.projectRoot),
  loadAgentTypes(config.paths.projectRoot),
]);
const log = createLogger(memory.client);

if (agentTypes.size > 0) {
  console.log(`Agent types loaded: ${Array.from(agentTypes.keys()).join(", ")}`);
}

// ============================================================
// START BOT + QUEUE + HEARTBEAT
// ============================================================

const { bot, taskQueue, taskManager, registry, mcpManager } = await createBot(config, memory, profile, agentTypes);

// ============================================================
// CHANNEL REGISTRY
// ============================================================

const primaryUserId = config.telegram.allowedUserIds[0];
const channelRegistry = new ChannelRegistry();
const telegramChannel = new TelegramChannel(async (text) => {
  await sendLongMessage(bot, primaryUserId, text);
});
channelRegistry.register(telegramChannel, true);

const adminChannel = new AdminChannel();
channelRegistry.register(adminChannel);

console.log("Starting Bright...");
console.log(
  `Authorized users: ${config.telegram.allowedUserIds.join(", ") || "ANY (not recommended)"}`
);
console.log(
  `Project directory: ${config.claude.projectDir || "(relay working directory)"}`
);

// Start task queue (recovers stuck tasks, begins polling)
if (taskQueue) {
  await taskQueue.start();
}

// Start heartbeat (integrated check-ins + morning briefings)
let heartbeat: Heartbeat | null = null;
if (config.heartbeat.enabled) {
  heartbeat = new Heartbeat(config.heartbeat, {
    config,
    memory,
    profile,
    heartbeatRules,
    sendMessage: async (text) => {
      await sendLongMessage(bot, primaryUserId, text);
    },
    logger: log,
  });
  await heartbeat.start();
}

// ============================================================
// PHONE CHANNEL (optional — requires HTTP_PORT)
// ============================================================

import type { PhoneServer } from "./channels/phone/index.ts";
import type { AdminDeps } from "./admin/api.ts";

let phoneServer: PhoneServer | null = null;
if (config.server) {
  const { startHTTPServer, PhoneSessionManager } = await import("./channels/phone/index.ts");
  const sessions = new PhoneSessionManager();

  const adminDeps: AdminDeps = {
    config,
    supabaseClient: memory.client,
    taskQueue: taskQueue || null,
    mcpManager: mcpManager || null,
    envFilePath: join(config.paths.projectRoot, ".env"),
    startTime: Date.now(),
    memory,
    profile,
    taskManager: taskManager || null,
    registry: registry || null,
    agentTypes,
  };

  phoneServer = startHTTPServer({
    config,
    memory,
    profile,
    registry,
    sessions,
    adminDeps,
    taskManager: taskManager || null,
  });

  // Wire broadcast from HTTP server into task queue (broadcast is set by startHTTPServer)
  if (taskQueue && adminDeps.broadcast) {
    taskQueue.setBroadcast(adminDeps.broadcast);
  }

  // Wire broadcast into AdminChannel so it can push messages to connected UI clients
  if (adminDeps.broadcast) {
    adminChannel.setBroadcast(adminDeps.broadcast);
  }
}

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down...");
  if (phoneServer) phoneServer.stop();
  if (heartbeat) heartbeat.stop();
  if (taskQueue) taskQueue.stop();
  await releaseLock();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Safety nets — prevent unhandled errors from crashing the process
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

bot.start({
  onStart: () => {
    console.log("Bot is running!");
  },
});

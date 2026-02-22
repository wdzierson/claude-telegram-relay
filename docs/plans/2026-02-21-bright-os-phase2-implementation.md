# Bright OS Phase 2: Live Monitoring + Chat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add real-time agent monitoring and browser-based chat to the Bright OS windowed workspace.

**Architecture:** WebSocket server added to the existing Bun HTTP server broadcasts task lifecycle events. The Agent Monitor app subscribes to these events for live updates. The Chat app sends messages via a new `POST /admin/api/chat` endpoint that calls the same `handleMessage()` orchestrator used by Telegram, with responses delivered synchronously. Both apps are React components registered in the existing app registry.

**Tech Stack:** Bun WebSocket (native), React 19, TypeScript, Zustand, Tailwind CSS 4, Lucide React

**Design doc:** `docs/plans/2026-02-21-bright-os-ui-design.md` (Phase 2 section)

---

### Task 1: WebSocket Server Infrastructure

**Files:**
- Modify: `src/channels/phone/server.ts`
- Modify: `src/admin/api.ts` (AdminDeps interface)
- Modify: `src/admin/routes.ts` (auth helper export)

Add WebSocket support to the existing Bun HTTP server. Clients connect to `/admin/ws?key=<api_key>` and receive real-time task events.

**Step 1: Export checkAuth as a reusable function**

In `src/admin/routes.ts`, the `checkAuth` function is currently private. We need it for WebSocket auth too. Export a standalone auth check function.

Add to `src/admin/routes.ts` (after the existing `checkAuth` function):

```typescript
/**
 * Validate an API key against the config. Returns true if valid.
 */
export function validateApiKey(key: string, deps: AdminDeps): boolean {
  const apiKey = deps.config.server?.apiKey;
  return !!apiKey && key === apiKey;
}
```

**Step 2: Add broadcast callback to AdminDeps**

In `src/admin/api.ts`, extend the `AdminDeps` interface:

```typescript
export interface AdminDeps {
  config: Config;
  supabaseClient: SupabaseClient | null;
  taskQueue: TaskQueue | null;
  mcpManager?: MCPClientManager | null;
  envFilePath: string;
  startTime: number;
  broadcast?: (topic: string, data: unknown) => void;
}
```

**Step 3: Add WebSocket handler to Bun.serve**

In `src/channels/phone/server.ts`, add WebSocket upgrade handling to the `fetch` function and a `websocket` handler object. The WebSocket auth uses the `key` query parameter.

Replace the `Bun.serve()` call:

```typescript
import { validateApiKey } from "../../admin/routes.ts";

export function startHTTPServer(deps: HTTPServerDeps): PhoneServer {
  const port = deps.config.server?.port || 3000;

  const server = Bun.serve({
    port,
    async fetch(req, server) {
      const url = new URL(req.url);

      // WebSocket upgrade — /admin/ws?key=<api_key>
      if (url.pathname === "/admin/ws" && deps.adminDeps) {
        const key = url.searchParams.get("key") || "";
        if (!validateApiKey(key, deps.adminDeps)) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (server.upgrade(req)) return undefined;
        return new Response("WebSocket upgrade failed", { status: 500 });
      }

      // POST /v1/chat/completions — main Telnyx integration point
      if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
        return handleCompletions(req, deps);
      }

      // GET /v1/models — Telnyx portal model discovery
      if (req.method === "GET" && url.pathname === "/v1/models") {
        return handleModels();
      }

      // GET /health — basic health check
      if (req.method === "GET" && url.pathname === "/health") {
        return new Response("ok");
      }

      // Admin UI and API
      if (url.pathname.startsWith("/admin") && deps.adminDeps) {
        const adminResponse = await handleAdminRequest(req, url, deps.adminDeps);
        if (adminResponse) return adminResponse;
      }

      return new Response("Not Found", { status: 404 });
    },
    websocket: {
      open(ws) {
        ws.subscribe("tasks");
      },
      message(_ws, _data) {
        // Server-to-client only; ignore client messages
      },
      close(ws) {
        ws.unsubscribe("tasks");
      },
    },
  });

  // Wire broadcast into adminDeps so other parts of the system can publish
  if (deps.adminDeps) {
    deps.adminDeps.broadcast = (topic: string, data: unknown) => {
      server.publish(topic, JSON.stringify(data));
    };
  }

  console.log(`HTTP server listening on port ${port}`);
  if (deps.config.server?.publicUrl) {
    console.log(`Public URL: ${deps.config.server.publicUrl}`);
  }
  if (deps.adminDeps) {
    console.log(`Admin UI: http://localhost:${port}/admin`);
  }

  return {
    server,
    stop: () => {
      deps.sessions.stop();
      server.stop();
    },
  };
}
```

**Step 4: Build and verify**

```bash
cd /Users/will/Appdev/bright/ui && bun run build
```

The backend is TypeScript — Bun type-checks on run. Verify there are no import errors:

```bash
cd /Users/will/Appdev/bright && bun run src/index.ts --dry-run 2>&1 | head -5
```

(The bot will fail to start fully without env vars, but import errors will show immediately.)

**Step 5: Commit**

```bash
git add src/channels/phone/server.ts src/admin/api.ts src/admin/routes.ts
git commit -m "feat(ws): add WebSocket server with auth and topic-based broadcasting"
```

---

### Task 2: Wire Task Broadcast into Queue

**Files:**
- Modify: `src/agent/tasks/queue.ts`
- Modify: `src/index.ts`

Connect the WebSocket broadcast to the task queue so every task lifecycle event is published to connected clients.

**Step 1: Add broadcast to TaskQueueDeps**

In `src/agent/tasks/queue.ts`, add to `TaskQueueDeps`:

```typescript
export interface TaskQueueDeps {
  supabaseClient: SupabaseClient;
  buildTools: (taskId: string, userId?: string) => TaskTool[];
  buildSystemPrompt: (description: string) => string;
  sendMessage: (text: string) => Promise<void>;
  saveMessage: (role: string, content: string, metadata?: Record<string, unknown>) => Promise<void>;
  anthropicConfig: { apiKey: string; model: string; maxTokens: number };
  logger?: Logger;
  broadcast?: (topic: string, data: unknown) => void;
}
```

**Step 2: Emit broadcast events in startTask callbacks**

In the `startTask` method, add broadcast calls after each DB update:

In the `onStatusChange` callback (after the `await this.deps.supabaseClient.from("tasks").update(update).eq("id", id);` line):

```typescript
this.deps.broadcast?.("tasks", {
  type: "task:status",
  taskId: id,
  status,
  result: result ? result.substring(0, 500) : null,
  error: error || null,
  timestamp: new Date().toISOString(),
});
```

In the `onIteration` callback (after the DB update):

```typescript
this.deps.broadcast?.("tasks", {
  type: "task:iteration",
  taskId: id,
  iteration,
  tokenUsage,
  timestamp: new Date().toISOString(),
});
```

**Step 3: Pass broadcast into queue deps from index.ts**

In `src/index.ts`, the `adminDeps` object is created before the HTTP server starts. The `broadcast` function is set *after* `startHTTPServer()` returns (by the server itself). So we need to pass it through lazily.

In the section where `TaskQueue` is constructed (inside `createBot` or wherever queue deps are assembled), the broadcast isn't available yet. Instead, wire it after the server starts.

In `src/index.ts`, after `phoneServer = startHTTPServer(...)`:

```typescript
// Wire broadcast from HTTP server into task queue
if (taskQueue && adminDeps.broadcast) {
  (taskQueue as any).deps.broadcast = adminDeps.broadcast;
}
```

This is a one-time assignment after both the queue and server are initialized. The `broadcast` field on `TaskQueueDeps` is optional, so it's safe to set after construction.

**Step 4: Commit**

```bash
git add src/agent/tasks/queue.ts src/index.ts
git commit -m "feat(ws): broadcast task lifecycle events via WebSocket"
```

---

### Task 3: Chat API Endpoint

**Files:**
- Modify: `src/admin/api.ts` (new handler + extended deps)
- Modify: `src/admin/routes.ts` (new route)
- Modify: `src/index.ts` (wire new deps)

Add `POST /admin/api/chat` that calls the same `handleMessage()` orchestrator used by Telegram.

**Step 1: Extend AdminDeps with chat dependencies**

In `src/admin/api.ts`, add the imports and extend the interface:

```typescript
import type { MemorySystem } from "../memory/index.ts";
import type { TaskManager } from "../agent/tasks/manager.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import { handleMessage, type AgentResponse } from "../agent/index.ts";

export interface AdminDeps {
  config: Config;
  supabaseClient: SupabaseClient | null;
  taskQueue: TaskQueue | null;
  mcpManager?: MCPClientManager | null;
  envFilePath: string;
  startTime: number;
  broadcast?: (topic: string, data: unknown) => void;
  // Chat deps
  memory?: MemorySystem | null;
  profile?: string;
  taskManager?: TaskManager | null;
  registry?: ToolRegistry | null;
}
```

**Step 2: Add handleChat handler**

In `src/admin/api.ts`, add the handler function:

```typescript
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
```

**Step 3: Add route in routes.ts**

In `src/admin/routes.ts`, import and add the route in the API section:

```typescript
import { handleChat } from "./api.ts";
```

In the API routes block, add before the 404 fallback:

```typescript
if (req.method === "POST" && path === "/admin/api/chat") {
  return handleChat(req, deps);
}
```

**Step 4: Wire extended deps in index.ts**

In `src/index.ts`, update the `adminDeps` object:

```typescript
const adminDeps: AdminDeps = {
  config,
  supabaseClient: memory.client,
  taskQueue: taskQueue || null,
  mcpManager: mcpManager || null,
  envFilePath: join(config.paths.projectRoot, ".env"),
  startTime: Date.now(),
  // Chat deps
  memory,
  profile,
  taskManager: taskManager || null,
  registry: registry || null,
};
```

**Step 5: Commit**

```bash
git add src/admin/api.ts src/admin/routes.ts src/index.ts
git commit -m "feat(api): add POST /admin/api/chat endpoint"
```

---

### Task 4: Cancel Task API Endpoint

**Files:**
- Modify: `src/admin/api.ts`
- Modify: `src/admin/routes.ts`

Add `POST /admin/api/tasks/:id/cancel` to cancel a running or queued task from the UI.

**Step 1: Add handleCancelTask handler**

In `src/admin/api.ts`:

```typescript
export async function handleCancelTask(
  taskId: string,
  deps: AdminDeps
): Promise<Response> {
  if (!deps.taskQueue) {
    return json({ error: "Task queue not available" }, 503);
  }

  const success = await deps.taskQueue.cancel(taskId);
  if (success) {
    deps.broadcast?.("tasks", {
      type: "task:status",
      taskId,
      status: "cancelled",
      timestamp: new Date().toISOString(),
    });
    return json({ ok: true });
  }
  return json({ error: "Failed to cancel task" }, 500);
}
```

**Step 2: Add route**

In `src/admin/routes.ts`, add in the API routes block:

```typescript
const cancelMatch = path.match(/^\/admin\/api\/tasks\/([^/]+)\/cancel$/);
if (req.method === "POST" && cancelMatch) {
  return handleCancelTask(cancelMatch[1], deps);
}
```

Import `handleCancelTask` from `./api.ts`.

**Step 3: Commit**

```bash
git add src/admin/api.ts src/admin/routes.ts
git commit -m "feat(api): add POST /admin/api/tasks/:id/cancel endpoint"
```

---

### Task 5: Frontend WebSocket Hook

**Files:**
- Create: `ui/src/lib/ws.ts`

Create a React-friendly WebSocket manager that connects to the Bun server and dispatches typed events.

**Step 1: Create the WebSocket hook**

Create `ui/src/lib/ws.ts`:

```typescript
import { useEffect, useRef, useCallback } from "react";
import { getApiKey } from "./auth";

export interface TaskEvent {
  type: "task:status" | "task:iteration";
  taskId: string;
  status?: string;
  result?: string | null;
  error?: string | null;
  iteration?: number;
  tokenUsage?: { input: number; output: number };
  timestamp: string;
}

type TaskEventHandler = (event: TaskEvent) => void;

const listeners = new Set<TaskEventHandler>();
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getWsUrl(): string {
  const key = getApiKey();
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/admin/ws?key=${encodeURIComponent(key || "")}`;
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(getWsUrl());

  ws.onmessage = (e) => {
    try {
      const event: TaskEvent = JSON.parse(e.data);
      listeners.forEach((fn) => fn(event));
    } catch {
      // ignore unparseable messages
    }
  };

  ws.onclose = () => {
    ws = null;
    // Reconnect after 3 seconds if there are active listeners
    if (listeners.size > 0 && !reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 3000);
    }
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

/**
 * Subscribe to real-time task events via WebSocket.
 * Manages a singleton connection — first subscriber connects, last unsubscriber disconnects.
 */
export function useTaskEvents(handler: TaskEventHandler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const stableHandler = useCallback((event: TaskEvent) => {
    handlerRef.current(event);
  }, []);

  useEffect(() => {
    listeners.add(stableHandler);
    connect();

    return () => {
      listeners.delete(stableHandler);
      if (listeners.size === 0) {
        disconnect();
      }
    };
  }, [stableHandler]);
}
```

**Step 2: Extend API client**

In `ui/src/lib/api.ts`, add the new endpoints:

```typescript
export interface ChatResponse {
  text: string;
  taskIds: string[];
}

// Add to the api object:
postChat: (message: string): Promise<ChatResponse> =>
  request<ChatResponse>("/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  }),

cancelTask: (taskId: string): Promise<{ ok: boolean }> =>
  request<{ ok: boolean }>(`/tasks/${taskId}/cancel`, {
    method: "POST",
  }),
```

**Step 3: Build and verify**

```bash
cd /Users/will/Appdev/bright/ui && bun run build
```

**Step 4: Commit**

```bash
git add ui/src/lib/ws.ts ui/src/lib/api.ts
git commit -m "feat(ui): add WebSocket hook and chat/cancel API methods"
```

---

### Task 6: Agent Monitor App

**Files:**
- Create: `ui/src/apps/agent-monitor/index.tsx`

The Agent Monitor shows active and recent tasks with real-time status updates.

**Step 1: Create the Agent Monitor component**

Create `ui/src/apps/agent-monitor/index.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react";
import { Activity, XCircle, Clock, Cpu, CheckCircle, AlertTriangle, Loader } from "lucide-react";
import type { AppProps, BrightApp } from "../../core/app-registry";
import { api, type TasksResponse } from "../../lib/api";
import { useTaskEvents, type TaskEvent } from "../../lib/ws";

interface TaskRow {
  id: string;
  status: string;
  description: string;
  result?: string;
  error?: string;
  iteration_count: number;
  max_iterations: number;
  token_usage: { input: number; output: number };
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

const STATUS_COLORS: Record<string, string> = {
  running: "bg-status-success",
  queued: "bg-text-secondary",
  waiting_user: "bg-accent-amber",
  completed: "bg-accent-copper",
  failed: "bg-status-error",
  cancelled: "bg-text-secondary",
};

const STATUS_ICONS: Record<string, typeof Activity> = {
  running: Loader,
  queued: Clock,
  waiting_user: Clock,
  completed: CheckCircle,
  failed: AlertTriangle,
  cancelled: XCircle,
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatElapsed(start?: string, end?: string): string {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const sec = Math.floor((e - s) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}

function formatTokens(usage: { input: number; output: number }): string {
  const total = usage.input + usage.output;
  if (total === 0) return "—";
  if (total < 1000) return `${total}`;
  return `${(total / 1000).toFixed(1)}k`;
}

function AgentMonitor(_props: AppProps) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"active" | "all">("active");

  const loadTasks = useCallback(async () => {
    try {
      const data = await api.getTasks(30);
      setTasks(data.tasks);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Initial load + poll every 10s as fallback
  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 10_000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  // Real-time updates via WebSocket
  useTaskEvents(useCallback((event: TaskEvent) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== event.taskId) return t;
        const updated = { ...t };
        if (event.status) updated.status = event.status;
        if (event.iteration !== undefined) updated.iteration_count = event.iteration;
        if (event.tokenUsage) updated.token_usage = event.tokenUsage;
        if (event.result !== undefined) updated.result = event.result || undefined;
        if (event.error !== undefined) updated.error = event.error || undefined;
        if (event.status === "completed" || event.status === "failed") {
          updated.completed_at = event.timestamp;
        }
        return updated;
      })
    );
  }, []));

  const handleCancel = async (taskId: string) => {
    try {
      await api.cancelTask(taskId);
    } catch {
      // Refresh will pick up the state
    }
  };

  const filtered = filter === "active"
    ? tasks.filter((t) => ["running", "queued", "waiting_user"].includes(t.status))
    : tasks;

  if (error) {
    return <div className="p-4 text-status-error text-sm">{error}</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button
          onClick={() => setFilter("active")}
          className={`px-2 py-0.5 rounded text-xs font-body ${
            filter === "active" ? "bg-accent-amber/20 text-accent-amber" : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setFilter("all")}
          className={`px-2 py-0.5 rounded text-xs font-body ${
            filter === "all" ? "bg-accent-amber/20 text-accent-amber" : "text-text-secondary hover:text-text-primary"
          }`}
        >
          All
        </button>
        <span className="ml-auto text-[10px] text-text-secondary font-mono">
          {tasks.filter((t) => t.status === "running").length} running
        </span>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            {filter === "active" ? "No active tasks" : "No tasks yet"}
          </div>
        ) : (
          filtered.map((task) => {
            const Icon = STATUS_ICONS[task.status] || Activity;
            const isExpanded = expanded === task.id;
            const isActive = ["running", "queued", "waiting_user"].includes(task.status);

            return (
              <div
                key={task.id}
                className="border-b border-border hover:bg-surface/50 cursor-pointer"
                onClick={() => setExpanded(isExpanded ? null : task.id)}
              >
                {/* Task header row */}
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[task.status] || "bg-text-secondary"}`} />
                  <Icon size={14} className={`shrink-0 ${task.status === "running" ? "animate-spin text-accent-amber" : "text-text-secondary"}`} />
                  <span className="text-sm text-text-primary truncate flex-1 font-body">
                    {task.description.substring(0, 100)}
                  </span>

                  {/* Progress */}
                  {isActive && task.max_iterations > 0 && (
                    <span className="text-[10px] font-mono text-text-secondary shrink-0">
                      {task.iteration_count}/{task.max_iterations}
                    </span>
                  )}

                  {/* Tokens */}
                  <span className="text-[10px] font-mono text-text-secondary shrink-0">
                    {formatTokens(task.token_usage)}
                  </span>

                  {/* Time */}
                  <span className="text-[10px] font-mono text-text-secondary shrink-0">
                    {formatElapsed(task.started_at, task.completed_at)}
                  </span>

                  {/* Cancel button */}
                  {isActive && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCancel(task.id); }}
                      className="text-text-secondary hover:text-status-error shrink-0"
                      title="Cancel task"
                    >
                      <XCircle size={14} />
                    </button>
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2">
                    <div className="flex gap-4 text-[10px] font-mono text-text-secondary">
                      <span>Status: {task.status}</span>
                      <span>ID: {task.id.substring(0, 8)}</span>
                      <span>Created: {formatTime(task.created_at)}</span>
                      {task.started_at && <span>Started: {formatTime(task.started_at)}</span>}
                    </div>

                    {/* Progress bar */}
                    {task.max_iterations > 0 && (
                      <div className="h-1 bg-surface rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-amber rounded-full transition-all"
                          style={{ width: `${Math.min(100, (task.iteration_count / task.max_iterations) * 100)}%` }}
                        />
                      </div>
                    )}

                    {/* Token detail */}
                    <div className="flex gap-4 text-[10px] font-mono text-text-secondary">
                      <span>Input: {task.token_usage.input.toLocaleString()}</span>
                      <span>Output: {task.token_usage.output.toLocaleString()}</span>
                    </div>

                    {/* Result or error */}
                    {task.result && (
                      <div className="p-2 rounded bg-surface text-xs text-text-primary font-body max-h-48 overflow-y-auto whitespace-pre-wrap">
                        {task.result}
                      </div>
                    )}
                    {task.error && (
                      <div className="p-2 rounded bg-status-error/10 text-xs text-status-error font-body">
                        {task.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export const AgentMonitorApp: BrightApp = {
  id: "agent-monitor",
  name: "Agent Monitor",
  icon: "activity",
  defaultSize: { w: 650, h: 500 },
  minSize: { w: 400, h: 300 },
  component: AgentMonitor,
  category: "core",
};
```

**Step 2: Build and verify**

```bash
cd /Users/will/Appdev/bright/ui && bun run build
```

**Step 3: Commit**

```bash
git add ui/src/apps/agent-monitor/index.tsx
git commit -m "feat(ui): add Agent Monitor app with real-time task tracking"
```

---

### Task 7: Chat App

**Files:**
- Create: `ui/src/apps/chat/index.tsx`

The Chat app lets users talk to Bright from the browser.

**Step 1: Create the Chat component**

Create `ui/src/apps/chat/index.tsx`:

```tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader, Zap } from "lucide-react";
import type { AppProps, BrightApp } from "../../core/app-registry";
import { api } from "../../lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  taskIds?: string[];
  timestamp: Date;
}

function Chat(_props: AppProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);

    const userMsg: ChatMessage = { role: "user", content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await api.postChat(text);
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: res.text,
        taskIds: res.taskIds,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-text-secondary">
            <Zap size={24} className="mb-2 text-accent-amber" />
            <span className="text-sm">Send a message to Bright</span>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm font-body ${
                msg.role === "user"
                  ? "bg-accent-amber/15 text-text-primary"
                  : "bg-surface text-text-primary"
              }`}
            >
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>

              {/* Task spawn chips */}
              {msg.taskIds && msg.taskIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {msg.taskIds.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent-copper/20 text-accent-copper text-[10px] font-mono"
                    >
                      <Zap size={10} /> Task {id.substring(0, 8)}
                    </span>
                  ))}
                </div>
              )}

              <div className="text-[10px] text-text-secondary mt-1">
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface rounded-lg px-3 py-2 flex items-center gap-2">
              <Loader size={14} className="animate-spin text-accent-amber" />
              <span className="text-sm text-text-secondary">Thinking...</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-xs text-status-error text-center">{error}</div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Bright..."
            rows={1}
            className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-body resize-none focus:outline-none focus:border-accent-amber placeholder:text-text-secondary"
            style={{ maxHeight: "120px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="p-2 rounded-lg bg-accent-amber text-base hover:bg-accent-amber/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export const ChatApp: BrightApp = {
  id: "chat",
  name: "Chat",
  icon: "message-square",
  defaultSize: { w: 500, h: 650 },
  minSize: { w: 350, h: 400 },
  component: Chat,
  category: "core",
};
```

**Step 2: Build and verify**

```bash
cd /Users/will/Appdev/bright/ui && bun run build
```

**Step 3: Commit**

```bash
git add ui/src/apps/chat/index.tsx
git commit -m "feat(ui): add Chat app for browser-based conversation"
```

---

### Task 8: App Registration + Sidebar Icons

**Files:**
- Modify: `ui/src/apps/index.ts`
- Modify: `ui/src/components/Sidebar.tsx`

Register the new apps and add their icons to the sidebar icon map.

**Step 1: Update app registration**

In `ui/src/apps/index.ts`:

```typescript
import type { AppRegistry } from "../core/app-registry";
import { DashboardApp } from "./dashboard";
import { ConfigApp } from "./config";
import { AgentMonitorApp } from "./agent-monitor";
import { ChatApp } from "./chat";

export function registerApps(registry: AppRegistry) {
  registry.register(DashboardApp);
  registry.register(AgentMonitorApp);
  registry.register(ChatApp);
  registry.register(ConfigApp);
}
```

**Step 2: Add icon to sidebar**

In `ui/src/components/Sidebar.tsx`, add `Activity` to the lucide import and to `ICON_MAP`:

```typescript
import {
  LayoutDashboard, Bot, MessageSquare, Wrench,
  Settings, ScrollText, Plug, Brain, ChevronRight, Activity
} from "lucide-react";
```

Add to `ICON_MAP`:

```typescript
const ICON_MAP: Record<string, typeof LayoutDashboard> = {
  "layout-dashboard": LayoutDashboard,
  "bot": Bot,
  "message-square": MessageSquare,
  "wrench": Wrench,
  "settings": Settings,
  "scroll-text": ScrollText,
  "plug": Plug,
  "brain": Brain,
  "activity": Activity,
};
```

**Step 3: Build and verify**

```bash
cd /Users/will/Appdev/bright/ui && bun run build
```

**Step 4: Commit**

```bash
git add ui/src/apps/index.ts ui/src/components/Sidebar.tsx
git commit -m "feat(ui): register Agent Monitor and Chat apps in sidebar"
```

---

### Task 9: API Client Type Updates

**Files:**
- Modify: `ui/src/lib/api.ts`

Ensure the tasks endpoint returns all the fields the Agent Monitor needs, and the new chat/cancel methods are typed correctly. This is a polish pass on the API client.

**Step 1: Update TasksResponse type**

In `ui/src/lib/api.ts`, update the `TasksResponse` interface to include all task fields:

```typescript
export interface TaskRow {
  id: string;
  status: string;
  description: string;
  result?: string;
  error?: string;
  iteration_count: number;
  max_iterations: number;
  token_usage: { input: number; output: number };
  created_at: string;
  started_at?: string;
  completed_at?: string;
  parent_task_id?: string;
}

export interface TasksResponse {
  tasks: TaskRow[];
}
```

Update the `getTasks` method to pass through all task fields (verify the backend `handleGetTasks` already returns these — it does, since it does `select("*")`).

**Step 2: Build and verify**

```bash
cd /Users/will/Appdev/bright/ui && bun run build
```

**Step 3: Commit**

```bash
git add ui/src/lib/api.ts
git commit -m "feat(ui): update API types for task monitoring"
```

---

### Task 10: Final Verification

**Step 1: Build the full UI**

```bash
cd /Users/will/Appdev/bright/ui && bun run build
```

Expected: Clean build, no errors.

**Step 2: Run tests**

```bash
cd /Users/will/Appdev/bright/ui && bunx vitest run
```

Expected: 15/15 tests passing (existing tests should not break).

**Step 3: Verify all apps register**

Check that the build output includes the new components by verifying the bundle size increased (should be ~250-270KB JS now vs 220KB before).

**Step 4: Manual smoke test (if bot is running)**

1. Restart the bot: `launchctl stop com.bright.relay && launchctl start com.bright.relay`
2. Visit `http://localhost:3000/admin`
3. Login with SERVER_API_KEY
4. Verify sidebar shows: Dashboard, Agent Monitor, Chat (core), Configuration (system)
5. Open Agent Monitor — should show task list (or "No active tasks")
6. Open Chat — should show empty state with "Send a message to Bright"
7. Send a chat message — should get a response
8. Trigger a research task via Telegram — Agent Monitor should update in real time

**Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "feat(ui): complete Phase 2 — Agent Monitor and Chat apps"
```

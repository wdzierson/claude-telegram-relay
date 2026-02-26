import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Code,
  Loader,
  MessageCircle,
  MessageSquare,
  XCircle,
} from "lucide-react";
import type { AppProps, BrightApp } from "../../core/app-registry";
import { api, type TaskRow } from "../../lib/api";
import { useTaskEvents, type TaskEvent } from "../../lib/ws";
import { GraphView } from "./GraphView";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TaskStatus = "running" | "queued" | "waiting_user" | "completed" | "failed" | "cancelled";

export interface IterationLogEntry {
  iteration: number;
  toolName: string | null;
  thoughtText: string | null;
  toolCalls: { name: string; inputPreview: string }[] | null;
  tokenUsage: { input: number; output: number };
  timestamp: string;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  running: "var(--color-status-live)",
  queued: "var(--color-status-idle)",
  waiting_user: "var(--color-status-warning)",
  completed: "var(--color-accent-active)",
  failed: "var(--color-status-error)",
  cancelled: "var(--color-status-idle)",
};

const ACTIVE_STATUSES = new Set<string>(["running", "queued", "waiting_user"]);

function statusColor(status: string): string {
  return STATUS_COLORS[status as TaskStatus] ?? "var(--color-status-idle)";
}

function StatusIcon({ status }: { status: string }) {
  const props = { size: 14, strokeWidth: 1.5 } as const;
  switch (status) {
    case "running":
      return <Loader {...props} className="animate-spin" style={{ color: statusColor(status) }} />;
    case "queued":
      return <Clock {...props} style={{ color: statusColor(status) }} />;
    case "completed":
      return <CheckCircle {...props} style={{ color: statusColor(status) }} />;
    case "failed":
      return <AlertTriangle {...props} style={{ color: statusColor(status) }} />;
    case "cancelled":
      return <XCircle {...props} style={{ color: statusColor(status) }} />;
    case "waiting_user":
      return <Clock {...props} style={{ color: statusColor(status) }} />;
    default:
      return <Activity {...props} style={{ color: statusColor(status) }} />;
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatElapsed(fromIso: string, toIso?: string): string {
  const start = new Date(fromIso).getTime();
  const end = toIso ? new Date(toIso).getTime() : Date.now();
  const diffSec = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ---------------------------------------------------------------------------
// Parse saved conversation_history into IterationLogEntry[]
// (used when a task was already running/complete before the page loaded)
// ---------------------------------------------------------------------------

function parseConversationHistory(
  history: { role: string; content: unknown }[]
): IterationLogEntry[] {
  const entries: IterationLogEntry[] = [];
  let iterNum = 0;

  for (const msg of history) {
    if (msg.role !== "assistant") continue;
    iterNum++;

    const content: { type: string; text?: string; name?: string; input?: unknown }[] =
      Array.isArray(msg.content)
        ? (msg.content as { type: string; text?: string; name?: string; input?: unknown }[])
        : typeof msg.content === "string"
        ? [{ type: "text", text: msg.content as string }]
        : [];

    const textBlocks = content.filter((b) => b.type === "text" && b.text);
    const toolBlocks = content.filter((b) => b.type === "tool_use" && b.name);

    const thoughtText = textBlocks.map((b) => b.text ?? "").join("\n").trim();
    const toolCalls = toolBlocks.map((b) => {
      const inputStr = JSON.stringify(b.input ?? {});
      return {
        name: b.name ?? "unknown",
        inputPreview: inputStr.length > 200 ? inputStr.slice(0, 200) + "..." : inputStr,
      };
    });

    entries.push({
      iteration: iterNum,
      toolName: toolBlocks.at(-1)?.name ?? null,
      thoughtText: thoughtText.slice(0, 500) || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
      tokenUsage: { input: 0, output: 0 },
      timestamp: "",
    });
  }

  return entries;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

// ---------------------------------------------------------------------------
// Filter Bar
// ---------------------------------------------------------------------------

type Filter = "active" | "all";

function FilterBar({
  filter,
  onFilterChange,
  runningCount,
}: {
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  runningCount: number;
}) {
  return (
    <div className="list-row-md flex items-center justify-between px-5 border-b border-border">
      <div className="flex gap-1.5">
        {(["active", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={"pill text-xs font-body font-medium uppercase tracking-wider transition-colors " + (filter === f ? "pill--active" : "pill--inactive")}
          >
            {f === "active" ? "Active" : "All"}
          </button>
        ))}
      </div>
      {runningCount > 0 && (
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-text-secondary">
          <span
            className="status-dot animate-pulse-subtle"
            style={{ backgroundColor: "var(--color-status-live)" }}
          />
          {runningCount} running
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transcript Step (single iteration)
// ---------------------------------------------------------------------------

function TranscriptStep({ entry, isLast }: { entry: IterationLogEntry; isLast: boolean }) {
  const [thoughtOpen, setThoughtOpen] = useState(false);
  const hasThought = entry.thoughtText && entry.thoughtText.length > 0;
  const hasTools = entry.toolCalls && entry.toolCalls.length > 0;
  const entryTokens = (entry.tokenUsage.input ?? 0) + (entry.tokenUsage.output ?? 0);

  return (
    <div className="flex gap-3">
      {/* Timeline gutter */}
      <div className="flex flex-col items-center shrink-0" style={{ width: 20 }}>
        <div
          className={"timeline-dot mt-1 " + (hasTools ? "timeline-dot--tool" : "timeline-dot--thought")}
        />
        {!isLast && (
          <div
            className="timeline-line flex-1 w-px mt-1"
          />
        )}
      </div>

      {/* Step content */}
      <div className="flex-1 min-w-0 pb-4">
        {/* Step header */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-mono font-medium" style={{ color: "var(--color-text-primary)" }}>
            Step {entry.iteration}
          </span>
          {hasTools ? (
            entry.toolCalls!.map((tc, i) => (
              <span
                key={i}
                className="badge-tool inline-flex items-center gap-1"
              >
                <Code size={9} strokeWidth={2} />
                {tc.name}
              </span>
            ))
          ) : (
            <span className="text-[10px] font-mono text-text-secondary">thinking</span>
          )}
          {entryTokens > 0 && (
            <span className="text-[10px] font-mono text-text-secondary">
              {formatTokens(entryTokens)}
            </span>
          )}
          {entry.timestamp && (
            <span className="text-[10px] font-mono text-text-secondary ml-auto shrink-0">
              {formatTime(entry.timestamp)}
            </span>
          )}
        </div>

        {/* Thought text (collapsible) */}
        {hasThought && (
          <div className="mt-1.5">
            <button
              className="flex items-center gap-1 text-[10px] font-body text-text-secondary hover:text-text-primary transition-colors"
              onClick={() => setThoughtOpen((p) => !p)}
            >
              {thoughtOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              <MessageSquare size={10} />
              Agent thoughts
            </button>
            {thoughtOpen && (
              <div
                className="panel-elevated mt-1 p-2.5 text-[11px] text-text-primary font-body leading-relaxed whitespace-pre-wrap overflow-y-auto"
                style={{ maxHeight: 160 }}
              >
                {entry.thoughtText}
              </div>
            )}
          </div>
        )}

        {/* Tool call details */}
        {hasTools && entry.toolCalls!.map((tc, i) => (
          <div
            key={i}
            className="panel-base mt-1.5 p-3 text-[10px] font-mono text-text-secondary leading-relaxed overflow-y-auto"
            style={{ maxHeight: 80 }}
          >
            <span style={{ color: "var(--color-accent-active)" }}>{tc.name}</span>
            {"("}
            <span className="text-text-secondary">{tc.inputPreview}</span>
            {")"}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task Detail (expanded)
// ---------------------------------------------------------------------------

function TaskDetail({ task, iterationLog }: { task: TaskRow; iterationLog: IterationLogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [detailView, setDetailView] = useState<"timeline" | "graph">("timeline");
  const progress =
    task.max_iterations > 0
      ? Math.min(100, Math.round((task.iteration_count / task.max_iterations) * 100))
      : 0;
  const totalTokens = (task.token_usage?.input ?? 0) + (task.token_usage?.output ?? 0);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [iterationLog.length]);

  return (
    <div className="px-5 py-5 space-y-4" style={{ background: "var(--color-base)" }}>
      {/* Meta row */}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <MetaItem label="Status" value={task.status} />
        <MetaItem label="ID" value={task.id.slice(0, 8)} />
        <MetaItem label="Created" value={formatTime(task.created_at)} />
        {task.started_at && <MetaItem label="Started" value={formatTime(task.started_at)} />}
        {task.completed_at && <MetaItem label="Completed" value={formatTime(task.completed_at)} />}
        {totalTokens > 0 && (
          <>
            <MetaItem label="Input" value={formatTokens(task.token_usage.input)} />
            <MetaItem label="Output" value={formatTokens(task.token_usage.output)} />
          </>
        )}
      </div>

      {/* Pending question */}
      {task.status === "waiting_user" && task.pending_question && (
        <div
          className="question-panel p-3 space-y-1"
        >
          <div
            className="flex items-center gap-1.5 text-[10px] font-body font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-status-warning)" }}
          >
            <MessageCircle size={12} strokeWidth={1.5} />
            Needs your input
          </div>
          <div className="text-xs text-text-primary leading-relaxed">
            {task.pending_question}
          </div>
        </div>
      )}

      {/* Progress bar */}
      {ACTIVE_STATUSES.has(task.status) && task.max_iterations > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-text-secondary">
            <span>Progress</span>
            <span>
              {task.iteration_count}/{task.max_iterations}
            </span>
          </div>
          <div
            className="h-1.5 w-full rounded-full overflow-hidden bg-elevated"
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: "var(--color-accent-active)",
              }}
            />
          </div>
        </div>
      )}

      {/* View toggle */}
      <div style={{ display: "flex", gap: 6, padding: "12px 0", borderBottom: "1px solid var(--color-border)" }}>
        <button
          className={`pill text-xs ${detailView === "timeline" ? "pill--active" : "pill--inactive"}`}
          onClick={() => setDetailView("timeline")}
        >
          Timeline
        </button>
        <button
          className={`pill text-xs ${detailView === "graph" ? "pill--active" : "pill--inactive"}`}
          onClick={() => setDetailView("graph")}
        >
          Graph
        </button>
      </div>

      {/* Transcript — timeline of iterations OR graph view */}
      {detailView === "timeline" ? (
        iterationLog.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary">
              Transcript
            </div>
            <div
              ref={scrollRef}
              className="overflow-y-auto pt-1"
              style={{ maxHeight: 320 }}
            >
              {iterationLog.map((entry, i) => (
                <TranscriptStep
                  key={i}
                  entry={entry}
                  isLast={i === iterationLog.length - 1}
                />
              ))}
            </div>
          </div>
        )
      ) : (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <GraphView
            iterationLog={iterationLog}
            taskStatus={task.status}
            taskDescription={task.description}
          />
        </div>
      )}

      {/* Result */}
      {task.status === "completed" && task.result && (
        <div className="space-y-2">
          <div className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary">
            Result
          </div>
          <div
            className="panel-elevated max-h-40 overflow-y-auto p-3 text-xs font-mono text-text-primary leading-relaxed whitespace-pre-wrap"
          >
            {task.result}
          </div>
        </div>
      )}

      {/* Error */}
      {task.status === "failed" && task.error && (
        <div className="space-y-2">
          <div className="text-[10px] font-body font-semibold uppercase tracking-widest text-status-error">
            Error
          </div>
          <div
            className="error-panel max-h-40 overflow-y-auto p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap text-text-primary"
          >
            {task.error}
          </div>
        </div>
      )}
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary">
        {label}
      </div>
      <div className="text-xs font-mono text-text-primary">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task Row
// ---------------------------------------------------------------------------

function TaskRowItem({
  task,
  isChild,
  expanded,
  onToggle,
  onCancel,
  onInterrupt,
  iterationLog,
}: {
  task: TaskRow;
  isChild: boolean;
  expanded: boolean;
  onToggle: () => void;
  onCancel: (id: string) => void;
  onInterrupt: (id: string) => void;
  iterationLog: IterationLogEntry[];
}) {
  const isActive = ACTIVE_STATUSES.has(task.status);
  const totalTokens = (task.token_usage?.input ?? 0) + (task.token_usage?.output ?? 0);
  const elapsed = formatElapsed(task.started_at ?? task.created_at, task.completed_at);
  const agentType = (task.metadata as Record<string, unknown>)?.agent_type as string | undefined;
  const priority = Number((task.metadata as Record<string, unknown>)?.priority) || 0;

  return (
    <div
      className="border-b border-border last:border-b-0"
      style={
        isChild
          ? {
              borderLeft: "2px solid var(--color-accent-active)",
              marginLeft: 16,
            }
          : undefined
      }
    >
      <div
        className="list-row flex items-center gap-3 cursor-pointer transition-colors hover:bg-white/5"
        style={{ paddingLeft: isChild ? 28 : 20, paddingRight: 20 }}
        onClick={onToggle}
      >
        {/* Status dot */}
        <span className="status-dot shrink-0" style={{ backgroundColor: statusColor(task.status) }} />

        {/* Status icon */}
        <span className="shrink-0">
          <StatusIcon status={task.status} />
        </span>

        {/* Description + badges */}
        <span className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-sm text-text-primary truncate">
            {truncate(task.description, 100)}
          </span>

          {/* Agent type badge */}
          {agentType && (
            <span className="badge badge-agent shrink-0">
              {agentType}
            </span>
          )}

          {/* Priority badge */}
          {priority > 0 && (
            <span className="badge badge-priority shrink-0">
              P{priority}
            </span>
          )}

          {/* Pending question indicator */}
          {task.status === "waiting_user" && task.pending_question && (
            <MessageCircle
              size={12}
              strokeWidth={1.5}
              className="shrink-0"
              style={{ color: "var(--color-status-warning)" }}
            />
          )}
        </span>

        {/* Iteration progress (active tasks) */}
        {isActive && task.max_iterations > 0 && (
          <span className="text-[10px] font-mono text-text-secondary shrink-0">
            {task.iteration_count}/{task.max_iterations}
          </span>
        )}

        {/* Token count */}
        {totalTokens > 0 && (
          <span className="text-[10px] font-mono text-text-secondary shrink-0">
            {formatTokens(totalTokens)}
          </span>
        )}

        {/* Elapsed time */}
        <span className="text-[10px] font-mono text-text-secondary shrink-0 w-14 text-right">
          {elapsed}
        </span>

        {/* Interrupt + Cancel buttons for active tasks */}
        {task.status === "running" && (
          <button
            className="p-1.5 shrink-0 text-text-secondary hover:text-status-warning transition-colors"
            title="Redirect task"
            onClick={(e) => {
              e.stopPropagation();
              onInterrupt(task.id);
            }}
          >
            <MessageCircle size={14} strokeWidth={1.5} />
          </button>
        )}
        {isActive && (
          <button
            className="p-1.5 shrink-0 text-text-secondary hover:text-status-error transition-colors"
            title="Cancel task"
            onClick={(e) => {
              e.stopPropagation();
              onCancel(task.id);
            }}
          >
            <XCircle size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {expanded && <TaskDetail task={task} iterationLog={iterationLog} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function AgentMonitor(_props: AppProps) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [filter, setFilter] = useState<Filter>("active");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [iterationLogs, setIterationLogs] = useState<Map<string, IterationLogEntry[]>>(new Map());
  const [interruptTarget, setInterruptTarget] = useState<string | null>(null);
  const [interruptMsg, setInterruptMsg] = useState("");
  // Initial fetch + polling fallback
  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getTasks(30);
        setTasks(data.tasks);
        setError("");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  // When a task is expanded with no live iteration log, load history from Supabase
  useEffect(() => {
    if (!expandedId) return;
    const existingLog = iterationLogs.get(expandedId) ?? [];
    if (existingLog.length > 0) return;
    const task = tasks.find((t) => t.id === expandedId);
    if (!task || !task.iteration_count) return;

    api.getTask(expandedId)
      .then((data) => {
        const history = data.task?.conversation_history;
        if (!history?.length) return;
        const parsed = parseConversationHistory(history);
        if (parsed.length === 0) return;
        setIterationLogs((prev) => {
          const next = new Map(prev);
          if ((next.get(expandedId) ?? []).length === 0) {
            next.set(expandedId, parsed);
          }
          return next;
        });
      })
      .catch(() => {}); // Silently ignore if Supabase not configured
  }, [expandedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time WebSocket updates
  const handleEvent = useCallback((event: TaskEvent) => {
    // Capture redirect events as log entries
    if (event.type === "task:interrupted" && event.interruptMessage) {
      setIterationLogs((prev) => {
        const next = new Map(prev);
        const entries = next.get(event.taskId) ?? [];
        next.set(event.taskId, [
          ...entries,
          {
            iteration: entries.length + 1,
            toolName: "↩ redirect",
            thoughtText: event.interruptMessage ?? null,
            toolCalls: null,
            tokenUsage: { input: 0, output: 0 },
            timestamp: event.timestamp,
          },
        ]);
        return next;
      });
    }

    // Capture iteration log entries with full detail
    if (event.type === "task:iteration" && event.iteration != null) {
      setIterationLogs((prev) => {
        const next = new Map(prev);
        const entries = next.get(event.taskId) ?? [];
        next.set(event.taskId, [
          ...entries,
          {
            iteration: event.iteration!,
            toolName: event.toolName ?? null,
            thoughtText: event.thoughtText ?? null,
            toolCalls: event.toolCalls ?? null,
            tokenUsage: event.tokenUsage ?? { input: 0, output: 0 },
            timestamp: event.timestamp,
          },
        ]);
        return next;
      });
    }

    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === event.taskId);

      // New task we haven't fetched yet — add a stub row
      if (idx === -1) {
        if (event.type === "task:status") {
          const stub: TaskRow = {
            id: event.taskId,
            status: event.status ?? "running",
            description: "",
            iteration_count: 0,
            max_iterations: 0,
            token_usage: { input: 0, output: 0 },
            created_at: event.timestamp,
            started_at: event.status === "running" ? event.timestamp : undefined,
          };
          return [stub, ...prev];
        }
        return prev;
      }

      const updated = [...prev];
      const task = { ...updated[idx] };

      if (event.status != null) task.status = event.status;
      if (event.iteration != null) task.iteration_count = event.iteration;
      if (event.tokenUsage) task.token_usage = event.tokenUsage;
      if (event.result !== undefined) task.result = event.result ?? undefined;
      if (event.error !== undefined) task.error = event.error ?? undefined;
      if (event.status === "completed" || event.status === "failed" || event.status === "cancelled") {
        task.completed_at = event.timestamp;
      }
      if (event.status === "running" && !task.started_at) {
        task.started_at = event.timestamp;
      }

      updated[idx] = task;
      return updated;
    });
  }, []);

  useTaskEvents(handleEvent);

  // Cancel handler
  const handleCancel = useCallback(async (taskId: string) => {
    try {
      await api.cancelTask(taskId);
    } catch {
      // Refresh on error to get current state
      const data = await api.getTasks(30);
      setTasks(data.tasks);
    }
  }, []);

  // Interrupt handler
  const handleInterrupt = useCallback((taskId: string) => {
    setInterruptTarget(taskId);
    setInterruptMsg("");
  }, []);

  // Build tree-ordered task list: parents followed by their children
  const orderedTasks = (() => {
    // Separate root tasks from children
    const roots: TaskRow[] = [];
    const childrenMap = new Map<string, TaskRow[]>();

    for (const t of tasks) {
      if (t.parent_task_id) {
        const siblings = childrenMap.get(t.parent_task_id) ?? [];
        siblings.push(t);
        childrenMap.set(t.parent_task_id, siblings);
      } else {
        roots.push(t);
      }
    }

    // Flatten: each root followed by its children
    const result: { task: TaskRow; isChild: boolean }[] = [];
    for (const root of roots) {
      result.push({ task: root, isChild: false });
      const children = childrenMap.get(root.id);
      if (children) {
        for (const child of children) {
          result.push({ task: child, isChild: true });
        }
      }
    }

    // Add orphan children (parent not in current set) at the end
    const rootIds = new Set(roots.map((r) => r.id));
    for (const [parentId, children] of childrenMap) {
      if (!rootIds.has(parentId)) {
        for (const child of children) {
          result.push({ task: child, isChild: true });
        }
      }
    }

    return result;
  })();

  // Filtered tasks with tree awareness
  const filteredTasks = (() => {
    if (filter === "all") return orderedTasks;

    // For "active" filter: show active tasks, and if a parent is active, show its children too
    const activeParentIds = new Set<string>();
    for (const { task } of orderedTasks) {
      if (!task.parent_task_id && ACTIVE_STATUSES.has(task.status)) {
        activeParentIds.add(task.id);
      }
    }

    return orderedTasks.filter(({ task }) => {
      if (ACTIVE_STATUSES.has(task.status)) return true;
      // Show child if its parent is active
      if (task.parent_task_id && activeParentIds.has(task.parent_task_id)) return true;
      return false;
    });
  })();

  const runningCount = tasks.filter((t) => t.status === "running").length;

  if (error) {
    return <div className="p-4 text-status-error text-sm">{error}</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <FilterBar filter={filter} onFilterChange={setFilter} runningCount={runningCount} />

      <div className="flex-1 overflow-y-auto">
        {filteredTasks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-text-secondary">
            {filter === "active" ? "No active tasks" : "No tasks yet"}
          </div>
        ) : (
          <div>
            {filteredTasks.map(({ task, isChild }) => (
              <TaskRowItem
                key={task.id}
                task={task}
                isChild={isChild}
                expanded={expandedId === task.id}
                onToggle={() => setExpandedId((prev) => (prev === task.id ? null : task.id))}
                onCancel={handleCancel}
                onInterrupt={handleInterrupt}
                iterationLog={iterationLogs.get(task.id) ?? []}
              />
            ))}
          </div>
        )}
      </div>

      {/* Interrupt / Redirect modal */}
      {interruptTarget && (
        <div
          className="modal-overlay"
          onClick={() => { setInterruptTarget(null); setInterruptMsg(""); }}
        >
          <div
            className="modal-content p-5 space-y-4"
            style={{ width: 384 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-medium text-text-primary">Redirect Task</div>
            <div className="text-xs text-text-secondary font-mono">{interruptTarget.substring(0, 8)}…</div>
            <textarea
              className="input w-full text-sm bg-elevated text-text-primary font-mono resize-none"
              rows={4}
              placeholder="Enter new instructions for the agent..."
              value={interruptMsg}
              onChange={(e) => setInterruptMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setInterruptTarget(null); setInterruptMsg(""); }
              }}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                className="btn-secondary text-sm"
                onClick={() => { setInterruptTarget(null); setInterruptMsg(""); }}
              >
                Cancel
              </button>
              <button
                className="btn-primary text-sm"
                disabled={!interruptMsg.trim()}
                style={{ opacity: interruptMsg.trim() ? 1 : 0.5 }}
                onClick={async () => {
                  const target = interruptTarget;
                  const msg = interruptMsg;
                  setInterruptTarget(null);
                  setInterruptMsg("");
                  await api.interruptTask(target, msg);
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// App Registration
// ---------------------------------------------------------------------------

export const AgentMonitorApp: BrightApp = {
  id: "agent-monitor",
  name: "Agent Monitor",
  icon: "activity",
  defaultSize: { w: 650, h: 500 },
  minSize: { w: 400, h: 300 },
  component: AgentMonitor,
  category: "core",
};

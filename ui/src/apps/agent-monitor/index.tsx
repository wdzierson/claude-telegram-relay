import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader,
  XCircle,
} from "lucide-react";
import type { AppProps, BrightApp } from "../../core/app-registry";
import { api, type TaskRow } from "../../lib/api";
import { useTaskEvents, type TaskEvent } from "../../lib/ws";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TaskStatus = "running" | "queued" | "waiting_user" | "completed" | "failed" | "cancelled";

const STATUS_COLORS: Record<TaskStatus, string> = {
  running: "var(--color-status-live)",
  queued: "var(--color-status-idle)",
  waiting_user: "var(--color-accent-amber)",
  completed: "var(--color-accent-copper)",
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
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
    <div className="flex items-center justify-between px-4 py-2 border-b border-border">
      <div className="flex gap-1">
        {(["active", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className="px-3 py-1 text-xs font-body font-medium uppercase tracking-wider rounded transition-colors"
            style={{
              background: filter === f ? "var(--color-elevated)" : "transparent",
              color: filter === f ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              border: filter === f ? "1px solid var(--color-border-active)" : "1px solid transparent",
              borderRadius: "4px",
            }}
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
// Task Detail (expanded)
// ---------------------------------------------------------------------------

function TaskDetail({ task }: { task: TaskRow }) {
  const progress =
    task.max_iterations > 0
      ? Math.min(100, Math.round((task.iteration_count / task.max_iterations) * 100))
      : 0;
  const totalTokens = (task.token_usage?.input ?? 0) + (task.token_usage?.output ?? 0);

  return (
    <div className="px-4 py-3 space-y-3" style={{ background: "var(--color-base)" }}>
      {/* Meta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <MetaItem label="Status" value={task.status} />
        <MetaItem label="ID" value={task.id.slice(0, 8)} />
        <MetaItem label="Created" value={formatTime(task.created_at)} />
        {task.started_at && <MetaItem label="Started" value={formatTime(task.started_at)} />}
        {task.completed_at && <MetaItem label="Completed" value={formatTime(task.completed_at)} />}
      </div>

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
            className="h-1.5 w-full rounded-full overflow-hidden"
            style={{ background: "var(--color-border)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: "var(--color-accent-amber)",
              }}
            />
          </div>
        </div>
      )}

      {/* Token details */}
      {totalTokens > 0 && (
        <div className="flex gap-4">
          <MetaItem label="Input tokens" value={formatTokens(task.token_usage.input)} />
          <MetaItem label="Output tokens" value={formatTokens(task.token_usage.output)} />
          <MetaItem label="Total" value={formatTokens(totalTokens)} />
        </div>
      )}

      {/* Result */}
      {task.status === "completed" && task.result && (
        <div className="space-y-1">
          <div className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary">
            Result
          </div>
          <div
            className="max-h-32 overflow-y-auto p-2 text-xs font-mono text-text-primary leading-relaxed whitespace-pre-wrap"
            style={{
              background: "var(--color-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "2px",
            }}
          >
            {task.result}
          </div>
        </div>
      )}

      {/* Error */}
      {task.status === "failed" && task.error && (
        <div className="space-y-1">
          <div className="text-[10px] font-body font-semibold uppercase tracking-widest text-status-error">
            Error
          </div>
          <div
            className="max-h-32 overflow-y-auto p-2 text-xs font-mono leading-relaxed whitespace-pre-wrap"
            style={{
              background: "rgba(184, 92, 92, 0.12)",
              border: "1px solid var(--color-status-error)",
              borderRadius: "2px",
              color: "var(--color-text-primary)",
            }}
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
  expanded,
  onToggle,
  onCancel,
}: {
  task: TaskRow;
  expanded: boolean;
  onToggle: () => void;
  onCancel: (id: string) => void;
}) {
  const isActive = ACTIVE_STATUSES.has(task.status);
  const totalTokens = (task.token_usage?.input ?? 0) + (task.token_usage?.output ?? 0);
  const elapsed = formatElapsed(task.started_at ?? task.created_at, task.completed_at);

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-colors hover:bg-surface/50"
        onClick={onToggle}
      >
        {/* Status dot */}
        <span className="status-dot shrink-0" style={{ backgroundColor: statusColor(task.status) }} />

        {/* Status icon */}
        <span className="shrink-0">
          <StatusIcon status={task.status} />
        </span>

        {/* Description */}
        <span className="text-sm text-text-primary truncate min-w-0 flex-1">
          {truncate(task.description, 100)}
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

        {/* Cancel button for active tasks */}
        {isActive && (
          <button
            className="p-0.5 shrink-0 text-text-secondary hover:text-status-error transition-colors"
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

      {expanded && <TaskDetail task={task} />}
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

  // Real-time WebSocket updates
  const handleEvent = useCallback((event: TaskEvent) => {
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

  // Filtered tasks
  const filteredTasks =
    filter === "active"
      ? tasks.filter((t) => ACTIVE_STATUSES.has(t.status))
      : tasks;

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
            {filteredTasks.map((task) => (
              <TaskRowItem
                key={task.id}
                task={task}
                expanded={expandedId === task.id}
                onToggle={() => setExpandedId((prev) => (prev === task.id ? null : task.id))}
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}
      </div>
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

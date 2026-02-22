import { useEffect, useState } from "react";
import { Activity, Clock, MessageSquare, Zap } from "lucide-react";
import type { BrightApp, AppProps } from "../../core/app-registry";
import { api, type StatusResponse, type TasksResponse, type MessagesResponse } from "../../lib/api";

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatusCard({ icon: Icon, label, value, color }: {
  icon: typeof Activity;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      className="flex items-center gap-3 p-3"
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "2px",
        background: "var(--color-elevated)",
      }}
    >
      <Icon size={16} strokeWidth={1.5} style={{ color: color || "var(--color-text-secondary)" }} />
      <div>
        <div className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary">
          {label}
        </div>
        <div className="font-mono text-sm text-text-primary">{value}</div>
      </div>
    </div>
  );
}

function DashboardContent(_props: AppProps) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [tasks, setTasks] = useState<TasksResponse["tasks"]>([]);
  const [messages, setMessages] = useState<MessagesResponse["messages"]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [s, t, m] = await Promise.all([
          api.getStatus(),
          api.getTasks(10),
          api.getMessages(10),
        ]);
        setStatus(s);
        setTasks(t.tasks);
        setMessages(m.messages);
      } catch (err: any) {
        setError(err.message);
      }
    };
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return <div className="p-4 text-status-error text-sm">{error}</div>;
  }

  return (
    <div className="p-4 space-y-5">
      {/* Status cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatusCard
          icon={Zap}
          label="Bot"
          value={status?.bot === "running" ? "Online" : "Offline"}
          color={status?.bot === "running" ? "var(--color-status-live)" : "var(--color-status-error)"}
        />
        <StatusCard
          icon={Clock}
          label="Uptime"
          value={status ? formatUptime(status.uptime) : "..."}
        />
        <StatusCard
          icon={MessageSquare}
          label="Memory"
          value={status?.memory || "..."}
          color={status?.memory === "connected" ? "var(--color-status-live)" : "var(--color-status-idle)"}
        />
      </div>

      {/* Active agents */}
      <section>
        <h3 className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary mb-2">
          AGENTS
        </h3>
        <div
          className="divide-y"
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "2px",
          }}
        >
          {tasks.filter((t) => ["queued", "running", "waiting_user"].includes(t.status)).length === 0 && (
            <div className="px-3 py-2 text-xs text-text-secondary">No active agents</div>
          )}
          {tasks
            .filter((t) => ["queued", "running", "waiting_user"].includes(t.status))
            .map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between px-3 py-2"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="status-dot"
                    style={{
                      backgroundColor:
                        task.status === "running"
                          ? "var(--color-status-live)"
                          : task.status === "waiting_user"
                          ? "var(--color-accent-amber)"
                          : "var(--color-status-idle)",
                    }}
                  />
                  <span className="text-sm text-text-primary truncate">
                    {task.description}
                  </span>
                </div>
                <span className="font-mono text-xs text-text-secondary shrink-0 ml-2">
                  {task.iteration_count}/{task.max_iterations}
                </span>
              </div>
            ))}
        </div>
      </section>

      {/* Recent tasks */}
      <section>
        <h3 className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary mb-2">
          RECENT TASKS
        </h3>
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "2px",
          }}
        >
          {tasks.filter((t) => ["completed", "failed"].includes(t.status)).length === 0 && (
            <div className="px-3 py-2 text-xs text-text-secondary">No recent tasks</div>
          )}
          {tasks
            .filter((t) => ["completed", "failed"].includes(t.status))
            .slice(0, 5)
            .map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between px-3 py-2 border-b last:border-b-0"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="status-dot"
                    style={{
                      backgroundColor:
                        task.status === "completed"
                          ? "var(--color-status-live)"
                          : "var(--color-status-error)",
                    }}
                  />
                  <span className="text-sm text-text-primary truncate">
                    {task.description}
                  </span>
                </div>
                <span className="font-mono text-xs text-text-secondary shrink-0 ml-2">
                  {new Date(task.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
        </div>
      </section>

      {/* Recent messages */}
      <section>
        <h3 className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary mb-2">
          RECENT
        </h3>
        <div className="space-y-1">
          {messages.slice(0, 8).map((msg) => (
            <div key={msg.id} className="flex items-start gap-2 py-1">
              <span className="font-mono text-[10px] text-text-secondary shrink-0 pt-0.5">
                {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span
                className="font-mono text-[10px] shrink-0 pt-0.5 w-10"
                style={{
                  color: msg.role === "user" ? "var(--color-accent-amber)" : "var(--color-text-secondary)",
                }}
              >
                {msg.role === "user" ? "You" : "Bright"}
              </span>
              <span className="text-sm text-text-primary truncate">
                {msg.content.slice(0, 120)}
                {msg.content.length > 120 ? "..." : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export const DashboardApp: BrightApp = {
  id: "dashboard",
  name: "Dashboard",
  icon: "layout-dashboard",
  defaultSize: { w: 800, h: 600 },
  minSize: { w: 400, h: 300 },
  component: DashboardContent,
  category: "core",
};

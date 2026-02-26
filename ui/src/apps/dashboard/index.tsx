import { useEffect, useState } from "react";
import { Activity, CheckCircle2, Clock, MessageSquare, Zap } from "lucide-react";
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
      className="card flex items-center gap-4 px-6 py-7"
    >
      <Icon size={16} strokeWidth={1.5} style={{ color: color || "var(--color-text-secondary)" }} />
      <div>
        <div className="text-[10px] font-body font-medium uppercase tracking-widest text-text-secondary">
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
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
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
    <div className="p-5 space-y-5 overflow-y-auto h-full">
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
        <div className="flex items-center gap-2 mt-1 mb-2 py-1.5">
          <Activity size={13} strokeWidth={1.5} style={{ color: "var(--color-accent-active)", flexShrink: 0 }} />
          <h3 className="section-label">Active Agents</h3>
        </div>
        <div className="card-bordered">
          {tasks.filter((t) => ["queued", "running", "waiting_user"].includes(t.status)).length === 0 ? (
            <div className="list-row-md flex items-center" style={{ paddingLeft: 20, paddingRight: 20 }}>
              <span className="text-xs text-text-secondary">No active agents</span>
            </div>
          ) : tasks
              .filter((t) => ["queued", "running", "waiting_user"].includes(t.status))
              .map((task) => (
                <div
                  key={task.id}
                  className="list-row flex items-center justify-between border-b last:border-b-0"
                  style={{ paddingLeft: 20, paddingRight: 20, borderColor: "var(--color-border)" }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="status-dot shrink-0"
                      style={{
                        backgroundColor:
                          task.status === "running" ? "var(--color-status-live)"
                          : task.status === "waiting_user" ? "var(--color-status-warning)"
                          : "var(--color-status-idle)",
                      }}
                    />
                    <span className="text-sm text-text-primary truncate">{task.description}</span>
                  </div>
                  <span className="font-mono text-xs text-text-secondary shrink-0 ml-3">
                    {task.iteration_count}/{task.max_iterations}
                  </span>
                </div>
              ))
          }
        </div>
      </section>

      {/* Recent tasks */}
      <section>
        <div className="flex items-center gap-2 mt-1 mb-2 py-1.5">
          <CheckCircle2 size={13} strokeWidth={1.5} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
          <h3 className="section-label">Recent Tasks</h3>
        </div>
        <div className="card-bordered">
          {tasks.filter((t) => ["completed", "failed"].includes(t.status)).length === 0 ? (
            <div className="list-row-md flex items-center" style={{ paddingLeft: 20, paddingRight: 20 }}>
              <span className="text-xs text-text-secondary">No recent tasks</span>
            </div>
          ) : tasks
              .filter((t) => ["completed", "failed"].includes(t.status))
              .slice(0, 5)
              .map((task) => (
                <div
                  key={task.id}
                  className="list-row flex items-center justify-between border-b last:border-b-0"
                  style={{ paddingLeft: 20, paddingRight: 20, borderColor: "var(--color-border)" }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="status-dot shrink-0"
                      style={{
                        backgroundColor:
                          task.status === "completed" ? "var(--color-status-live)" : "var(--color-status-error)",
                      }}
                    />
                    <span className="text-sm text-text-primary truncate">{task.description}</span>
                  </div>
                  <span className="font-mono text-xs text-text-secondary shrink-0 ml-3">
                    {new Date(task.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))
          }
        </div>
      </section>

      {/* Recent messages */}
      <section>
        <div className="flex items-center gap-2 mt-1 mb-2 py-1.5">
          <MessageSquare size={13} strokeWidth={1.5} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
          <h3 className="section-label">Recent Messages</h3>
        </div>
        <div className="card-bordered">
          {messages.slice(0, 8).map((msg) => (
            <div
              key={msg.id}
              className="list-row-md flex items-start gap-3 border-b last:border-b-0"
              style={{ paddingLeft: 20, paddingRight: 20, borderColor: "var(--color-border)" }}
            >
              <span className="font-mono text-[10px] text-text-secondary shrink-0 pt-px w-10">
                {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span
                className="font-mono text-[10px] shrink-0 pt-px w-8"
                style={{ color: msg.role === "user" ? "var(--color-accent-primary)" : "var(--color-text-secondary)" }}
              >
                {msg.role === "user" ? "You" : "AI"}
              </span>
              <span className="text-xs text-text-primary truncate">
                {msg.content.slice(0, 120)}{msg.content.length > 120 ? "…" : ""}
              </span>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="list-row-md flex items-center" style={{ paddingLeft: 20, paddingRight: 20 }}>
              <span className="text-xs text-text-secondary">No messages yet</span>
            </div>
          )}
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

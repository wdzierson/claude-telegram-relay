import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Loader,
  Plus,
  Puzzle,
  Search,
  Server,
  Shield,
  ShieldCheck,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import type { AppProps, BrightApp } from "../../core/app-registry";
import {
  api,
  type McpResponse,
  type McpCatalogResponse,
  type ToolsResponse,
} from "../../lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "servers" | "catalog" | "tools";

type McpServer = McpResponse["servers"][number];
type CatalogEntry = McpCatalogResponse["catalog"][number];
type ToolEntry = ToolsResponse["tools"][number];

// ---------------------------------------------------------------------------
// Tab Bar
// ---------------------------------------------------------------------------

const TABS: { key: Tab; label: string }[] = [
  { key: "servers", label: "Active Servers" },
  { key: "catalog", label: "Catalog" },
  { key: "tools", label: "Tools Browser" },
];

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div
      className="flex items-center gap-1.5 px-5 py-3 border-b"
      style={{ borderColor: "var(--color-border)" }}
    >
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className="px-3 py-1.5 text-xs font-body font-medium transition-colors"
          style={{
            background: active === t.key ? "var(--color-elevated)" : "transparent",
            color: active === t.key ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            border:
              active === t.key
                ? "1px solid var(--color-accent-active)"
                : "1px solid transparent",
            borderRadius: "var(--radius-pill)",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Restart Banner
// ---------------------------------------------------------------------------

function RestartBanner() {
  return (
    <div
      className="flex items-center gap-2 mx-4 mt-3 px-3 py-2 text-sm"
      style={{
        background: "var(--color-status-warning)",
        color: "var(--color-base)",
        borderRadius: "var(--radius-button)",
      }}
    >
      <AlertTriangle size={14} />
      Restart required for changes to take effect.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active Servers Tab
// ---------------------------------------------------------------------------

function ServerRow({
  server,
  expanded,
  onToggle,
  onRemove,
}: {
  server: McpServer;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="border-b last:border-b-0"
      style={{ borderColor: "var(--color-border)" }}
    >
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-white/5"
        onClick={onToggle}
      >
        {/* Status dot */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            flexShrink: 0,
            backgroundColor: server.connected
              ? "var(--color-status-live)"
              : "var(--color-text-secondary)",
          }}
        />

        {/* Expand chevron */}
        <span className="shrink-0" style={{ color: "var(--color-text-secondary)" }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        {/* Server name */}
        <span className="text-sm font-medium text-text-primary truncate min-w-0 flex-1">
          {server.name}
        </span>

        {/* Tool count badge */}
        <span
          className="text-[10px] font-mono px-2 py-0.5 shrink-0"
          style={{
            background: "var(--color-elevated)",
            color: "var(--color-text-secondary)",
            borderRadius: "var(--radius-pill)",
            border: "1px solid var(--color-border)",
          }}
        >
          {server.toolCount} tool{server.toolCount !== 1 ? "s" : ""}
        </span>

        {/* Remove button */}
        <button
          className="p-1 shrink-0 transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
          title="Remove server"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--color-status-error)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--color-text-secondary)")
          }
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Expanded tool list */}
      {expanded && (
        <div
          className="mx-4 mb-3 p-3 space-y-2"
          style={{
            background: "var(--color-glass)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid var(--color-glass-border)",
            borderRadius: "var(--radius-card)",
          }}
        >
          <div className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary mb-1.5">
            Command
          </div>
          <div
            className="px-2 py-1.5 text-xs font-mono text-text-primary"
            style={{
              background: "var(--color-elevated)",
              borderRadius: "var(--radius-button)",
              border: "1px solid var(--color-border)",
              wordBreak: "break-all",
            }}
          >
            {server.command} {server.args?.join(" ") ?? ""}
          </div>

          {server.tools.length > 0 && (
            <>
              <div className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary mt-3 mb-1.5">
                Tools
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {server.tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="flex items-start gap-2 px-2 py-1.5"
                    style={{
                      background: "var(--color-base)",
                      borderRadius: "var(--radius-button)",
                    }}
                  >
                    <Wrench
                      size={12}
                      className="shrink-0 mt-0.5"
                      style={{ color: "var(--color-accent-active)" }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-text-primary">{tool.name}</div>
                      {tool.description && (
                        <div className="text-[11px] text-text-secondary mt-0.5 leading-snug">
                          {tool.description}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ActiveServersTab({
  servers,
  loading,
  restartNeeded,
  onRemoveServer,
}: {
  servers: McpServer[];
  loading: boolean;
  restartNeeded: boolean;
  onRemoveServer: (name: string) => void;
}) {
  const [expandedName, setExpandedName] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary">
        <Loader size={18} className="animate-spin mr-2" />
        <span className="text-sm">Loading servers...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {restartNeeded && <RestartBanner />}

      <div className="flex-1 overflow-y-auto mt-1">
        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-secondary gap-2">
            <Server size={24} style={{ color: "var(--color-text-secondary)" }} />
            <span className="text-sm">No MCP servers configured</span>
            <span className="text-xs">Add servers from the Catalog tab</span>
          </div>
        ) : (
          servers.map((server) => (
            <ServerRow
              key={server.name}
              server={server}
              expanded={expandedName === server.name}
              onToggle={() =>
                setExpandedName((prev) => (prev === server.name ? null : server.name))
              }
              onRemove={() => onRemoveServer(server.name)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Catalog Tab
// ---------------------------------------------------------------------------

function EnvVarModal({
  entry,
  onSubmit,
  onCancel,
}: {
  entry: CatalogEntry;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const key of entry.envVars ?? []) init[key] = "";
    return init;
  });

  const allFilled = Object.values(values).every((v) => v.trim().length > 0);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onCancel}
    >
      <div
        className="p-5 space-y-4"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-glass-border)",
          borderRadius: "var(--radius-card)",
          width: 420,
          maxWidth: "90vw",
          boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">
            Configure {entry.name}
          </h3>
          <button
            className="p-1 transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
            onClick={onCancel}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--color-text-primary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--color-text-secondary)")
            }
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-text-secondary leading-relaxed">
          This server requires environment variables. Enter the values below:
        </p>

        <div className="space-y-3">
          {(entry.envVars ?? []).map((key) => (
            <div key={key}>
              <label className="block text-[10px] font-mono font-semibold uppercase tracking-widest text-text-secondary mb-1">
                {key}
              </label>
              <input
                type="text"
                value={values[key] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [key]: e.target.value }))
                }
                placeholder={`Enter ${key}`}
                className="w-full px-2.5 py-1.5 font-mono text-xs bg-elevated text-text-primary placeholder:text-text-secondary/50 outline-none focus:border-accent-active transition-colors"
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-input)",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "var(--color-accent-active)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "var(--color-border)")
                }
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-button)",
              background: "transparent",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(values)}
            disabled={!allFilled}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: allFilled
                ? "var(--color-accent-primary)"
                : "var(--color-elevated)",
              color: allFilled ? "var(--color-base)" : "var(--color-text-secondary)",
              borderRadius: "var(--radius-button)",
              border: "1px solid transparent",
              opacity: allFilled ? 1 : 0.6,
              cursor: allFilled ? "pointer" : "not-allowed",
            }}
          >
            <Plus size={12} />
            Add Server
          </button>
        </div>
      </div>
    </div>
  );
}

function CatalogCard({
  entry,
  installed,
  onAdd,
}: {
  entry: CatalogEntry;
  installed: boolean;
  onAdd: (entry: CatalogEntry) => void;
}) {
  return (
    <div
      className="p-4 flex flex-col gap-2.5"
      style={{
        background: "var(--color-glass)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid var(--color-glass-border)",
        borderRadius: "var(--radius-card)",
        opacity: installed ? 0.6 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">{entry.name}</div>
          <div className="text-xs text-text-secondary mt-0.5 leading-snug line-clamp-2">
            {entry.description}
          </div>
        </div>
        {installed ? (
          <span
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium shrink-0"
            style={{
              background: "var(--color-elevated)",
              color: "var(--color-accent-active)",
              borderRadius: "var(--radius-pill)",
              border: "1px solid var(--color-border)",
            }}
          >
            <Check size={10} />
            Installed
          </span>
        ) : (
          <button
            onClick={() => onAdd(entry)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium shrink-0 transition-colors"
            style={{
              background: "var(--color-accent-primary)",
              color: "var(--color-base)",
              borderRadius: "var(--radius-pill)",
              border: "1px solid transparent",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--color-accent-active)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--color-accent-primary)")
            }
          >
            <Plus size={10} />
            Add
          </button>
        )}
      </div>

      {entry.envVars && entry.envVars.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {entry.envVars.map((v) => (
            <span
              key={v}
              className="text-[9px] font-mono px-1.5 py-0.5"
              style={{
                background: "var(--color-elevated)",
                color: "var(--color-text-secondary)",
                borderRadius: "var(--radius-button)",
                border: "1px solid var(--color-border)",
              }}
            >
              {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CatalogTab({
  catalog,
  installedNames,
  loading,
  onAddServer,
}: {
  catalog: CatalogEntry[];
  installedNames: Set<string>;
  loading: boolean;
  onAddServer: (entry: CatalogEntry, envValues?: Record<string, string>) => void;
}) {
  const [modalEntry, setModalEntry] = useState<CatalogEntry | null>(null);

  const handleAdd = useCallback(
    (entry: CatalogEntry) => {
      if (entry.envVars && entry.envVars.length > 0) {
        setModalEntry(entry);
      } else {
        onAddServer(entry);
      }
    },
    [onAddServer]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary">
        <Loader size={18} className="animate-spin mr-2" />
        <span className="text-sm">Loading catalog...</span>
      </div>
    );
  }

  if (catalog.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-secondary gap-2">
        <Puzzle size={24} style={{ color: "var(--color-text-secondary)" }} />
        <span className="text-sm">No catalog entries available</span>
      </div>
    );
  }

  return (
    <>
      <div
        className="grid gap-4 p-5 overflow-y-auto"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
      >
        {catalog.map((entry) => (
          <CatalogCard
            key={entry.name}
            entry={entry}
            installed={installedNames.has(entry.name)}
            onAdd={handleAdd}
          />
        ))}
      </div>

      {modalEntry && (
        <EnvVarModal
          entry={modalEntry}
          onSubmit={(values) => {
            onAddServer(modalEntry, values);
            setModalEntry(null);
          }}
          onCancel={() => setModalEntry(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tools Browser Tab
// ---------------------------------------------------------------------------

function ScopeBadge({ scope }: { scope: string }) {
  const colors: Record<string, string> = {
    chat: "var(--color-accent-active)",
    background: "var(--color-status-warning)",
    both: "var(--color-status-info)",
  };
  return (
    <span
      className="text-[9px] font-mono px-1.5 py-0.5 shrink-0"
      style={{
        border: `1px solid ${colors[scope] ?? "var(--color-border)"}`,
        color: colors[scope] ?? "var(--color-text-secondary)",
        borderRadius: "var(--radius-pill)",
      }}
    >
      {scope}
    </span>
  );
}

function ApprovalBadge({ approval }: { approval: string }) {
  const isAuto = approval === "auto" || approval === "always";
  return (
    <span
      className="flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 shrink-0"
      style={{
        border: `1px solid ${isAuto ? "var(--color-status-live)" : "var(--color-status-warning)"}`,
        color: isAuto ? "var(--color-status-live)" : "var(--color-status-warning)",
        borderRadius: "var(--radius-pill)",
      }}
    >
      {isAuto ? <ShieldCheck size={9} /> : <Shield size={9} />}
      {approval}
    </span>
  );
}

function ToolsBrowserTab({
  tools,
  loading,
}: {
  tools: ToolEntry[];
  loading: boolean;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return tools;
    const q = search.toLowerCase();
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }, [tools, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ToolEntry[]>();
    for (const tool of filtered) {
      const cat = tool.category || "uncategorized";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(tool);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary">
        <Loader size={18} className="animate-spin mr-2" />
        <span className="text-sm">Loading tools...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-5 py-3">
        <div
          className="flex items-center gap-2.5 px-3 py-2"
          style={{
            background: "var(--color-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-input)",
          }}
        >
          <Search size={14} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools..."
            className="w-full bg-transparent text-xs font-body text-text-primary placeholder:text-text-secondary/50 outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ color: "var(--color-text-secondary)", flexShrink: 0 }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Tool list */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-5">
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-secondary gap-1">
            <Wrench size={20} style={{ color: "var(--color-text-secondary)" }} />
            <span className="text-sm">
              {tools.length === 0 ? "No tools available" : "No tools match your search"}
            </span>
          </div>
        ) : (
          grouped.map(([category, categoryTools]) => (
            <section key={category}>
              <h3 className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary mb-2">
                {category}
                <span
                  className="ml-2 font-mono"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  ({categoryTools.length})
                </span>
              </h3>
              <div
                style={{
                  border: "1px solid var(--color-glass-border)",
                  borderRadius: "var(--radius-card)",
                  overflow: "hidden",
                }}
              >
                {categoryTools.map((tool, i) => (
                  <div
                    key={tool.name}
                    className="flex items-start gap-3 px-4 py-3"
                    style={{
                      borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
                    }}
                  >
                    <Wrench
                      size={12}
                      className="shrink-0 mt-0.5"
                      style={{ color: "var(--color-accent-active)" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-text-primary">
                          {tool.name}
                        </span>
                        <ScopeBadge scope={tool.scope} />
                        <ApprovalBadge approval={tool.approval} />
                      </div>
                      {tool.description && (
                        <div className="text-[11px] text-text-secondary mt-0.5 leading-snug">
                          {tool.description}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function McpManager(_props: AppProps) {
  const [tab, setTab] = useState<Tab>("servers");
  const [servers, setServers] = useState<McpServer[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [tools, setTools] = useState<ToolEntry[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingTools, setLoadingTools] = useState(true);
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [error, setError] = useState("");

  // --- Data fetching ---

  const fetchServers = useCallback(async () => {
    try {
      const data = await api.getMcp();
      setServers(data.servers);
      setError("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingServers(false);
    }
  }, []);

  const fetchCatalog = useCallback(async () => {
    try {
      const data = await api.getMcpCatalog();
      setCatalog(data.catalog);
    } catch {
      // Non-critical: catalog may not be available
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  const fetchTools = useCallback(async () => {
    try {
      const data = await api.getTools();
      setTools(data.tools);
    } catch {
      // Non-critical
    } finally {
      setLoadingTools(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
    fetchCatalog();
    fetchTools();
  }, [fetchServers, fetchCatalog, fetchTools]);

  // --- Server mutations ---

  const installedNames = useMemo(
    () => new Set(servers.map((s) => s.name)),
    [servers]
  );

  const handleRemoveServer = useCallback(
    async (name: string) => {
      const updated = servers.filter((s) => s.name !== name);
      try {
        const res = await api.putMcp(
          updated.map((s) => ({
            name: s.name,
            command: s.command,
            args: s.args,
          }))
        );
        setServers(updated);
        if (res.restartRequired) setRestartNeeded(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [servers]
  );

  const handleAddServer = useCallback(
    async (entry: CatalogEntry, envValues?: Record<string, string>) => {
      // Build args, substituting env var placeholders
      let args = [...entry.args];
      if (envValues) {
        args = args.map((arg) => {
          for (const [key, val] of Object.entries(envValues)) {
            arg = arg.replace(`\${${key}}`, val).replace(`$${key}`, val);
          }
          return arg;
        });
      }

      const newServer = {
        name: entry.name,
        command: entry.command,
        args,
      };

      const updated = [
        ...servers.map((s) => ({ name: s.name, command: s.command, args: s.args })),
        newServer,
      ];

      try {
        const res = await api.putMcp(updated);
        if (res.restartRequired) setRestartNeeded(true);
        // Refresh server list to get connection status
        await fetchServers();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [servers, fetchServers]
  );

  // --- Render ---

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <TabBar active={tab} onChange={setTab} />
        <div className="flex items-center justify-center flex-1 p-4">
          <div
            className="flex items-center gap-2 px-3 py-2 text-sm"
            style={{
              background: "rgba(184, 92, 92, 0.12)",
              border: "1px solid var(--color-status-error)",
              borderRadius: "var(--radius-button)",
              color: "var(--color-status-error)",
            }}
          >
            <AlertTriangle size={14} />
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TabBar active={tab} onChange={setTab} />

      <div className="flex-1 overflow-hidden">
        {tab === "servers" && (
          <ActiveServersTab
            servers={servers}
            loading={loadingServers}
            restartNeeded={restartNeeded}
            onRemoveServer={handleRemoveServer}
          />
        )}
        {tab === "catalog" && (
          <CatalogTab
            catalog={catalog}
            installedNames={installedNames}
            loading={loadingCatalog}
            onAddServer={handleAddServer}
          />
        )}
        {tab === "tools" && (
          <ToolsBrowserTab tools={tools} loading={loadingTools} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App Registration
// ---------------------------------------------------------------------------

export const McpManagerApp: BrightApp = {
  id: "mcp-manager",
  name: "MCP Manager",
  icon: "puzzle",
  defaultSize: { w: 700, h: 550 },
  minSize: { w: 500, h: 400 },
  component: McpManager,
  category: "tools",
};

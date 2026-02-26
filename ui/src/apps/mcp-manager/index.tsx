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
      className="flex items-center gap-1.5 px-5 py-4 border-b border-border"
    >
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={"pill text-xs font-body font-medium transition-colors " + (active === t.key ? "pill--active" : "pill--inactive")}
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
      className="banner-warning flex items-center gap-2 mx-4 mt-3 text-sm"
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
      className="border-b border-border last:border-b-0"
    >
      {/* Header row */}
      <div
        className="list-row flex items-center gap-3 cursor-pointer transition-colors hover:bg-white/5"
        style={{ paddingLeft: 20, paddingRight: 20 }}
        onClick={onToggle}
      >
        {/* Status dot */}
        <span
          className={"status-dot " + (server.connected ? "status-dot-live" : "status-dot-idle")}
        />

        {/* Expand chevron */}
        <span className="shrink-0 text-text-secondary">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        {/* Server name */}
        <span className="text-sm font-medium text-text-primary truncate min-w-0 flex-1">
          {server.name}
        </span>

        {/* Tool count badge */}
        <span
          className="badge panel-elevated text-[10px] font-mono px-2 py-0.5 shrink-0 text-text-secondary"
        >
          {server.toolCount} tool{server.toolCount !== 1 ? "s" : ""}
        </span>

        {/* Remove button */}
        <button
          className="p-1.5 shrink-0 transition-colors"
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
          className="card mx-5 mb-4 p-4 space-y-3"
        >
          <div className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary mb-4">
            Command
          </div>
          <div
            className="panel-elevated px-3 py-2.5 text-xs font-mono text-text-secondary"
            style={{ wordBreak: "break-all" }}
          >
            {server.command} {server.args?.join(" ") ?? ""}
          </div>

          {server.tools.length > 0 && (
            <>
              <div className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary mt-3 mb-3">
                Tools
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {server.tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="list-row-md flex items-start gap-2 bg-base rounded-md px-3"
                  >
                    <Wrench
                      size={12}
                      className="shrink-0 mt-0.5 text-accent-active"
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
            <Server size={24} className="text-text-secondary" />
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
    for (const ev of entry.envVars ?? []) init[ev.key] = "";
    return init;
  });

  // Only required vars must be filled
  const requiredKeys = (entry.envVars ?? []).filter((ev) => ev.required).map((ev) => ev.key);
  const allFilled = requiredKeys.length === 0
    ? Object.values(values).every((v) => v.trim().length > 0)
    : requiredKeys.every((k) => values[k]?.trim().length > 0);

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
    >
      <div
        className="modal-content p-5 space-y-4"
        style={{ width: 420, maxWidth: "90vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">
            Configure {entry.name}
          </h3>
          <button
            className="p-1.5 transition-colors"
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
          {(entry.envVars ?? []).map((ev) => (
            <div key={ev.key}>
              <label className="block text-[10px] font-mono font-semibold uppercase tracking-widest text-text-secondary mb-1">
                {ev.key}
                {!ev.required && (
                  <span className="ml-1 font-normal normal-case tracking-normal opacity-50">(optional)</span>
                )}
              </label>
              {ev.description && (
                <p className="text-[10px] text-text-secondary mb-1 leading-snug">{ev.description}</p>
              )}
              <input
                type="text"
                value={values[ev.key] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [ev.key]: e.target.value }))
                }
                placeholder={ev.key}
                className="input w-full px-2.5 py-1.5 font-mono text-xs bg-elevated text-text-primary placeholder:text-text-secondary/50 outline-none transition-colors"
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
            className="btn-secondary text-xs"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(values)}
            disabled={!allFilled}
            className="btn-primary flex items-center gap-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed"
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
      className="card p-5 flex flex-col gap-2.5"
      style={{ opacity: installed ? 0.6 : 1 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">{entry.name}</div>
          <div className="text-xs text-text-secondary mt-0.5 leading-snug line-clamp-2">
            {entry.description}
          </div>
        </div>
        {installed ? (
          <span className="badge badge-tool flex items-center gap-1 shrink-0">
            <Check size={10} />
            Installed
          </span>
        ) : (
          <button
            onClick={() => onAdd(entry)}
            className="badge flex items-center gap-1 shrink-0 cursor-pointer transition-opacity hover:opacity-80"
            style={{
              background: "rgba(255, 107, 138, 0.12)",
              color: "var(--color-accent-primary)",
              border: "1px solid rgba(255, 107, 138, 0.25)",
            }}
          >
            <Plus size={10} />
            Add
          </button>
        )}
      </div>

      {entry.envVars && entry.envVars.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {entry.envVars.map((ev) => (
            <span
              key={ev.key}
              className="panel-elevated text-[9px] font-mono px-1.5 py-0.5"
              style={{ color: ev.required ? "var(--color-text-secondary)" : "var(--color-status-idle)" }}
              title={ev.description}
            >
              {ev.key}
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
        <Puzzle size={24} className="text-text-secondary" />
        <span className="text-sm">No catalog entries available</span>
      </div>
    );
  }

  return (
    <>
      <div className="h-full overflow-y-auto">
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            padding: "20px 20px 20px 20px",
          }}
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
      <div className="px-5 py-4">
        <div
          className="panel-elevated flex items-center gap-2.5 px-3 py-2.5"
        >
          <Search size={14} className="text-text-secondary shrink-0" />
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
              className="text-text-secondary shrink-0"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Tool list */}
      <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-6">
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-secondary gap-1">
            <Wrench size={20} className="text-text-secondary" />
            <span className="text-sm">
              {tools.length === 0 ? "No tools available" : "No tools match your search"}
            </span>
          </div>
        ) : (
          grouped.map(([category, categoryTools]) => (
            <section key={category}>
              <h3 className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary mb-4">
                {category}
                <span
                  className="ml-2 font-mono text-text-secondary"
                >
                  ({categoryTools.length})
                </span>
              </h3>
              <div
                className="card-bordered"
              >
                {categoryTools.map((tool, i) => (
                  <div
                    key={tool.name}
                    className="list-row flex items-start gap-3 px-5"
                    style={{
                      borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
                    }}
                  >
                    <Wrench
                      size={12}
                      className="shrink-0 mt-0.5 text-accent-active"
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
            className="banner-error flex items-center gap-2 px-3 py-2 text-sm"
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

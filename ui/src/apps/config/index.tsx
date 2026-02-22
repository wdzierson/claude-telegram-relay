import { useEffect, useState } from "react";
import { Save, Eye, EyeOff, AlertTriangle } from "lucide-react";
import type { BrightApp, AppProps } from "../../core/app-registry";
import { api, type ConfigResponse } from "../../lib/api";

function ConfigContent(_props: AppProps) {
  const [sections, setSections] = useState<ConfigResponse["sections"]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getConfig().then((data) => setSections(data.sections)).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const handleSave = async () => {
    const updates = Object.entries(edits).map(([key, value]) => ({ key, value }));
    if (updates.length === 0) return;

    setSaving(true);
    try {
      const res = await api.putConfig(updates);
      if (res.restartRequired) setRestartNeeded(true);
      setEdits({});
      const data = await api.getConfig();
      setSections(data.sections);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const getValue = (key: string, originalValue: string) => {
    if (key in edits) return edits[key];
    return originalValue;
  };

  if (error) {
    return <div className="p-4 text-status-error text-sm">{error}</div>;
  }

  return (
    <div className="p-4 space-y-4">
      {restartNeeded && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-sm"
          style={{
            background: "var(--color-accent-copper)",
            color: "var(--color-base)",
            borderRadius: "2px",
          }}
        >
          <AlertTriangle size={14} />
          Restart required for changes to take effect.
        </div>
      )}

      {Object.keys(edits).length > 0 && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors"
          style={{
            background: "var(--color-accent-amber)",
            color: "var(--color-base)",
            borderRadius: "6px",
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Save size={14} />
          {saving ? "Saving..." : `Save ${Object.keys(edits).length} change${Object.keys(edits).length !== 1 ? "s" : ""}`}
        </button>
      )}

      {sections.map(({ section, vars }) => (
        <section key={section}>
          <h3 className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary mb-2">
            {section}
          </h3>
          <div
            className="divide-y"
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "2px",
            }}
          >
            {vars.map(({ key, value, masked, active }) => (
              <div
                key={key}
                className="flex items-center gap-3 px-3 py-2"
                style={{ borderColor: "var(--color-border)" }}
              >
                <span className="font-mono text-xs text-text-secondary w-56 shrink-0 truncate">
                  {key}
                </span>
                <div className="flex-1 flex items-center gap-1">
                  <input
                    type={masked && !revealed.has(key) ? "password" : "text"}
                    value={getValue(key, value)}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={active ? "" : "(not set)"}
                    className="w-full px-2 py-1 font-mono text-xs bg-base border rounded text-text-primary placeholder:text-text-secondary/50 outline-none focus:border-accent-amber transition-colors"
                    style={{
                      borderColor: key in edits ? "var(--color-accent-amber)" : "var(--color-border)",
                      borderRadius: "4px",
                    }}
                  />
                  {masked && (
                    <button
                      className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                      onClick={() =>
                        setRevealed((prev) => {
                          const next = new Set(prev);
                          next.has(key) ? next.delete(key) : next.add(key);
                          return next;
                        })
                      }
                    >
                      {revealed.has(key) ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export const ConfigApp: BrightApp = {
  id: "config",
  name: "Configuration",
  icon: "settings",
  defaultSize: { w: 700, h: 550 },
  minSize: { w: 400, h: 300 },
  component: ConfigContent,
  category: "custom",
};

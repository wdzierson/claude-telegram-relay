import { useEffect, useState } from "react";
import { Zap, LogOut } from "lucide-react";
import { clearApiKey } from "../lib/auth";

export function TopBar() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="flex items-center justify-between px-4 shrink-0 select-none"
      style={{
        height: 32,
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center gap-2">
        <Zap size={14} strokeWidth={1.5} className="text-accent-amber" />
        <span className="font-mono text-xs font-medium text-text-primary">
          Bright OS
        </span>
      </div>

      <div className="flex items-center gap-4">
        <span className="font-mono text-xs text-text-secondary">
          {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <button
          className="p-1 rounded hover:bg-elevated transition-colors"
          onClick={() => {
            clearApiKey();
            window.location.reload();
          }}
          title="Sign out"
        >
          <LogOut size={12} className="text-text-secondary" />
        </button>
      </div>
    </div>
  );
}

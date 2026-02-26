import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { clearApiKey } from "../lib/auth";

export function TopBar() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="topbar flex items-center justify-between px-4 shrink-0 select-none">
      {/* Left: Branding */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
          style={{ background: "var(--color-accent-primary)", opacity: 0.9 }}
        >
          <span style={{ fontSize: 11, color: "#fff", fontWeight: 700, lineHeight: 1 }}>B</span>
        </div>
        <span
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}
        >
          Bright OS
        </span>
      </div>

      {/* Right: Clock + logout */}
      <div className="flex items-center gap-3">
        <span
          className="font-mono text-xs"
          style={{ color: "var(--color-text-secondary)", letterSpacing: "0.02em" }}
        >
          {time.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
          &ensp;
          {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>

        <button
          className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-elevated"
          onClick={() => { clearApiKey(); window.location.reload(); }}
          title="Sign out"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <LogOut size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

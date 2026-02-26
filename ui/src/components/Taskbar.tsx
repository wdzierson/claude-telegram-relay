import {
  LayoutDashboard, Bot, MessageSquare, Wrench,
  Settings, ScrollText, Plug, Brain, Activity, Puzzle
} from "lucide-react";
import { useWindowStore } from "../stores/window-store";

const ICON_MAP: Record<string, typeof LayoutDashboard> = {
  dashboard:     LayoutDashboard,
  chat:          MessageSquare,
  "agent-monitor": Activity,
  "mcp-manager": Puzzle,
  config:        Settings,
  logs:          ScrollText,
  memory:        Brain,
  agents:        Bot,
  tools:         Wrench,
  integrations:  Plug,
};

export function Taskbar() {
  const windows     = useWindowStore((s) => s.windows);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const closeWindow = useWindowStore((s) => s.closeWindow);

  const windowList = Object.values(windows);
  const topZIndex  = windowList.length > 0
    ? Math.max(...windowList.map((w) => w.zIndex))
    : 0;

  return (
    <div className="taskbar flex items-center px-4 shrink-0" style={{ gap: 4 }}>
      {/* Window buttons */}
      <div className="flex items-center gap-1 flex-1 overflow-x-auto" style={{ minWidth: 0 }}>
        {windowList.map((win) => {
          const isActive    = win.zIndex === topZIndex && !win.isMinimized;
          const AppIcon     = ICON_MAP[win.appId] ?? LayoutDashboard;

          return (
            <button
              key={win.id}
              className={"taskbar-btn " + (isActive ? "taskbar-btn--active" : "")}
              style={{ opacity: win.isMinimized ? 0.45 : 1 }}
              onClick={() => focusWindow(win.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                closeWindow(win.id);
              }}
              title={`${win.title} (right-click to close)`}
            >
              <AppIcon
                size={13}
                strokeWidth={1.5}
                style={{
                  color: isActive
                    ? "var(--color-accent-active)"
                    : "var(--color-text-secondary)",
                  flexShrink: 0,
                }}
              />
              <span className="truncate text-xs" style={{ maxWidth: 110 }}>
                {win.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* Right — window count */}
      {windowList.length > 0 && (
        <div
          className="text-[11px] shrink-0 font-mono"
          style={{ color: "var(--color-text-secondary)", paddingLeft: 8 }}
        >
          {windowList.length}w
        </div>
      )}
    </div>
  );
}

import { useWindowStore } from "../stores/window-store";

export function Taskbar() {
  const windows = useWindowStore((s) => s.windows);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const closeWindow = useWindowStore((s) => s.closeWindow);

  const windowList = Object.values(windows);
  const topZIndex = windowList.length > 0 ? Math.max(...windowList.map((w) => w.zIndex)) : 0;

  return (
    <div
      className="flex items-center gap-1 px-3 border-t shrink-0"
      style={{
        height: 36,
        borderColor: "var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      {/* Window pills */}
      <div className="flex items-center gap-1 flex-1 overflow-x-auto">
        {windowList.map((win) => {
          const isActive = win.zIndex === topZIndex && !win.isMinimized;
          return (
            <button
              key={win.id}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono transition-colors relative ${
                isActive
                  ? "text-text-primary bg-elevated"
                  : "text-text-secondary hover:text-text-primary hover:bg-elevated/50"
              } ${win.isMinimized ? "opacity-50" : ""}`}
              onClick={() => focusWindow(win.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                closeWindow(win.id);
              }}
              title={`${win.title} (right-click to close)`}
            >
              <span className="truncate max-w-[120px]">{win.title}</span>
              {isActive && (
                <span
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-6 rounded-full"
                  style={{ background: "var(--color-accent-amber)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Right side stats */}
      <div className="flex items-center gap-3 text-xs text-text-secondary font-mono">
        <span>{windowList.length} window{windowList.length !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}

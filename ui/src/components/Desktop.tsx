import { useCallback, useMemo, useState } from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { Taskbar } from "./Taskbar";
import { Window } from "./Window";
import { useWindowStore } from "../stores/window-store";
import type { AppRegistry } from "../core/app-registry";

interface DesktopProps {
  registry: AppRegistry;
}

export function Desktop({ registry }: DesktopProps) {
  const windows    = useWindowStore((s) => s.windows);
  const openWindow = useWindowStore((s) => s.openWindow);
  const focusWindow = useWindowStore((s) => s.focusWindow);

  const apps   = useMemo(() => registry.getAll(), [registry]);
  const appMap = useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);

  // Track which app is "active" in the sidebar (most-recently launched)
  const [activeAppId, setActiveAppId] = useState<string | undefined>(undefined);

  const handleLaunch = useCallback(
    (appId: string) => {
      setActiveAppId(appId);

      const existing = Object.values(windows).find((w) => w.appId === appId);
      if (existing) {
        focusWindow(existing.id);
        return;
      }

      const app = registry.get(appId);
      if (!app) return;

      openWindow({
        appId: app.id,
        title: app.name,
        w: app.defaultSize.w,
        h: app.defaultSize.h,
        minW: app.minSize?.w,
        minH: app.minSize?.h,
      });
    },
    [windows, openWindow, focusWindow, registry]
  );

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: "var(--color-base)" }}>
      <TopBar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar apps={apps} onLaunch={handleLaunch} activeAppId={activeAppId} />

        {/* Workspace */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Workspace area */}
          <div className="flex-1 relative overflow-hidden" style={{ background: "var(--color-base)" }}>
            {Object.values(windows).map((win) => {
              const app = appMap.get(win.appId);
              if (!app) return null;
              const AppComponent = app.component;
              return (
                <Window key={win.id} win={win}>
                  <AppComponent windowId={win.id} />
                </Window>
              );
            })}

            {Object.keys(windows).length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p
                  className="text-xs font-mono"
                  style={{ color: "var(--color-text-secondary)", opacity: 0.3 }}
                >
                  Select an app from the sidebar
                </p>
              </div>
            )}
          </div>

          {/* Taskbar */}
          <Taskbar />
        </div>
      </div>
    </div>
  );
}

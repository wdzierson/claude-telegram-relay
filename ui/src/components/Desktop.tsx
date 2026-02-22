import { useCallback, useMemo } from "react";
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
  const windows = useWindowStore((s) => s.windows);
  const openWindow = useWindowStore((s) => s.openWindow);
  const focusWindow = useWindowStore((s) => s.focusWindow);

  const apps = useMemo(() => registry.getAll(), [registry]);
  const appMap = useMemo(
    () => new Map(apps.map((a) => [a.id, a])),
    [apps]
  );

  const handleLaunch = useCallback(
    (appId: string) => {
      // If already open, focus it
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
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <TopBar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar apps={apps} onLaunch={handleLaunch} />

        {/* Workspace */}
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

          {/* Empty state */}
          {Object.keys(windows).length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="font-mono text-sm text-text-secondary/40">
                  Open an app from the sidebar
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Taskbar />
    </div>
  );
}

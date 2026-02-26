import { LogOut, LayoutDashboard, Bot, MessageSquare, Wrench, Settings, ScrollText, Plug, Brain, Activity, Puzzle } from "lucide-react";
// Branding lives in TopBar — sidebar is nav-only
import type { BrightApp } from "../core/app-registry";
import { clearApiKey } from "../lib/auth";

interface SidebarProps {
  apps: BrightApp[];
  onLaunch: (appId: string) => void;
  activeAppId?: string;
}

const ICON_MAP: Record<string, typeof LayoutDashboard> = {
  "layout-dashboard": LayoutDashboard,
  "bot":              Bot,
  "message-square":   MessageSquare,
  "wrench":           Wrench,
  "settings":         Settings,
  "scroll-text":      ScrollText,
  "plug":             Plug,
  "brain":            Brain,
  "activity":         Activity,
  "puzzle":           Puzzle,
};

const CATEGORIES: { key: BrightApp["category"]; label: string }[] = [
  { key: "core",   label: "Core" },
  { key: "tools",  label: "Agents" },
  { key: "custom", label: "System" },
];

export function Sidebar({ apps, onLaunch, activeAppId }: SidebarProps) {
  return (
    <div className="sidebar h-full flex flex-col shrink-0 overflow-hidden">
      {/* App list */}
      <nav className="flex-1 overflow-y-auto py-2">
        {CATEGORIES.map(({ key, label }) => {
          const categoryApps = apps.filter((a) => a.category === key);
          if (categoryApps.length === 0) return null;
          return (
            <div key={key} className="mb-1">
              <div className="nav-section-label">{label}</div>
              {categoryApps.map((app) => {
                const Icon     = ICON_MAP[app.icon] || LayoutDashboard;
                const isActive = activeAppId === app.id;
                return (
                  <button
                    key={app.id}
                    className={"nav-item " + (isActive ? "nav-item--active" : "")}
                    onClick={() => onLaunch(app.id)}
                    title={app.name}
                  >
                    <Icon
                      size={16}
                      strokeWidth={1.5}
                      className="nav-item-icon shrink-0"
                      style={{
                        color: isActive
                          ? "var(--color-accent-active)"
                          : "var(--color-text-secondary)",
                      }}
                    />
                    <span className="text-sm truncate">
                      {app.name}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Footer: logout */}
      <div
        className="shrink-0 px-3 py-3 flex items-center"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <button
          className="nav-item"
          onClick={() => { clearApiKey(); window.location.reload(); }}
          title="Sign out"
        >
          <LogOut size={16} strokeWidth={1.5} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
          <span className="text-sm">Sign out</span>
        </button>
      </div>
    </div>
  );
}

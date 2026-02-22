import { useState } from "react";
import {
  LayoutDashboard, Bot, MessageSquare, Wrench,
  Settings, ScrollText, Plug, Brain, ChevronRight
} from "lucide-react";
import type { BrightApp } from "../core/app-registry";

interface SidebarProps {
  apps: BrightApp[];
  onLaunch: (appId: string) => void;
}

const ICON_MAP: Record<string, typeof LayoutDashboard> = {
  "layout-dashboard": LayoutDashboard,
  "bot": Bot,
  "message-square": MessageSquare,
  "wrench": Wrench,
  "settings": Settings,
  "scroll-text": ScrollText,
  "plug": Plug,
  "brain": Brain,
};

const CATEGORIES: { key: BrightApp["category"]; label: string }[] = [
  { key: "core", label: "CORE" },
  { key: "tools", label: "AGENTS" },
  { key: "custom", label: "SYSTEM" },
];

export function Sidebar({ apps, onLaunch }: SidebarProps) {
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);

  const isOpen = expanded || pinned;

  return (
    <div
      className="h-full flex flex-col border-r transition-all duration-200 shrink-0"
      style={{
        width: isOpen ? 200 : 56,
        borderColor: "var(--color-border)",
        background: "var(--color-surface)",
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Pin toggle */}
      {isOpen && (
        <button
          className="flex items-center justify-end px-3 py-2 text-text-secondary hover:text-accent-amber transition-colors"
          onClick={() => setPinned((p) => !p)}
          title={pinned ? "Unpin sidebar" : "Pin sidebar"}
        >
          <ChevronRight
            size={14}
            className={`transition-transform ${pinned ? "rotate-180" : ""}`}
          />
        </button>
      )}

      {/* App list by category */}
      <nav className="flex-1 overflow-y-auto py-2">
        {CATEGORIES.map(({ key, label }) => {
          const categoryApps = apps.filter((a) => a.category === key);
          if (categoryApps.length === 0) return null;
          return (
            <div key={key} className="mb-3">
              {isOpen && (
                <div className="px-4 py-1 text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary">
                  {label}
                </div>
              )}
              {categoryApps.map((app) => {
                const Icon = ICON_MAP[app.icon] || LayoutDashboard;
                return (
                  <button
                    key={app.id}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-elevated transition-colors group relative"
                    onClick={() => onLaunch(app.id)}
                    title={app.name}
                  >
                    <Icon
                      size={18}
                      strokeWidth={1.5}
                      className="text-text-secondary group-hover:text-accent-amber transition-colors shrink-0"
                    />
                    {isOpen && (
                      <span className="text-sm text-text-primary truncate">
                        {app.name}
                      </span>
                    )}
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-0 group-hover:h-5 bg-accent-amber transition-all duration-200" />
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

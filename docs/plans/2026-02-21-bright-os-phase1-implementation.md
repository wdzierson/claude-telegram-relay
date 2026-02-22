# Bright OS Phase 1: Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Bright OS windowed workspace UI with React + Vite + Tailwind, including the core window system, shell layout (sidebar, taskbar, top bar), and two initial apps (Dashboard, Config).

**Architecture:** A separate `ui/` directory houses the React SPA. In development, Vite proxies API calls to the Bun backend. In production, `vite build` outputs to `ui/dist/` and Bun serves these static files at `/admin`. The window system uses Zustand for state, a typed event bus for cross-window communication, and a plugin-style app registry.

**Tech Stack:** React 18, TypeScript, Vite 6, Tailwind CSS 4, Zustand, Lucide React, JetBrains Mono + DM Sans fonts

**Design doc:** `docs/plans/2026-02-21-bright-os-ui-design.md`

---

### Task 1: Scaffold Vite + React + TypeScript project

**Files:**
- Create: `ui/package.json`
- Create: `ui/vite.config.ts`
- Create: `ui/tsconfig.json`
- Create: `ui/tsconfig.app.json`
- Create: `ui/index.html`
- Create: `ui/src/main.tsx`
- Create: `ui/src/App.tsx`
- Create: `ui/.gitignore`

**Step 1: Initialize project**

```bash
cd /Users/will/Appdev/bright
mkdir -p ui/src
```

**Step 2: Create `ui/package.json`**

```json
{
  "name": "bright-ui",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  }
}
```

**Step 3: Install dependencies**

```bash
cd /Users/will/Appdev/bright/ui
bun add react react-dom zustand lucide-react
bun add -d @types/react @types/react-dom typescript vite @vitejs/plugin-react tailwindcss @tailwindcss/vite
```

**Step 4: Create `ui/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/admin/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/admin/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
```

**Step 5: Create `ui/tsconfig.json`**

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }]
}
```

**Step 6: Create `ui/tsconfig.app.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "baseUrl": "."
  },
  "include": ["src"]
}
```

**Step 7: Create `ui/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bright OS</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 8: Create `ui/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

**Step 9: Create `ui/src/App.tsx`** (placeholder)

```tsx
export function App() {
  return (
    <div className="h-screen w-screen bg-base text-primary font-body">
      <p className="p-8 font-mono text-accent-amber">Bright OS</p>
    </div>
  );
}
```

**Step 10: Create `ui/.gitignore`**

```
node_modules/
dist/
```

**Step 11: Verify project runs**

```bash
cd /Users/will/Appdev/bright/ui && bun run dev
```

Expected: Vite dev server starts on port 5173, browser shows "Bright OS" in amber monospace.

**Step 12: Commit**

```bash
git add ui/
git commit -m "feat(ui): scaffold Vite + React + TypeScript project"
```

---

### Task 2: Design Tokens + Global CSS

**Files:**
- Create: `ui/src/styles/global.css`
- Create: `ui/src/styles/noise.svg` (inline in CSS, not a separate file)

**Step 1: Create `ui/src/styles/global.css`**

```css
@import "tailwindcss";

/* ============================================
   DESIGN TOKENS — "Matte Industrial" theme
   ============================================ */

@theme {
  --color-base: #121212;
  --color-surface: #1a1a1a;
  --color-elevated: #242424;
  --color-border: #2e2e2e;
  --color-border-active: #3d3d3d;
  --color-text-primary: #e8e4dd;
  --color-text-secondary: #8a8578;
  --color-accent-amber: #d4a053;
  --color-accent-copper: #c17f59;
  --color-status-live: #5c9a6b;
  --color-status-error: #b85c5c;
  --color-status-idle: #6b6b6b;
  --color-glass: rgba(26, 26, 26, 0.85);

  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --font-body: "DM Sans", system-ui, sans-serif;
}

/* ============================================
   BASE STYLES
   ============================================ */

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--color-base);
  color: var(--color-text-primary);
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* Noise texture overlay */
#root::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  opacity: 0.025;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* ============================================
   SCROLLBAR
   ============================================ */

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--color-border-active);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-secondary);
}

/* ============================================
   WINDOW ANIMATIONS
   ============================================ */

@keyframes window-open {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes window-close {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes pulse-subtle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.animate-window-open {
  animation: window-open 150ms ease-out;
}

.animate-window-close {
  animation: window-close 100ms ease-out forwards;
}

.animate-pulse-subtle {
  animation: pulse-subtle 2s ease-in-out infinite;
}

/* ============================================
   UTILITY CLASSES
   ============================================ */

.glass {
  background-color: var(--color-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.status-dot-live { background-color: var(--color-status-live); }
.status-dot-error { background-color: var(--color-status-error); }
.status-dot-idle { background-color: var(--color-status-idle); }
.status-dot-amber { background-color: var(--color-accent-amber); }
```

**Step 2: Verify styles work**

Update `App.tsx` to use several tokens. Run `bun run dev`, verify dark background, amber text, noise texture visible, custom fonts load.

**Step 3: Commit**

```bash
git add ui/src/styles/
git commit -m "feat(ui): add Matte Industrial design tokens and global CSS"
```

---

### Task 3: Event Bus

**Files:**
- Create: `ui/src/core/event-bus.ts`
- Create: `ui/src/core/__tests__/event-bus.test.ts`

**Step 1: Write the failing test**

```typescript
// ui/src/core/__tests__/event-bus.test.ts
import { describe, it, expect, vi } from "vitest";
import { createEventBus } from "../event-bus";

describe("EventBus", () => {
  it("emits and receives events", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on("test-event", handler);
    bus.emit("test-event", { value: 42 });
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it("unsubscribes correctly", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const unsub = bus.on("test-event", handler);
    unsub();
    bus.emit("test-event", { value: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports multiple listeners", () => {
    const bus = createEventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on("evt", h1);
    bus.on("evt", h2);
    bus.emit("evt", "data");
    expect(h1).toHaveBeenCalledWith("data");
    expect(h2).toHaveBeenCalledWith("data");
  });

  it("does not bleed between event types", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on("a", handler);
    bus.emit("b", "data");
    expect(handler).not.toHaveBeenCalled();
  });
});
```

**Step 2: Install vitest and run test to verify it fails**

```bash
cd /Users/will/Appdev/bright/ui && bun add -d vitest
bunx vitest run src/core/__tests__/event-bus.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write implementation**

```typescript
// ui/src/core/event-bus.ts
type Handler = (data: unknown) => void;

export interface EventBus {
  on(event: string, handler: Handler): () => void;
  emit(event: string, data?: unknown): void;
}

export function createEventBus(): EventBus {
  const listeners = new Map<string, Set<Handler>>();

  return {
    on(event: string, handler: Handler): () => void {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(handler);
      return () => {
        listeners.get(event)?.delete(handler);
      };
    },

    emit(event: string, data?: unknown): void {
      listeners.get(event)?.forEach((handler) => handler(data));
    },
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/will/Appdev/bright/ui && bunx vitest run src/core/__tests__/event-bus.test.ts
```

Expected: 4 tests pass.

**Step 5: Commit**

```bash
git add ui/src/core/
git commit -m "feat(ui): add typed event bus with tests"
```

---

### Task 4: Window Manager (Zustand Store)

**Files:**
- Create: `ui/src/stores/window-store.ts`
- Create: `ui/src/stores/__tests__/window-store.test.ts`

**Step 1: Write the failing test**

```typescript
// ui/src/stores/__tests__/window-store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useWindowStore } from "../window-store";

describe("WindowStore", () => {
  beforeEach(() => {
    useWindowStore.setState({ windows: {}, nextZIndex: 1 });
  });

  it("creates a window with default position", () => {
    const { openWindow } = useWindowStore.getState();
    const id = openWindow({ appId: "dashboard", title: "Dashboard", w: 800, h: 600 });
    const { windows } = useWindowStore.getState();
    expect(windows[id]).toBeDefined();
    expect(windows[id].title).toBe("Dashboard");
    expect(windows[id].w).toBe(800);
    expect(windows[id].h).toBe(600);
    expect(windows[id].isMinimized).toBe(false);
    expect(windows[id].isMaximized).toBe(false);
  });

  it("closes a window", () => {
    const { openWindow } = useWindowStore.getState();
    const id = openWindow({ appId: "test", title: "Test", w: 400, h: 300 });
    useWindowStore.getState().closeWindow(id);
    expect(useWindowStore.getState().windows[id]).toBeUndefined();
  });

  it("focuses a window (bumps zIndex)", () => {
    const { openWindow } = useWindowStore.getState();
    const id1 = openWindow({ appId: "a", title: "A", w: 400, h: 300 });
    const id2 = openWindow({ appId: "b", title: "B", w: 400, h: 300 });
    useWindowStore.getState().focusWindow(id1);
    const { windows } = useWindowStore.getState();
    expect(windows[id1].zIndex).toBeGreaterThan(windows[id2].zIndex);
  });

  it("moves a window", () => {
    const { openWindow } = useWindowStore.getState();
    const id = openWindow({ appId: "test", title: "Test", w: 400, h: 300 });
    useWindowStore.getState().moveWindow(id, 100, 200);
    expect(useWindowStore.getState().windows[id].x).toBe(100);
    expect(useWindowStore.getState().windows[id].y).toBe(200);
  });

  it("resizes a window respecting minSize", () => {
    const { openWindow } = useWindowStore.getState();
    const id = openWindow({ appId: "test", title: "Test", w: 400, h: 300, minW: 200, minH: 150 });
    useWindowStore.getState().resizeWindow(id, 100, 50);
    const win = useWindowStore.getState().windows[id];
    expect(win.w).toBe(200);  // clamped to minW
    expect(win.h).toBe(150);  // clamped to minH
  });

  it("toggles maximize", () => {
    const { openWindow } = useWindowStore.getState();
    const id = openWindow({ appId: "test", title: "Test", w: 400, h: 300 });
    useWindowStore.getState().toggleMaximize(id);
    expect(useWindowStore.getState().windows[id].isMaximized).toBe(true);
    useWindowStore.getState().toggleMaximize(id);
    expect(useWindowStore.getState().windows[id].isMaximized).toBe(false);
  });

  it("toggles minimize", () => {
    const { openWindow } = useWindowStore.getState();
    const id = openWindow({ appId: "test", title: "Test", w: 400, h: 300 });
    useWindowStore.getState().minimizeWindow(id);
    expect(useWindowStore.getState().windows[id].isMinimized).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/will/Appdev/bright/ui && bunx vitest run src/stores/__tests__/window-store.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write implementation**

```typescript
// ui/src/stores/window-store.ts
import { create } from "zustand";

export interface WindowState {
  id: string;
  appId: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number;
  minH: number;
  zIndex: number;
  isMinimized: boolean;
  isMaximized: boolean;
  /** Saved position/size before maximize, for restore */
  preMaximize?: { x: number; y: number; w: number; h: number };
}

interface OpenWindowParams {
  appId: string;
  title: string;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  x?: number;
  y?: number;
}

interface WindowStoreState {
  windows: Record<string, WindowState>;
  nextZIndex: number;
  openWindow: (params: OpenWindowParams) => string;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, w: number, h: number) => void;
  toggleMaximize: (id: string) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  setTitle: (id: string, title: string) => void;
}

let windowCounter = 0;

export const useWindowStore = create<WindowStoreState>()((set, get) => ({
  windows: {},
  nextZIndex: 1,

  openWindow(params: OpenWindowParams): string {
    const id = `win_${++windowCounter}`;
    const { nextZIndex } = get();
    const cascade = (windowCounter % 10) * 30;

    const win: WindowState = {
      id,
      appId: params.appId,
      title: params.title,
      x: params.x ?? 80 + cascade,
      y: params.y ?? 50 + cascade,
      w: params.w,
      h: params.h,
      minW: params.minW ?? 300,
      minH: params.minH ?? 200,
      zIndex: nextZIndex,
      isMinimized: false,
      isMaximized: false,
    };

    set((s) => ({
      windows: { ...s.windows, [id]: win },
      nextZIndex: s.nextZIndex + 1,
    }));

    return id;
  },

  closeWindow(id: string) {
    set((s) => {
      const { [id]: _, ...rest } = s.windows;
      return { windows: rest };
    });
  },

  focusWindow(id: string) {
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;
      return {
        windows: {
          ...s.windows,
          [id]: { ...win, zIndex: s.nextZIndex, isMinimized: false },
        },
        nextZIndex: s.nextZIndex + 1,
      };
    });
  },

  moveWindow(id: string, x: number, y: number) {
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;
      return { windows: { ...s.windows, [id]: { ...win, x, y } } };
    });
  },

  resizeWindow(id: string, w: number, h: number) {
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;
      return {
        windows: {
          ...s.windows,
          [id]: {
            ...win,
            w: Math.max(w, win.minW),
            h: Math.max(h, win.minH),
          },
        },
      };
    });
  },

  toggleMaximize(id: string) {
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;

      if (win.isMaximized) {
        // Restore
        const prev = win.preMaximize ?? { x: 80, y: 50, w: win.w, h: win.h };
        return {
          windows: {
            ...s.windows,
            [id]: { ...win, ...prev, isMaximized: false, preMaximize: undefined },
          },
        };
      }

      // Maximize
      return {
        windows: {
          ...s.windows,
          [id]: {
            ...win,
            preMaximize: { x: win.x, y: win.y, w: win.w, h: win.h },
            isMaximized: true,
          },
        },
      };
    });
  },

  minimizeWindow(id: string) {
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;
      return {
        windows: { ...s.windows, [id]: { ...win, isMinimized: true } },
      };
    });
  },

  restoreWindow(id: string) {
    const { focusWindow } = get();
    focusWindow(id); // focusWindow already sets isMinimized: false
  },

  setTitle(id: string, title: string) {
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;
      return { windows: { ...s.windows, [id]: { ...win, title } } };
    });
  },
}));
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/will/Appdev/bright/ui && bunx vitest run src/stores/__tests__/window-store.test.ts
```

Expected: 7 tests pass.

**Step 5: Commit**

```bash
git add ui/src/stores/
git commit -m "feat(ui): add window manager Zustand store with tests"
```

---

### Task 5: App Registry

**Files:**
- Create: `ui/src/core/app-registry.ts`
- Create: `ui/src/core/__tests__/app-registry.test.ts`

**Step 1: Write the failing test**

```typescript
// ui/src/core/__tests__/app-registry.test.ts
import { describe, it, expect } from "vitest";
import { createAppRegistry, type BrightApp } from "../app-registry";

const makeApp = (id: string, category: BrightApp["category"] = "core"): BrightApp => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  icon: "layout-dashboard",
  defaultSize: { w: 800, h: 600 },
  component: () => null,
  category,
});

describe("AppRegistry", () => {
  it("registers and retrieves an app", () => {
    const reg = createAppRegistry();
    reg.register(makeApp("dashboard"));
    expect(reg.get("dashboard")).toBeDefined();
    expect(reg.get("dashboard")!.name).toBe("Dashboard");
  });

  it("returns undefined for unregistered app", () => {
    const reg = createAppRegistry();
    expect(reg.get("nope")).toBeUndefined();
  });

  it("lists all apps", () => {
    const reg = createAppRegistry();
    reg.register(makeApp("a"));
    reg.register(makeApp("b"));
    expect(reg.getAll()).toHaveLength(2);
  });

  it("lists apps by category", () => {
    const reg = createAppRegistry();
    reg.register(makeApp("dash", "core"));
    reg.register(makeApp("monitor", "tools"));
    reg.register(makeApp("chat", "core"));
    expect(reg.getByCategory("core")).toHaveLength(2);
    expect(reg.getByCategory("tools")).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/will/Appdev/bright/ui && bunx vitest run src/core/__tests__/app-registry.test.ts
```

**Step 3: Write implementation**

```typescript
// ui/src/core/app-registry.ts
import type { ComponentType } from "react";

export interface AppProps {
  windowId: string;
}

export interface BrightApp {
  id: string;
  name: string;
  icon: string;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  component: ComponentType<AppProps>;
  category: "core" | "tools" | "custom";
}

export interface AppRegistry {
  register(app: BrightApp): void;
  get(id: string): BrightApp | undefined;
  getAll(): BrightApp[];
  getByCategory(category: BrightApp["category"]): BrightApp[];
}

export function createAppRegistry(): AppRegistry {
  const apps = new Map<string, BrightApp>();

  return {
    register(app: BrightApp) {
      apps.set(app.id, app);
    },
    get(id: string) {
      return apps.get(id);
    },
    getAll() {
      return Array.from(apps.values());
    },
    getByCategory(category: BrightApp["category"]) {
      return Array.from(apps.values()).filter((a) => a.category === category);
    },
  };
}
```

**Step 4: Run tests**

```bash
cd /Users/will/Appdev/bright/ui && bunx vitest run src/core/__tests__/app-registry.test.ts
```

Expected: 4 tests pass.

**Step 5: Commit**

```bash
git add ui/src/core/
git commit -m "feat(ui): add app registry with tests"
```

---

### Task 6: API Client

**Files:**
- Create: `ui/src/lib/api.ts`
- Create: `ui/src/lib/auth.ts`

**Step 1: Create auth helper**

```typescript
// ui/src/lib/auth.ts
const AUTH_KEY = "bright_api_key";

export function getApiKey(): string | null {
  return sessionStorage.getItem(AUTH_KEY);
}

export function setApiKey(key: string): void {
  sessionStorage.setItem(AUTH_KEY, key);
}

export function clearApiKey(): void {
  sessionStorage.removeItem(AUTH_KEY);
}

export function isAuthenticated(): boolean {
  return !!getApiKey();
}
```

**Step 2: Create API client**

```typescript
// ui/src/lib/api.ts
import { getApiKey, clearApiKey } from "./auth";

const BASE = "/admin/api";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) throw new ApiError(401, "Not authenticated");

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...options.headers,
    },
  });

  if (res.status === 401) {
    clearApiKey();
    window.location.reload();
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText);
  }

  return res.json();
}

export const api = {
  getStatus: () => request<StatusResponse>("/status"),
  getConfig: () => request<ConfigResponse>("/config"),
  putConfig: (updates: { key: string; value: string }[]) =>
    request<{ success: boolean; restartRequired: boolean }>("/config", {
      method: "PUT",
      body: JSON.stringify({ updates }),
    }),
  getMessages: (limit = 50, offset = 0) =>
    request<MessagesResponse>(`/messages?limit=${limit}&offset=${offset}`),
  getMemory: (limit = 50, offset = 0) =>
    request<MemoryResponse>(`/memory?limit=${limit}&offset=${offset}`),
  getTasks: (limit = 20, offset = 0, status?: string) =>
    request<TasksResponse>(
      `/tasks?limit=${limit}&offset=${offset}${status ? `&status=${status}` : ""}`
    ),
  getMcp: () => request<McpResponse>("/mcp"),
  putMcp: (servers: unknown[]) =>
    request<{ success: boolean; restartRequired: boolean }>("/mcp", {
      method: "PUT",
      body: JSON.stringify({ servers }),
    }),
  getMcpCatalog: () => request<McpCatalogResponse>("/mcp/catalog"),
};

// Response types
export interface StatusResponse {
  uptime: number;
  bot: string;
  memory: string;
  taskQueue?: { active: number; queued: number; waitingUser: number };
}

export interface ConfigResponse {
  sections: {
    section: string;
    vars: { key: string; value: string; masked: boolean; active: boolean }[];
  }[];
}

export interface MessagesResponse {
  messages: {
    id: string;
    role: string;
    content: string;
    channel: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }[];
  total: number;
}

export interface MemoryResponse {
  memory: {
    id: string;
    type: string;
    content: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }[];
  total: number;
}

export interface TasksResponse {
  tasks: {
    id: string;
    status: string;
    description: string;
    result: string | null;
    error: string | null;
    priority: number;
    iteration_count: number;
    max_iterations: number;
    token_usage: number;
    created_at: string;
    updated_at: string;
    started_at: string | null;
    completed_at: string | null;
  }[];
  total: number;
}

export interface McpResponse {
  servers: {
    name: string;
    command: string;
    args?: string[];
    connected: boolean;
    toolCount: number;
    tools: { name: string; description: string }[];
  }[];
  configPath: string | null;
}

export interface McpCatalogResponse {
  catalog: {
    name: string;
    description: string;
    command: string;
    args: string[];
    envVars?: string[];
  }[];
}
```

**Step 3: Commit**

```bash
git add ui/src/lib/
git commit -m "feat(ui): add API client and auth helpers"
```

---

### Task 7: Window Component

**Files:**
- Create: `ui/src/components/Window.tsx`

This is the core UI component — a draggable, resizable window with title bar.

**Step 1: Create Window component**

```tsx
// ui/src/components/Window.tsx
import { useCallback, useRef, useEffect, type ReactNode } from "react";
import { X, Minus, Maximize2, Minimize2 } from "lucide-react";
import { useWindowStore, type WindowState } from "../stores/window-store";

interface WindowProps {
  win: WindowState;
  children: ReactNode;
  icon?: ReactNode;
}

export function Window({ win, children, icon }: WindowProps) {
  const { focusWindow, closeWindow, moveWindow, resizeWindow, toggleMaximize, minimizeWindow } =
    useWindowStore();
  const dragRef = useRef<{ startX: number; startY: number; winX: number; winY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; winW: number; winH: number } | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);

  // Drag handlers
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (win.isMaximized) return;
      e.preventDefault();
      focusWindow(win.id);
      dragRef.current = { startX: e.clientX, startY: e.clientY, winX: win.x, winY: win.y };

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        moveWindow(win.id, dragRef.current.winX + dx, dragRef.current.winY + dy);
      };

      const onUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [win.id, win.x, win.y, win.isMaximized, focusWindow, moveWindow]
  );

  // Resize handlers
  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (win.isMaximized) return;
      e.preventDefault();
      e.stopPropagation();
      focusWindow(win.id);
      resizeRef.current = { startX: e.clientX, startY: e.clientY, winW: win.w, winH: win.h };

      const onMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const dw = ev.clientX - resizeRef.current.startX;
        const dh = ev.clientY - resizeRef.current.startY;
        resizeWindow(win.id, resizeRef.current.winW + dw, resizeRef.current.winH + dh);
      };

      const onUp = () => {
        resizeRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [win.id, win.w, win.h, win.isMaximized, focusWindow, resizeWindow]
  );

  if (win.isMinimized) return null;

  const isActive = useWindowStore(
    (s) =>
      Object.values(s.windows).every((w) => w.zIndex <= win.zIndex)
  );

  const style: React.CSSProperties = win.isMaximized
    ? { position: "absolute", inset: 0, zIndex: win.zIndex }
    : {
        position: "absolute",
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
        zIndex: win.zIndex,
      };

  return (
    <div
      ref={windowRef}
      className={`flex flex-col animate-window-open ${
        isActive ? "border-border-active" : "border-border opacity-90"
      }`}
      style={{
        ...style,
        border: "1px solid",
        borderRadius: "2px",
        overflow: "hidden",
        background: "var(--color-surface)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      }}
      onMouseDown={() => focusWindow(win.id)}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-3 shrink-0 select-none cursor-default"
        style={{
          height: 32,
          background: "var(--color-elevated)",
          borderBottom: "1px solid var(--color-border)",
        }}
        onMouseDown={onDragStart}
        onDoubleClick={() => toggleMaximize(win.id)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-text-secondary shrink-0">{icon}</span>}
          <span
            className="font-mono text-xs truncate"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {win.title}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="p-1 rounded hover:bg-border transition-colors"
            onClick={(e) => { e.stopPropagation(); minimizeWindow(win.id); }}
          >
            <Minus size={12} className="text-text-secondary" />
          </button>
          <button
            className="p-1 rounded hover:bg-border transition-colors"
            onClick={(e) => { e.stopPropagation(); toggleMaximize(win.id); }}
          >
            {win.isMaximized ? (
              <Minimize2 size={12} className="text-text-secondary" />
            ) : (
              <Maximize2 size={12} className="text-text-secondary" />
            )}
          </button>
          <button
            className="p-1 rounded hover:bg-status-error/20 transition-colors"
            onClick={(e) => { e.stopPropagation(); closeWindow(win.id); }}
          >
            <X size={12} className="text-text-secondary" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">{children}</div>

      {/* Resize handle */}
      {!win.isMaximized && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
          onMouseDown={onResizeStart}
          style={{ zIndex: 1 }}
        />
      )}
    </div>
  );
}
```

**Step 2: Verify Window renders in App.tsx**

Temporarily render a Window in App.tsx with a test app id. Run `bun run dev`, verify the window appears with title bar, is draggable, resizable, and buttons work.

**Step 3: Commit**

```bash
git add ui/src/components/Window.tsx
git commit -m "feat(ui): add draggable/resizable Window component"
```

---

### Task 8: Sidebar Component

**Files:**
- Create: `ui/src/components/Sidebar.tsx`

**Step 1: Create Sidebar**

```tsx
// ui/src/components/Sidebar.tsx
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
                    {/* Hover accent line */}
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
```

**Step 2: Verify visually in dev mode**

**Step 3: Commit**

```bash
git add ui/src/components/Sidebar.tsx
git commit -m "feat(ui): add collapsible Sidebar with app launcher"
```

---

### Task 9: Taskbar Component

**Files:**
- Create: `ui/src/components/Taskbar.tsx`

**Step 1: Create Taskbar**

```tsx
// ui/src/components/Taskbar.tsx
import { useWindowStore } from "../stores/window-store";
import type { BrightApp } from "../core/app-registry";

interface TaskbarProps {
  apps: Map<string, BrightApp>;
}

export function Taskbar({ apps }: TaskbarProps) {
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

      {/* Right side: quick stats placeholder */}
      <div className="flex items-center gap-3 text-xs text-text-secondary font-mono">
        <span>{windowList.length} window{windowList.length !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add ui/src/components/Taskbar.tsx
git commit -m "feat(ui): add Taskbar with window pills"
```

---

### Task 10: Top Bar Component

**Files:**
- Create: `ui/src/components/TopBar.tsx`

**Step 1: Create TopBar**

```tsx
// ui/src/components/TopBar.tsx
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
          onClick={() => { clearApiKey(); window.location.reload(); }}
          title="Sign out"
        >
          <LogOut size={12} className="text-text-secondary" />
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add ui/src/components/TopBar.tsx
git commit -m "feat(ui): add TopBar with clock and sign-out"
```

---

### Task 11: Login Screen

**Files:**
- Create: `ui/src/components/Login.tsx`

**Step 1: Create Login component**

```tsx
// ui/src/components/Login.tsx
import { useState } from "react";
import { Zap, ArrowRight } from "lucide-react";
import { setApiKey } from "../lib/auth";

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/admin/api/status", {
        headers: { Authorization: `Bearer ${key.trim()}` },
      });

      if (res.ok) {
        setApiKey(key.trim());
        onLogin();
      } else {
        setError("Invalid API key");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-base">
      <div
        className="w-full max-w-sm p-8"
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: "2px",
          background: "var(--color-surface)",
        }}
      >
        <div className="flex items-center gap-2 mb-8">
          <Zap size={20} strokeWidth={1.5} className="text-accent-amber" />
          <h1 className="font-mono text-lg font-medium text-text-primary">
            Bright OS
          </h1>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block mb-2 text-xs font-body font-semibold uppercase tracking-widest text-text-secondary">
            API Key
          </label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="SERVER_API_KEY"
            autoFocus
            className="w-full px-3 py-2 mb-4 font-mono text-sm bg-base border rounded-md text-text-primary placeholder:text-text-secondary/50 outline-none focus:border-accent-amber transition-colors"
            style={{
              borderColor: "var(--color-border)",
              borderRadius: "6px",
            }}
          />
          {error && (
            <p className="text-sm mb-3" style={{ color: "var(--color-status-error)" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 font-body text-sm font-medium rounded-md transition-colors"
            style={{
              background: "var(--color-accent-amber)",
              color: "var(--color-base)",
              borderRadius: "6px",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Connecting..." : "Sign In"}
            {!loading && <ArrowRight size={14} />}
          </button>
        </form>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add ui/src/components/Login.tsx
git commit -m "feat(ui): add Login screen"
```

---

### Task 12: Desktop Shell (compose everything)

**Files:**
- Create: `ui/src/components/Desktop.tsx`
- Modify: `ui/src/App.tsx`

**Step 1: Create Desktop (the shell that holds sidebar + workspace + taskbar)**

```tsx
// ui/src/components/Desktop.tsx
import { useCallback, useMemo } from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { Taskbar } from "./Taskbar";
import { Window } from "./Window";
import { useWindowStore } from "../stores/window-store";
import type { AppRegistry, BrightApp } from "../core/app-registry";

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

      <Taskbar apps={appMap} />
    </div>
  );
}
```

**Step 2: Update App.tsx to wire everything together**

```tsx
// ui/src/App.tsx
import { useState, useMemo, useEffect } from "react";
import { isAuthenticated } from "./lib/auth";
import { Login } from "./components/Login";
import { Desktop } from "./components/Desktop";
import { createAppRegistry, type AppRegistry } from "./core/app-registry";
import { registerApps } from "./apps";

export function App() {
  const [authed, setAuthed] = useState(isAuthenticated());

  const registry: AppRegistry = useMemo(() => {
    const reg = createAppRegistry();
    registerApps(reg);
    return reg;
  }, []);

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return <Desktop registry={registry} />;
}
```

**Step 3: Create app registration file**

```typescript
// ui/src/apps/index.ts
import type { AppRegistry } from "../core/app-registry";
import { DashboardApp } from "./dashboard";

export function registerApps(registry: AppRegistry) {
  registry.register(DashboardApp);
  // More apps registered here as they're built
}
```

**Step 4: Create placeholder Dashboard app**

```tsx
// ui/src/apps/dashboard/index.tsx
import type { BrightApp, AppProps } from "../../core/app-registry";

function DashboardContent({ windowId }: AppProps) {
  return (
    <div className="p-4">
      <h2 className="font-mono text-sm font-medium text-accent-amber mb-4">
        DASHBOARD
      </h2>
      <p className="text-sm text-text-secondary">Loading...</p>
    </div>
  );
}

export const DashboardApp: BrightApp = {
  id: "dashboard",
  name: "Dashboard",
  icon: "layout-dashboard",
  defaultSize: { w: 800, h: 600 },
  minSize: { w: 400, h: 300 },
  component: DashboardContent,
  category: "core",
};
```

**Step 5: Verify the full shell works**

Run `bun run dev`, log in with API key, verify:
- Top bar renders with "Bright OS" and clock
- Sidebar shows Dashboard under CORE category
- Clicking Dashboard opens a window
- Window is draggable, resizable, has title bar buttons
- Taskbar shows the open window with amber underline
- Right-click taskbar pill closes the window

**Step 6: Commit**

```bash
git add ui/src/
git commit -m "feat(ui): add Desktop shell, Window rendering, and app wiring"
```

---

### Task 13: Dashboard App (full implementation)

**Files:**
- Modify: `ui/src/apps/dashboard/index.tsx`

**Step 1: Implement full Dashboard**

```tsx
// ui/src/apps/dashboard/index.tsx
import { useEffect, useState } from "react";
import { Activity, Clock, MessageSquare, Zap } from "lucide-react";
import type { BrightApp, AppProps } from "../../core/app-registry";
import { api, type StatusResponse, type TasksResponse, type MessagesResponse } from "../../lib/api";

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatusCard({ icon: Icon, label, value, color }: {
  icon: typeof Activity;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      className="flex items-center gap-3 p-3"
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "2px",
        background: "var(--color-elevated)",
      }}
    >
      <Icon size={16} strokeWidth={1.5} style={{ color: color || "var(--color-text-secondary)" }} />
      <div>
        <div className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary">
          {label}
        </div>
        <div className="font-mono text-sm text-text-primary">{value}</div>
      </div>
    </div>
  );
}

function DashboardContent({ windowId }: AppProps) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [tasks, setTasks] = useState<TasksResponse["tasks"]>([]);
  const [messages, setMessages] = useState<MessagesResponse["messages"]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [s, t, m] = await Promise.all([
          api.getStatus(),
          api.getTasks(10),
          api.getMessages(10),
        ]);
        setStatus(s);
        setTasks(t.tasks);
        setMessages(m.messages);
      } catch (err: any) {
        setError(err.message);
      }
    };
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="p-4 text-status-error text-sm">{error}</div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {/* Status cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatusCard
          icon={Zap}
          label="Bot"
          value={status?.bot === "running" ? "Online" : "Offline"}
          color={status?.bot === "running" ? "var(--color-status-live)" : "var(--color-status-error)"}
        />
        <StatusCard
          icon={Clock}
          label="Uptime"
          value={status ? formatUptime(status.uptime) : "..."}
        />
        <StatusCard
          icon={MessageSquare}
          label="Memory"
          value={status?.memory || "..."}
          color={status?.memory === "connected" ? "var(--color-status-live)" : "var(--color-status-idle)"}
        />
      </div>

      {/* Active agents */}
      <section>
        <h3 className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary mb-2">
          AGENTS
        </h3>
        <div
          className="divide-y"
          style={{
            borderColor: "var(--color-border)",
            border: "1px solid var(--color-border)",
            borderRadius: "2px",
          }}
        >
          {tasks.filter((t) => ["queued", "running", "waiting_user"].includes(t.status)).length === 0 && (
            <div className="px-3 py-2 text-xs text-text-secondary">No active agents</div>
          )}
          {tasks
            .filter((t) => ["queued", "running", "waiting_user"].includes(t.status))
            .map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between px-3 py-2"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="status-dot"
                    style={{
                      backgroundColor:
                        task.status === "running"
                          ? "var(--color-status-live)"
                          : task.status === "waiting_user"
                          ? "var(--color-accent-amber)"
                          : "var(--color-status-idle)",
                    }}
                  />
                  <span className="text-sm text-text-primary truncate">
                    {task.description}
                  </span>
                </div>
                <span className="font-mono text-xs text-text-secondary shrink-0 ml-2">
                  {task.iteration_count}/{task.max_iterations}
                </span>
              </div>
            ))}
        </div>
      </section>

      {/* Recent tasks (completed/failed) */}
      <section>
        <h3 className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary mb-2">
          RECENT TASKS
        </h3>
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "2px",
          }}
        >
          {tasks.filter((t) => ["completed", "failed"].includes(t.status)).length === 0 && (
            <div className="px-3 py-2 text-xs text-text-secondary">No recent tasks</div>
          )}
          {tasks
            .filter((t) => ["completed", "failed"].includes(t.status))
            .slice(0, 5)
            .map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between px-3 py-2 border-b last:border-b-0"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="status-dot"
                    style={{
                      backgroundColor:
                        task.status === "completed"
                          ? "var(--color-status-live)"
                          : "var(--color-status-error)",
                    }}
                  />
                  <span className="text-sm text-text-primary truncate">
                    {task.description}
                  </span>
                </div>
                <span className="font-mono text-xs text-text-secondary shrink-0 ml-2">
                  {new Date(task.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
        </div>
      </section>

      {/* Recent messages */}
      <section>
        <h3 className="text-[10px] font-body font-semibold uppercase tracking-widest text-text-secondary mb-2">
          RECENT
        </h3>
        <div className="space-y-1">
          {messages.slice(0, 8).map((msg) => (
            <div key={msg.id} className="flex items-start gap-2 py-1">
              <span className="font-mono text-[10px] text-text-secondary shrink-0 pt-0.5">
                {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span
                className="font-mono text-[10px] shrink-0 pt-0.5 w-10"
                style={{
                  color: msg.role === "user" ? "var(--color-accent-amber)" : "var(--color-text-secondary)",
                }}
              >
                {msg.role === "user" ? "You" : "Bright"}
              </span>
              <span className="text-sm text-text-primary truncate">
                {msg.content.slice(0, 120)}
                {msg.content.length > 120 ? "..." : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export const DashboardApp: BrightApp = {
  id: "dashboard",
  name: "Dashboard",
  icon: "layout-dashboard",
  defaultSize: { w: 800, h: 600 },
  minSize: { w: 400, h: 300 },
  component: DashboardContent,
  category: "core",
};
```

**Step 2: Verify Dashboard loads data**

Run `bun run dev` with the Bun backend running on port 3000. Log in, open Dashboard, verify status cards, task list, and recent messages render.

**Step 3: Commit**

```bash
git add ui/src/apps/dashboard/
git commit -m "feat(ui): implement Dashboard app with live status, tasks, and messages"
```

---

### Task 14: Config App

**Files:**
- Create: `ui/src/apps/config/index.tsx`
- Modify: `ui/src/apps/index.ts` (register it)

**Step 1: Create Config app**

```tsx
// ui/src/apps/config/index.tsx
import { useEffect, useState } from "react";
import { Save, Eye, EyeOff, AlertTriangle } from "lucide-react";
import type { BrightApp, AppProps } from "../../core/app-registry";
import { api, type ConfigResponse } from "../../lib/api";

function ConfigContent({ windowId }: AppProps) {
  const [sections, setSections] = useState<ConfigResponse["sections"]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getConfig().then((data) => setSections(data.sections)).catch((e) => setError(e.message));
  }, []);

  const handleSave = async () => {
    const updates = Object.entries(edits).map(([key, value]) => ({ key, value }));
    if (updates.length === 0) return;

    setSaving(true);
    try {
      const res = await api.putConfig(updates);
      if (res.restartRequired) setRestartNeeded(true);
      setEdits({});
      // Reload config
      const data = await api.getConfig();
      setSections(data.sections);
    } catch (e: any) {
      setError(e.message);
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

      {/* Save button */}
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
              borderColor: "var(--color-border)",
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
                    className="w-full px-2 py-1 font-mono text-xs bg-base border rounded text-text-primary outline-none focus:border-accent-amber transition-colors"
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
```

**Step 2: Register in apps/index.ts**

```typescript
// ui/src/apps/index.ts
import type { AppRegistry } from "../core/app-registry";
import { DashboardApp } from "./dashboard";
import { ConfigApp } from "./config";

export function registerApps(registry: AppRegistry) {
  registry.register(DashboardApp);
  registry.register(ConfigApp);
}
```

**Step 3: Verify Config app renders, edits work, save works**

**Step 4: Commit**

```bash
git add ui/src/apps/
git commit -m "feat(ui): implement Config app with env editor"
```

---

### Task 15: Backend Integration — Serve Built UI

**Files:**
- Modify: `src/admin/routes.ts`
- Modify: `.gitignore`
- Modify: `package.json` (root)

**Step 1: Update routes.ts to serve Vite build output**

The current `routes.ts` serves 3 hardcoded static files from `src/admin/static/`. We need it to also serve files from `ui/dist/` if they exist (production build). In dev mode, the Vite dev server handles everything.

Modify `src/admin/routes.ts`:
- Change `STATIC_DIR` to check for `ui/dist/` first (built React app), fall back to `src/admin/static/` (legacy)
- Serve any file under `/admin/` that matches a file in the dist directory (not just the 3 hardcoded paths)
- For SPA routing: return `index.html` for any non-API, non-file `/admin/*` path

```typescript
// Updated STATIC_DIR logic at top of routes.ts
import { existsSync } from "fs";

const UI_DIST_DIR = join(dirname(import.meta.path), "../../ui/dist");
const LEGACY_STATIC_DIR = join(dirname(import.meta.path), "static");
const STATIC_DIR = existsSync(UI_DIST_DIR) ? UI_DIST_DIR : LEGACY_STATIC_DIR;

// Extended MIME types
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
```

Update the static file serving section in `handleAdminRequest`:
- `/admin` or `/admin/` → serve `index.html`
- `/admin/assets/*` → serve the file (Vite build puts JS/CSS in `assets/`)
- Any other `/admin/*` non-API path → serve `index.html` (SPA catch-all)

**Step 2: Update `.gitignore`**

Add:
```
# UI build output
ui/dist/
ui/node_modules/
```

**Step 3: Add build script to root `package.json`**

Add to scripts:
```json
"build:ui": "cd ui && bun run build",
"dev:ui": "cd ui && bun run dev"
```

**Step 4: Verify production build**

```bash
cd /Users/will/Appdev/bright/ui && bun run build
cd /Users/will/Appdev/bright && bun run start
```

Then visit `http://localhost:3000/admin` — should serve the React build.

**Step 5: Commit**

```bash
git add src/admin/routes.ts .gitignore package.json
git commit -m "feat(ui): serve Vite build from Bun backend at /admin"
```

---

### Task 16: Final verification

**Step 1: Run the full stack**

```bash
# Terminal 1: Backend
cd /Users/will/Appdev/bright && bun run start

# Terminal 2: Frontend dev
cd /Users/will/Appdev/bright/ui && bun run dev
```

**Step 2: Verify all features**

- [ ] Login screen appears at `http://localhost:5173/admin/`
- [ ] API key authentication works
- [ ] Sidebar shows Dashboard (CORE) and Configuration (SYSTEM)
- [ ] Dashboard opens as a draggable, resizable window
- [ ] Dashboard shows status cards, active agents, recent tasks, recent messages
- [ ] Dashboard auto-refreshes every 15 seconds
- [ ] Configuration app opens as a separate window
- [ ] Config shows grouped env vars with masking
- [ ] Config save creates backup and shows restart banner
- [ ] Multiple windows can be open simultaneously
- [ ] Window focus (z-index stacking) works
- [ ] Window minimize/maximize/close work
- [ ] Taskbar shows all open windows with active indicator
- [ ] Right-click taskbar pill closes window
- [ ] Top bar shows clock and logout button
- [ ] Logout clears session and returns to login

**Step 3: Build production and verify**

```bash
cd /Users/will/Appdev/bright/ui && bun run build
cd /Users/will/Appdev/bright && bun run start
# Visit http://localhost:3000/admin
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(ui): Bright OS Phase 1 complete — windowed workspace with Dashboard and Config apps"
```

---

## Summary

**16 tasks** covering the Phase 1 foundation:

| # | Task | Commits |
|---|------|---------|
| 1 | Scaffold Vite + React + TS | 1 |
| 2 | Design tokens + global CSS | 1 |
| 3 | Event bus (with tests) | 1 |
| 4 | Window manager store (with tests) | 1 |
| 5 | App registry (with tests) | 1 |
| 6 | API client + auth | 1 |
| 7 | Window component | 1 |
| 8 | Sidebar | 1 |
| 9 | Taskbar | 1 |
| 10 | Top bar | 1 |
| 11 | Login screen | 1 |
| 12 | Desktop shell (compose all) | 1 |
| 13 | Dashboard app (full) | 1 |
| 14 | Config app | 1 |
| 15 | Backend integration | 1 |
| 16 | Final verification | 1 |

**Total: ~16 commits, ~1800 lines of new code**

**What this produces:** A working windowed workspace UI at `/admin` with login, sidebar launcher, taskbar, draggable/resizable windows, a live Dashboard, and a Config editor. All existing backend API endpoints are preserved. The architecture supports adding new apps trivially.

**What comes next (Phase 2):** Agent Monitor app (real-time transcripts), Chat app (browser-based messaging), WebSocket endpoint for live events, Supabase Realtime integration.

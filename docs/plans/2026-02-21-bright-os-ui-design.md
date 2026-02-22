# Bright OS UI Design

> Date: 2026-02-21
> Status: Approved
> Approach: "Bright OS" — Lightweight windowed workspace

## Context

Bright's current admin panel is a vanilla JS SPA (~600 LOC) with dashboard, config editor, chat logs, and MCP management. It runs on Bun's HTTP server at `/admin`. The goal is to evolve this into a capable, extensible UI that serves as a real control surface for the agentic framework — starting as a personal power-user tool, architected for future multi-tenant use.

Inspiration drawn from the `wdzierson-org-1/agenticos` repo (a full macOS-style web OS in React), but stripped down to a lighter-weight windowed workspace without the full OS metaphor.

## Decisions

| Decision | Value |
|----------|-------|
| Framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + CSS custom properties |
| State management | Zustand (persist + subscribeWithSelector) |
| Drag-and-drop | @dnd-kit |
| Real-time | Supabase Realtime + WebSocket from Bun |
| Icons | Lucide React |
| Aesthetic | "Matte Industrial" — dark, textured, amber accents |
| Window model | Floating, resizable, stackable windows with snap zones |
| App model | Plugin-style registry — each feature is a self-contained "app" |

## Architecture

### Project Structure

```
ui/
├── src/
│   ├── core/              # Window manager, app registry, event bus
│   │   ├── window-manager.ts
│   │   ├── app-registry.ts
│   │   └── event-bus.ts
│   ├── apps/              # Each "app" is a self-contained module
│   │   ├── dashboard/
│   │   ├── agent-monitor/
│   │   ├── chat/
│   │   ├── workflow-builder/
│   │   ├── config/
│   │   ├── logs/
│   │   ├── mcp-manager/
│   │   └── memory-explorer/
│   ├── components/        # Shared UI primitives
│   │   ├── Window.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Taskbar.tsx
│   │   └── ...
│   ├── hooks/
│   ├── stores/
│   ├── styles/
│   └── lib/               # API client, utilities
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### App Plugin Interface

```typescript
interface BrightApp {
  id: string;
  name: string;
  icon: string;               // Lucide icon name
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  component: React.ComponentType<AppProps>;
  category: 'core' | 'tools' | 'custom';
}

interface AppProps {
  windowId: string;
  windowManager: WindowManager;
  eventBus: EventBus;
}
```

Adding a new app = creating a folder in `ui/src/apps/`, exporting a component, and registering it. Window chrome, launcher entry, and taskbar icon are automatic.

### Backend Integration

- Vite dev server proxies `/admin/api/*` to Bun's HTTP server during development
- Production: `vite build` outputs static files; Bun serves them at `/admin`
- Existing API endpoints preserved and extended
- New endpoints: WebSocket for real-time events, SSE for agent transcript streaming
- Supabase Realtime subscriptions direct from browser for task/message updates

### New API Endpoints Needed

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/admin/api/chat` | Send message from web UI to Bright |
| WS | `/admin/api/ws` | Real-time events (task updates, new messages) |
| GET | `/admin/api/tasks/:id/transcript` | Full transcript for a running task |
| GET | `/admin/api/tasks/:id/artifacts` | Files/images produced by a task |

## Visual Identity — "Matte Industrial"

### Color System

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#121212` | Desktop/workspace background |
| `--bg-surface` | `#1a1a1a` | Window backgrounds |
| `--bg-elevated` | `#242424` | Headers, active panels |
| `--border` | `#2e2e2e` | Window borders, dividers |
| `--border-active` | `#3d3d3d` | Focused window border |
| `--text-primary` | `#e8e4dd` | Warm off-white text |
| `--text-secondary` | `#8a8578` | Muted labels, timestamps |
| `--accent-amber` | `#d4a053` | Primary accent — active states, links |
| `--accent-copper` | `#c17f59` | Secondary accent — warnings, in-progress |
| `--status-live` | `#5c9a6b` | Running/connected (muted sage) |
| `--status-error` | `#b85c5c` | Failed/error (muted brick) |
| `--status-idle` | `#6b6b6b` | Inactive/paused |
| `--glass` | `rgba(26,26,26,0.85)` | Frosted overlays |

### Typography

| Usage | Font | Weight |
|-------|------|--------|
| Display / window titles | JetBrains Mono | 500 |
| Body text | DM Sans | 400/500 |
| Code / data values | JetBrains Mono | 400 |
| Status labels | DM Sans | 600, uppercase, tracking-wide |

### Surface Treatment

- Subtle noise texture overlay on `--bg-base` (CSS SVG filter, ~2% opacity)
- 1px solid borders; subtle box-shadow only on floating windows
- Frosted glass (`backdrop-filter: blur(12px)`) for sidebar and modals
- Sharp edges on windows (2px border-radius max), 6px on buttons/inputs
- Lucide icons, 18px default, stroke-width 1.5

### Motion

- Windows open: scale 0.95→1.0 + fade-in (150ms, ease-out)
- Windows close: fade-out (100ms)
- Sidebar hover: amber underline slides in from left (200ms)
- Taskbar indicators pulse on background events
- No bouncy springs. Crisp and deliberate.

## Layout

```
┌──────────────────────────────────────────────────────┐
│ [☰] Bright OS                        CPU  MEM  12:34 │  ← Top bar
├──────┬───────────────────────────────────────────────┤
│      │                                               │
│ Side │           WORKSPACE                           │
│ bar  │     (floating windows live here)              │
│      │                                               │
│      │                                               │
├──────┴───────────────────────────────────────────────┤
│ [Dashboard] [Agent Monitor] [Chat]     ▲ 2 tasks     │  ← Taskbar
└──────────────────────────────────────────────────────┘
```

### Sidebar (56px collapsed / 220px expanded)

- Icons only when collapsed, icon + label when expanded
- Hover to expand or pin open
- Categories: Core (Dashboard, Chat), Agents (Agent Monitor, Workflow Builder), System (Config, Logs, MCP, Memory)
- Click = open/focus window. Double-click = open new instance.

### Taskbar (36px)

- Pill-shaped buttons for each open window
- Active window: amber underline
- Right side: active tasks count, connection status
- Click = focus. Right-click = close.

### Window Component

- Title bar (32px): icon + title (left), minimize/maximize/close (right)
- Resizable from edges and corners, minimum size per-app
- Snap zones: drag to edges for half/full-screen
- Focus: active window gets `--border-active`, inactive windows slightly dimmed

## App Designs

### Dashboard

Default landing view. Overview of Bright's entire state.

**Sections:**
1. **System strip**: Status cards — bot status (online/offline), uptime, today's message count
2. **Activity sparkline**: Message volume over last 7 days (amber bar chart)
3. **Agents**: Live list of running/queued tasks with progress indicators. Click → opens Agent Monitor.
4. **Recent**: Last ~10 messages, compact. Click → opens Chat.

**Default size**: 800x600

### Agent Monitor

Real-time window into running agents. The centerpiece feature.

**Layout:**
- **Header strip**: Status dot, iteration counter (e.g., "6/25"), token usage, elapsed time, tool call count
- **Transcript panel** (left, ~65%): Live-scrolling conversation, color-coded by role
  - System: `--text-secondary`
  - Tool calls: `--accent-copper`, collapsible results
  - Assistant: `--text-primary`
  - User (ask_user): `--accent-amber`
- **Artifacts panel** (right, ~35%): Files/images produced. Click to preview inline.
- **Action bar**: Pause, Cancel, "Message Agent" (injects into ask_user flow)

**Real-time**: Supabase Realtime on task `conversation_history` + WebSocket for streaming tool calls.

**Multi-instance**: Each task can open in its own window. Task picker shown if multiple running.

**Default size**: 700x500

### Chat

Full chat interface — talk to Bright from the browser.

**Features:**
- Messages flow through same `handleMessage()` orchestrator as Telegram
- Messages saved with `channel: "web"` metadata
- Typing indicator (pulsing dots) while Bright thinks
- Inline task status cards when `[TASK:]` triggered
- Voice input via browser Web Speech API
- Markdown rendering for responses
- Image/file previews inline

**Backend**: `POST /admin/api/chat` + WebSocket for streaming responses.

**Default size**: 500x650

### Workflow Builder (Phase 2)

Visual canvas for composing agent workflows.

**Layout:**
- **Toolbox** (left): Drag nodes — tools, agents, logic blocks (if/else, parallel, loop)
- **Canvas** (right): Node-and-edge graph with data flow connections
- **Action bar**: Run, Save, Export as `[TASKCHAIN:]`

**Node types**: Tool call, Agent (personality + tool set), Conditional, Parallel, Loop.

**Storage**: Workflows saved in Supabase for reuse.

**Default size**: 900x600

### Existing Apps (migrated from current admin)

- **Config**: Env var editor with sections, masking, backup — same as current but in React
- **Logs**: Paginated message browser — same as current but with better filtering
- **MCP Manager**: Server list with status, catalog, add/remove — same as current
- **Memory Explorer** (new): Browse facts, goals, conversation threads. Edit/delete. Future: knowledge graph visualization.

## Implementation Phases

### Phase 1: Foundation (scaffold + core + dashboard)
- Vite + React + Tailwind project setup in `ui/`
- Window manager, app registry, event bus
- Sidebar, Taskbar, Window components
- Dashboard app (migrated from current admin)
- Config app (migrated)
- Build pipeline: `vite build` → Bun serves static files at `/admin`

### Phase 2: Live Monitoring + Chat
- Agent Monitor app with real-time transcript
- WebSocket endpoint on Bun for streaming events
- Chat app with `POST /admin/api/chat` endpoint
- Supabase Realtime integration

### Phase 3: Remaining Apps + Polish
- Logs app (migrated + enhanced filtering)
- MCP Manager app (migrated + live status)
- Memory Explorer (new)
- Window snap zones, keyboard shortcuts
- Responsive adjustments

### Phase 4: Workflow Builder
- @dnd-kit canvas
- Node types: tools, agents, logic
- TASKCHAIN export
- Save/load workflows

## Non-Goals (for now)

- Mobile-responsive layout (desktop-first, power-user tool)
- Multi-user auth (single API key, same as current)
- Dark/light theme toggle (dark only)
- Desktop icons / wallpaper / OS chrome
- File manager / finder

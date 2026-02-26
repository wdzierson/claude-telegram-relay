# Project Overview — Bright

> Canonical reference for project goals, architecture, and roadmap.
> Updated by Claude as decisions are made. Read this at the start of every session.

## What This Is

A personal AI assistant that lives on Telegram, powered by Claude. Evolving into a full agent runtime with multi-channel support, tools, multi-agent orchestration, and production deployment.

## Non-Goals (for now)

- Not a SaaS product — this is a single-user personal assistant.
- Not building a custom LLM — we use Claude (via CLI and API) as the reasoning engine.
- Not rewriting Supabase or grammY — we use them as-is.

## Decisions Made

| Decision | Value | Date |
|---|---|---|
| Runtime | Bun | 2026-02-19 |
| Language | TypeScript | 2026-02-19 |
| Telegram library | grammY | 2026-02-19 |
| Database | Supabase (Postgres + pgvector) | 2026-02-19 |
| Embeddings | OpenAI text-embedding-3-small (via Supabase Edge Function) | 2026-02-19 |
| Voice transcription | Groq cloud or local whisper.cpp | 2026-02-19 |
| Claude integration | Claude Code CLI (spawn per message) | 2026-02-19 |
| OS targets | macOS (primary), Linux, Windows | 2026-02-19 |
| Package manager | bun | 2026-02-19 |
| Claude integration mode | Keep CLI for now, switch to API later | 2026-02-19 |
| User model | Multi-user ready (interfaces support userId), single-user first | 2026-02-19 |
| Setup state | Fresh start — refactor first, set up services after | 2026-02-19 |

## Current State (as of 2026-02-20)

**Working stack:** Telegram → grammY → orchestrator → Anthropic API (with tool use) → Supabase memory → reply. Voice (Groq STT + ElevenLabs TTS), durable task queue (bounded concurrency, crash recovery, mid-task dialogue), chat-level tool use (weather, search, memory, datetime, fetch-url), approval flows, MCP integration, integrated heartbeat (check-ins + morning briefings with overnight summary), multimodal file processing (Claude Vision for images, document/audio extraction, persistent Supabase Storage with semantic search via search_attachments tool).

**Architecture:** Fully modularized in `src/{agent, channels/telegram, memory, voice, tools, scheduler, config}/`. Tool system with central registry, chat-loop with tool-use, human-in-the-loop approval via Telegram inline buttons, MCP client for external tool servers, durable Supabase-backed task queue with `ask_user` mid-task dialogue, and integrated heartbeat engine.

## Architecture Layers

```
┌─────────────────────────────────────────────────┐
│  Channels          (Telegram, future: web, API) │
├─────────────────────────────────────────────────┤
│  Agent             (orchestrator, prompt, tools) │
├─────────────────────────────────────────────────┤
│  Memory            (Supabase: messages, facts,   │
│                     goals, semantic search)       │
├─────────────────────────────────────────────────┤
│  Scheduler         (check-ins, briefings, cron)  │
├─────────────────────────────────────────────────┤
│  Voice             (transcription, future: TTS)  │
├─────────────────────────────────────────────────┤
│  Config/Profile    (env, profile.md, settings)   │
└─────────────────────────────────────────────────┘
```

See [AGENT_ARCHITECTURE.md](./AGENT_ARCHITECTURE.md) for detailed module design.

## Roadmap

### Phase 1 — Modularized Baseline (done)
Refactored the monolith into clean modules with typed interfaces.

### Phase 1.5 — API Backend (done)
Anthropic API backend as alternative to Claude CLI. Bot runs with `AGENT_BACKEND=api`.

### Phase 2 — UX + Task Model (done)
Background task system (autonomous research agent with web search), HTML formatting for Telegram, persistent typing indicators, inline task cancel buttons.

### Phase 3 — Voice (done)
Groq Whisper STT, ElevenLabs TTS, voice replies to voice messages.

### Phase 4 — Proactive AI (done)
Smart check-ins and morning briefings with real data fetchers (weather, goals, tasks, recent messages). Scheduled via launchd/PM2.

### Phase 5 — Tools (done)
Chat-level tool use (weather, search, memory, datetime, fetch-url), central tool registry, human-in-the-loop approval flows, MCP client for external tool servers.

### Phase 5.1 — Always-On Agent (done)
Durable Supabase-backed task queue (bounded concurrency, crash recovery, resume from saved state). Mid-task dialogue via `ask_user` tool (Telegram inline buttons + free-text). Integrated heartbeat engine (smart check-ins + morning briefings with overnight activity summary). Opt-in via `HEARTBEAT_ENABLED=true`; standalone scripts preserved as fallback.

### Phase 5.6 — Media Attachments (done)

Claude Vision for photos/screenshots, text extraction for PDFs/Word/text docs, audio transcription persistence, Supabase Storage for all uploads, semantic search via `search_attachments` tool.

### Phase 5.5 — Voice & Calls (next)

- Full-duplex voice calls (tgcalls/LiveKit).
- Hold-to-talk and streaming responses.

### Phase 6 — Multi-Agent (on hold)

- Orchestrator + specialist agents.
- Telegram forum topics per agent.
- Board meeting pattern.

### Phase 7 — VPS & Hybrid Deployment

- Deploy to VPS for 24/7 availability.
- Hybrid mode: local when at computer, VPS when away.

### Phase 8 — Production Infrastructure

- Model routing and fallbacks (Claude, OpenRouter, Ollama).
- Monitoring, auto-deploy, health checks.

## Open Questions

- [x] ~~Should Claude CLI spawning be replaced with direct Anthropic API calls?~~ Keep CLI for now, switch later.
- [x] ~~Should we support multiple users per bot?~~ Multi-user ready interfaces, single-user first.
- [x] ~~What's the preferred voice/TTS provider for Phase 3?~~ ElevenLabs for TTS, Groq Whisper for transcription.
- [ ] VPS provider preference? (Hetzner, DigitalOcean, Fly.io, Railway, etc.)
- [ ] Hybrid mode: how to detect "local is active" — heartbeat, network check, or manual toggle?

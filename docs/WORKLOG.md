# Worklog

> Date-stamped entries: what changed, what's next.
> Claude's external memory — read this at the start of every session.

## 2026-02-25 — Media Processing & Persistent Attachments

**What happened:**
- Added multimodal support: Claude Vision for images/screenshots, text extraction for documents, audio transcription persistence.
- New `attachments` table in Supabase with HNSW vector index and `match_attachments` RPC for semantic search over past uploads.
- All uploaded files persist in Supabase Storage (`agent-files` bucket) — images, PDFs, Word docs, text files, voice notes, audio files.
- Updated Anthropic API and chat-loop to send images as base64 vision content blocks (Claude can now actually see images).
- Updated Telegram handlers: photo, document, voice — all download as Buffer, upload to storage, process inline, save attachment record.
- New `search_attachments` chat tool for finding past uploads by semantic similarity.
- Updated embed/search Edge Functions to handle the `attachments` table.
- Database webhook `embed_attachments` manually configured in Supabase dashboard.

**Supported file types:**
- Images (jpg, png, webp, screenshots) → Claude Vision (base64 content blocks)
- PDFs → pdf-parse text extraction
- Word docs (.docx) → mammoth text extraction
- Text files (.txt, .csv, .json, .md) → UTF-8 read
- Voice notes (.ogg) → Groq/Whisper transcription + persistence
- Audio files (.mp3, .m4a, .wav, .flac) → transcription + persistence

**Smoke tested:** Building identification via photo ✅, storage persistence ✅, search_attachments tool ✅

**What's next:**
- Monitor embedding quality for attachment search in production.
- Consider video frame extraction for future phase.

## 2026-02-19 — Project Kickoff

**What happened:**
- Analyzed the Bright codebase and mapped all files to conceptual modules.
- Mapped all files to conceptual modules (see AGENT_ARCHITECTURE.md).
- Created three project docs: PROJECT_OVERVIEW.md, AGENT_ARCHITECTURE.md, this WORKLOG.md.
- Proposed Phase 1 architecture: refactor monolith into `src/{agent,channels,memory,voice,scheduler,config}/`.

**Current state:**
- Codebase is the original monolith: `src/relay.ts` (494 lines), `src/memory.ts`, `src/transcribe.ts`.
- Examples (`smart-checkin.ts`, `morning-briefing.ts`) are standalone scripts.
- Setup/test/daemon infrastructure is in place.

**What's next:**
- Get user answers to clarifying questions (CLI vs API, single vs multi-user, etc.).
- Implement Phase 1 refactor: extract modules, keep everything working.
- First step: create `src/config/index.ts` and `src/agent/claude-cli.ts` as the easiest extractions.

## 2026-02-19 — Phase 1 Refactor Complete

**Decisions recorded:**
- Keep Claude CLI spawning for now (switch to API later).
- Multi-user ready: interfaces accept userId, Config supports multiple allowed IDs.
- Fresh start: refactor first, set up services after.

**What was built (14 new files, ~1000 lines total):**

| Module | Files | Purpose |
|---|---|---|
| `src/config/` | `index.ts`, `profile.ts` | Typed Config, env loading, profile.md |
| `src/voice/` | `index.ts`, `groq.ts`, `local.ts` | Transcription router, two providers |
| `src/memory/` | `index.ts`, `supabase.ts`, `intents.ts` | MemorySystem interface, Supabase client, intent parser |
| `src/agent/` | `index.ts`, `prompt.ts`, `claude-cli.ts` | Orchestrator, prompt builder, CLI spawner |
| `src/channels/telegram/` | `bot.ts`, `send.ts` | grammY bot + handlers, response chunking |
| `src/` | `index.ts` | Entry point: init + start |

**Key design choices:**
- `MemorySystem` is an interface, not a class — easy to swap backends later.
- All memory functions accept optional `userId` for multi-user readiness.
- `Config.telegram.allowedUserIds` is an array (supports comma-separated IDs in env).
- Original `src/relay.ts` preserved as `start:legacy` script.
- `IncomingMessage` type abstracts over text/voice/photo/document.

**Known bugs in inherited code (found during deep audit):**

- `setup/test-voice.ts` imports `dotenv/config` but `dotenv` is not in package.json (will error).
- `setup/verify.ts` checks for `GEMINI_API_KEY` — leftover, Gemini not implemented anywhere.
- Session ID extraction regex in `callClaude()` may not match actual Claude CLI output format — `--resume` likely broken.
- `examples/supabase-schema.sql` is a near-duplicate of `db/schema.sql` — should be removed.
- Memory semantic search only queries `messages` table, never `memory` table (facts/goals unsearchable).
- `examples/smart-checkin.ts` data fetchers are all hardcoded placeholders, never connected to Supabase.

**What's next:**

- Install bun and dependencies.
- Create `.env` with Telegram bot token + user ID.
- Run `bun run start` to test the full Telegram → Claude → reply path.
- Then: set up Supabase, or move to Phase 2 features (task model).

## 2026-02-19 — Rebranding + Setup Complete

**Rebranding (all traces of old project removed):**
- Deleted WHATS-NEXT.md, rewrote README.md for Bright.
- Renamed service IDs (com.claude.* → com.bright.*), paths (claude-telegram-relay → bright), display strings, data dir (.claude-relay → .bright), PM2/NSSM names.
- Renamed daemon/claude-relay.service → daemon/bright.service.
- Fixed inherited bug: verify.ts was checking GEMINI_API_KEY instead of VOICE_PROVIDER.
- All 7 verification greps pass clean.

**Local bot running:**
- Installed Bun 1.3.9 and all dependencies.
- Created .env with Telegram bot token, user ID, name, timezone.
- Fixed Claude CLI nested session error (strip CLAUDECODE env var from spawn).
- Tested full Telegram → Claude CLI → reply path — working.

**Supabase fully configured:**
- Tables: messages, memory, logs (with RLS, indexes, vector columns).
- RPC functions: get_recent_messages, get_active_goals, get_facts, match_messages, match_memory.
- Edge Functions deployed: embed (auto-embedding) and search (semantic search).
- OpenAI API key stored as Supabase Edge Function secret.
- Database webhooks: auto-embed on INSERT to messages and memory tables.
- End-to-end verified: insert → webhook → OpenAI embedding → stored on row.
- Supabase MCP configured for future sessions.

**Roadmap updated:**
- Added Phase 1.5 (VPS & Hybrid Deployment) as next priority.
- Added open questions: VPS provider, hybrid mode detection.

**What's next:**
- Phase 1.5: VPS deployment for 24/7 availability.
  - Build Anthropic API caller (alternative to CLI for server use).
  - Deploy to VPS, pointing at same Supabase.
  - Hybrid mode: local when at computer, VPS when away.
- Fix remaining known bugs (dotenv import, session resume regex, duplicate schema file).
- Voice setup (Groq or local whisper).

## 2026-02-19 — Bug Fixes + API Backend + Profile

**Bug fixes (4 inherited issues resolved):**
- `setup/test-voice.ts`: Removed broken `import "dotenv/config"` (dotenv not in deps).
- `src/agent/claude-cli.ts`: Removed broken session ID regex, replaced with deterministic `--resume bright-relay`.
- `src/memory/index.ts`: `getRelevantContext` now searches BOTH messages AND memory tables via `Promise.allSettled`.
- Deleted duplicate `examples/supabase-schema.sql`.
- Simplified `callClaude` signature (removed unused paths param and CallClaudeOptions).

**Anthropic API backend (AGENT_BACKEND=api):**
- Installed `@anthropic-ai/sdk` v0.78.0.
- Created `src/agent/anthropic-api.ts` — calls Anthropic Messages API directly.
- Extended Config: `AgentBackend` type, `AnthropicConfig` interface, validation.
- Refactored `buildPrompt()` → returns `{ system, user }` instead of flat string (API uses dedicated system field, CLI concatenates).
- Updated orchestrator with backend selector.
- Updated `.env.example` with new vars.
- Tested: bot running with `AGENT_BACKEND=api` on Telegram, messages flowing through API and saving to Supabase.

**Personality fix:**
- Bot was saying "I don't have personal projects" — `config/profile.md` was missing.
- Created `config/profile.md` with Bright's personality: proactive, remembers things, tracks goals, casual/direct communication, no AI disclaimers.

**Current state:**
- Bot running with `AGENT_BACKEND=api` (Anthropic Messages API).
- Full stack: Telegram → grammY → orchestrator → Anthropic API → Supabase memory → reply.
- Profile loaded, personality should be correct.
- VPS deployment deferred to after Phase 5.

**Remaining known bugs:**
- `setup/verify.ts` still checks `GEMINI_API_KEY` — cosmetic, low priority.
- `examples/smart-checkin.ts` data fetchers are hardcoded placeholders.

**What's next:**
- Voice: Groq Whisper for STT, ElevenLabs for TTS.
- Phase 2: UX improvements (markdown formatting, typing indicators, task model).
- Phase 3: Voice (transcription + synthesis).
- Phase 4: Proactive AI (smart check-ins, morning briefings).
- Phase 5: Tools (web search, calendar, etc.).
- After Phase 5: VPS/hybrid deployment.

## 2026-02-19 — Voice (STT + TTS) + Autonomous Task System

**Voice transcription (Groq Whisper):**
- Already wired in from Phase 1 refactor — just needed env vars.
- Added `VOICE_PROVIDER=groq` and `GROQ_API_KEY` to `.env`.
- Tested: voice messages transcribed and replied to successfully.

**Voice synthesis (ElevenLabs TTS):**
- Created `src/voice/tts.ts` — ElevenLabs API → MP3 → ffmpeg OGG Opus conversion.
- Added `TTSConfig` to `src/config/index.ts` (provider, apiKey, voiceId, model).
- Wired into `bot.ts` voice handler: voice messages now get both a voice reply and text reply.
- Default voice: George (`JBFqnCBsd6RMkjVDRZzb`), model: `eleven_turbo_v2_5`.
- Falls back to MP3 audio file if ffmpeg unavailable.

**Autonomous background task system (6 new files):**

| File | Purpose |
|------|---------|
| `src/agent/tasks/types.ts` | Task, TaskTool, TaskRunnerOptions interfaces |
| `src/agent/tasks/tools.ts` | web_search (Tavily), fetch_url (HTTP+HTML→text), send_progress (Telegram proactive) |
| `src/agent/tasks/runner.ts` | Agentic tool-use loop — calls Anthropic API with tools, loops until done |
| `src/agent/tasks/intents.ts` | Parses `[TASK:]`, `[TASKS: status]`, `[TASKS: cancel ID]` tags |
| `src/agent/tasks/manager.ts` | Task lifecycle: create Supabase row, spawn async runner, deliver results |
| `src/agent/tasks/index.ts` | Public re-exports |

**How it works:**
1. User sends a research/work request via Telegram.
2. Chat-mode Claude responds with acknowledgment + `[TASK: description]` tag.
3. Tag is parsed and stripped from visible reply.
4. `TaskManager.createAndRunTask()` fires async (non-blocking).
5. Background agent loop uses web_search, fetch_url, send_progress tools.
6. Progress updates sent to Telegram as `[Task Update]` messages.
7. Final result delivered to Telegram when complete.
8. Task tracked in Supabase `tasks` table with status, iteration count, token usage.

**Supabase migration applied:**
- `tasks` table with status, description, result, error, iteration tracking, token usage.
- `get_active_tasks()` RPC function for fetching running/pending tasks.
- RLS enabled with public access policy.

**Modified files:**
- `src/config/index.ts` — added TTSConfig, TasksConfig.
- `src/agent/prompt.ts` — added TASK MANAGEMENT section + taskContext injection.
- `src/agent/index.ts` — parse task intents, execute them, pass taskManager.
- `src/channels/telegram/bot.ts` — create taskManager, wire sendMessage callback.
- `src/channels/telegram/send.ts` — added `sendLongMessage()` for proactive messaging.
- `.env.example` — added TTS and task config sections.

**Design decisions:**
- Intent tags (`[TASK:]`) for detection, not tool_use — keeps chat-mode simple.
- In-process async Promises for background tasks — no IPC complexity.
- Tavily for web search (AI-native, free 1000/month, structured results).
- No new npm dependencies — everything uses fetch() directly.

**Current state:**
- Bot running with full stack: chat + memory + voice (STT/TTS) + background tasks.
- Tavily API key configured for web search.
- Ready for end-to-end testing of task system.

**What's next:**
- Test autonomous task system end-to-end (research request → results).
- Phase 2 UX: Markdown formatting, typing indicator improvements.
- Additional task tools: YouTube transcript, Semantic Scholar, etc.
- Inline Telegram buttons for task management.
- Full-duplex voice calls (deferred — requires tgcalls/LiveKit).
- VPS/hybrid deployment after core features complete.

## 2026-02-19 — Phase 2 UX + Phase 4 Proactive AI

**Phase 2 UX improvements (3 new files, 3 modified):**

| File | Purpose |
|------|---------|
| `src/channels/telegram/format.ts` | Markdown-to-HTML converter (`toTelegramHtml`) |
| `src/channels/telegram/typing.ts` | Persistent typing indicator (4s interval, 120s safety) |
| `src/channels/telegram/send.ts` | HTML parse_mode with plain-text fallback on error |
| `src/channels/telegram/bot.ts` | Persistent typing + inline task cancel buttons |
| `src/agent/index.ts` | `AgentResponse { text, taskIds }` return type |
| `src/agent/prompt.ts` | Formatting guidance for Telegram HTML |

**Phase 4 proactive AI (scheduler):**
- Built `src/scheduler/data.ts` — real data fetchers (weather via Open-Meteo, active goals/tasks/recent messages from Supabase).
- Built `src/scheduler/briefing.ts` and `src/scheduler/checkin.ts` — production scheduler scripts.
- Added `LocationConfig` and location env vars to config.
- Set up launchd services for macOS scheduling.

## 2026-02-20 — Phase 5: Chat Tools, Approval Flows, MCP Integration

**New tool system (12 new files):**

| File | Purpose |
|------|---------|
| `src/tools/types.ts` | `ChatTool`, `ToolScope`, `ApprovalPolicy`, `ApprovalCallback` |
| `src/tools/registry.ts` | `ToolRegistry` — register, lookup, filter by scope |
| `src/tools/approval.ts` | `ApprovalManager` — Promise-based pending map, 60s timeout |
| `src/tools/index.ts` | Re-exports + `createBuiltinTools()` factory |
| `src/tools/builtin/weather.ts` | `get_weather` — Open-Meteo via `scheduler/data.ts` |
| `src/tools/builtin/search.ts` | `web_search` — Tavily API |
| `src/tools/builtin/memory-search.ts` | `search_memory` — query facts/goals/messages |
| `src/tools/builtin/datetime.ts` | `get_datetime` — current time, timezone conversion |
| `src/tools/builtin/fetch-url.ts` | `fetch_url` — HTTP fetch + HTML-to-text |
| `src/tools/mcp/client.ts` | `MCPClientManager` — stdio transport, tool discovery |
| `src/tools/mcp/adapter.ts` | `importMCPTools` — MCP → ChatTool adapter |
| `src/tools/mcp/index.ts` | MCP re-exports |

**Chat-level tool-use loop (`src/agent/chat-loop.ts`):**
- Anthropic API tool_use loop for the main conversation.
- MAX_ITERATIONS=10, TIMEOUT=30s (vs 25/10min for background tasks).
- Supports human-in-the-loop approval mid-loop.
- Used when API backend + registry are available; falls back to simple API call otherwise.

**Approval flow:**
- `ApprovalManager` creates UUID-keyed Promises resolved by Telegram inline buttons.
- Approve/Reject buttons sent to primary user, auto-rejects after 60s.
- Tools declare approval policy: `never`, `always`, or `destructive` (per-call check).

**MCP integration:**
- `MCPClientManager` connects to servers via stdio transport (child processes).
- `importMCPTools` converts MCP tool definitions → `ChatTool` with namespaced names (`server__tool`).
- Config loaded from `MCP_CONFIG_PATH` JSON file. Example at `config/mcp-servers.example.json`.
- MCP connections cleaned up on SIGINT/SIGTERM.
- Installed `@modelcontextprotocol/sdk` and `zod`.

**Modified files:**
- `src/agent/index.ts` — routes to `runChatLoop()` when tools available, passes registry + approval.
- `src/agent/prompt.ts` — AVAILABLE TOOLS section listing tool names.
- `src/channels/telegram/bot.ts` — creates registry, approval manager, MCP connections at startup; approve/reject callback handlers.
- `src/config/index.ts` — `MCPConfig`, `MCPServerEntry` types; loads MCP config from JSON.
- `.env.example` — MCP section.
- `src/index.ts` — `await createBot()` (now async for MCP init).

**Design decisions:**
- Chat-loop separate from task runner — different timeouts, different concerns.
- Registry is additive — background tasks keep their own tool construction.
- MCP tools namespaced as `servername__toolname` to prevent collisions.
- Approval via Promise pending map — no DB table, 60s timeout prevents dangling promises.

**Current state:**
- Full tool system wired: built-in tools + MCP + approval flows.
- Bot compiles clean and starts successfully.
- Ready for end-to-end testing of chat tool use.

**What's next:**
- Test chat tools end-to-end (weather, search, memory queries via Telegram).
- Test approval flow (add an `approval: "always"` tool, verify buttons work).
- Configure Google Workspace MCP server for calendar/email.
- Voice/calls improvements (full-duplex, hold-to-talk — deferred feature).
- Phase 6: Multi-agent orchestration (on hold per user request).

## 2026-02-20 — Always-On Agent: Durable Queue, Mid-Task Dialogue, Heartbeat

**Motivation:** Task system was fire-and-forget — tasks lost on crash, no queue, no concurrency control, no way for tasks to ask the user questions, scheduler running as separate processes.

**Supabase migration applied:**
- Extended `tasks` table: priority, system_prompt, conversation_history (JSONB), pending_question, pending_question_id, pending_question_at, last_heartbeat, started_at, completed_at.
- Added RPCs: `get_queued_tasks()`, `get_overnight_summary(since)`, `get_stuck_tasks(stale_threshold)`.
- New statuses: `queued`, `waiting_user`.

**Durable Task Queue (5 files modified/created):**

| File | Change |
|------|--------|
| `src/agent/tasks/types.ts` | New `TaskStatus` type with `queued`/`waiting_user`, expanded `Task` and `TaskRunnerOptions` interfaces |
| `src/agent/tasks/runner.ts` | Resume from saved state (`resumeHistory`), `AbortSignal` for cancellation, `onSaveState` for persistence |
| `src/agent/tasks/queue.ts` | **NEW** — `TaskQueue` class: bounded concurrency (default 2), 5s poll loop, 30s heartbeat, crash recovery |
| `src/agent/tasks/manager.ts` | Uses `queue.enqueue()` instead of fire-and-forget, exposes `buildTools`/`buildSystemPrompt`/`setQueue` for queue |
| `src/agent/tasks/tools.ts` | **NEW** `createAskUserTool` — mid-task dialogue tool |
| `src/agent/tasks/index.ts` | Exports `TaskQueue`, `TaskQueueConfig`, `TaskQueueDeps`, `TaskStatus` |

**How the queue works:**
1. Task inserted into Supabase with `status: "queued"`.
2. Queue polls every 5s, starts tasks when slots open (max 2 concurrent).
3. Each task gets its own `AbortController` for real cancellation.
4. Conversation history saved to Supabase JSONB after each tool-use iteration.
5. On bot restart: tasks with saved state re-queue for resume; tasks without state marked failed.
6. `waiting_user` tasks get their questions re-sent after restart.

**Mid-task dialogue (ask_user tool):**
- Background task calls `ask_user` with question + optional quick-reply options.
- Telegram message sent with inline buttons (options + "Type my answer...").
- Task pauses (Promise-based, like approval flow).
- User responds via button or next text message → task resumes.
- 30-minute timeout → auto-continues with "proceed with best judgment".
- Pending questions map in bot.ts, resolved by callback handlers.

**Integrated heartbeat (1 new file):**

| File | Purpose |
|------|---------|
| `src/scheduler/heartbeat.ts` | `Heartbeat` class + `fetchOvernightActivity()` |

- Runs inside bot process as `setInterval` timers (opt-in: `HEARTBEAT_ENABLED=true`).
- **Check-in cycle** (every 30 min): time guard → fetch context → Claude decides → send if YES.
- **Briefing cycle** (once per day at configured hour): full briefing with overnight activity summary.
- **Overnight summary**: fetches tasks completed/failed since ~10pm yesterday, includes in morning briefing.
- Standalone scripts (checkin.ts, briefing.ts) preserved as fallback for launchd/cron.

**Wiring changes:**

| File | Change |
|------|--------|
| `src/config/index.ts` | Added `QueueConfig`, `HeartbeatConfig` interfaces + env loading |
| `src/channels/telegram/bot.ts` | Returns `BotResult { bot, taskQueue, taskManager }`; pending questions map; sendQuestion callback; `task_respond:` handler |
| `src/index.ts` | Destructures `BotResult`; starts queue + heartbeat; unified graceful shutdown |
| `src/scheduler/index.ts` | Exports `Heartbeat`, `fetchOvernightActivity` |
| `.env.example` | Queue and heartbeat config sections |

**Design decisions:**
- Single process: queue + heartbeat run in-process with setInterval. launchd handles restart.
- 2 concurrent tasks max: prevents runaway API costs, keeps chat responsive.
- State in Supabase JSONB: conversation_history stores full Anthropic messages array, bounded by 25 max iterations.
- ask_user is Promise-based: same pattern as approval flow — in-memory map, resolved by Telegram callback.
- Heartbeat is opt-in: standalone scripts preserved as fallback.

**Current state:**
- Full always-on agent stack: durable queue, crash recovery, mid-task dialogue, heartbeat.
- Bot compiles clean and starts successfully.
- Ready for end-to-end testing.

**What's next:**
- Test queue end-to-end: send multiple research tasks, verify they queue and run.
- Test crash recovery: kill bot mid-task, restart, verify resume.
- Test ask_user: trigger a task that needs clarification, verify buttons + free-text work.
- Enable heartbeat (`HEARTBEAT_ENABLED=true`) and test check-in/briefing cycle.
- Phase 5.5: Voice & Calls (full-duplex, hold-to-talk — deferred).
- Phase 6: Multi-agent orchestration (on hold).

## 2026-02-20 — Phone Channel: Telnyx Voice Integration

**Motivation:** Add a real phone number to Bright so the user can call and have a spoken conversation with the same AI assistant (shared tools, memory, personality). Inspired by ClawdTalk (Telnyx + OpenClaw).

**Approach chosen:** Telnyx AI Assistant + Custom LLM Endpoint. Telnyx handles real-time voice (STT, TTS, VAD, interruption). Bright exposes an OpenAI-compatible `/v1/chat/completions` endpoint that Telnyx calls for each conversational turn. ~250 lines of new code vs ~900 for the DIY WebSocket approach.

**New files (4):**

| File | Purpose |
|------|---------|
| `src/channels/phone/index.ts` | Exports + `PhoneSessionManager` |
| `src/channels/phone/server.ts` | `Bun.serve` HTTP server with route dispatch |
| `src/channels/phone/completions.ts` | OpenAI-compatible `/v1/chat/completions` + `/v1/models` endpoints |
| `src/channels/phone/session.ts` | `PhoneSessionManager` — per-call session tracking with auto-cleanup |

**Modified files (6):**

| File | Change |
|------|--------|
| `src/config/index.ts` | Added `TelnyxConfig`, `ServerConfig` interfaces + env loading |
| `src/memory/index.ts` | Channel now read from `metadata.channel` instead of hardcoded `"telegram"` |
| `src/agent/prompt.ts` | Phone-aware prompt: brief conversational style, no markdown, no task tags |
| `src/agent/index.ts` | Passes `channel` from message metadata through to prompt builder |
| `src/channels/telegram/bot.ts` | Exposes `registry` in `BotResult` for sharing with phone server |
| `src/index.ts` | Conditionally starts phone HTTP server if `HTTP_PORT` configured |
| `.env.example` | Added `TELNYX_*`, `HTTP_PORT`, `PUBLIC_URL`, `SERVER_API_KEY` |

**Architecture:**
```
Phone Call → Telnyx AI Assistant (STT + TTS + voice management)
                  ↓ HTTP POST /v1/chat/completions
             Bun.serve (same process as Telegram bot)
                  ↓
             handleMessage() → tools, memory, Claude
                  ↓
             Response JSON → Telnyx → TTS → Phone
```

**Design decisions:**
- Same process: HTTP server runs alongside grammY bot via `Bun.serve`, shares config/memory/tools/profile.
- Shared memory: phone calls save messages with `channel: "phone"`, searchable alongside Telegram.
- Shared tools: phone server receives the same `ToolRegistry` (including MCP tools).
- No task spawning on phone: `[TASK:]` tags suppressed in phone prompt (background tasks don't work mid-call).
- No approval callback on phone: inline buttons don't exist; tools run without approval.
- API key auth: `SERVER_API_KEY` validates inbound requests from Telnyx.
- Session management: `PhoneSessionManager` tracks per-call context with 1-hour auto-cleanup.
- The `/v1/chat/completions` endpoint is reusable by any OpenAI-compatible client.

**Current state:**
- Phone channel code compiles clean.
- All imports resolve successfully.
- Ready for Telnyx account setup and end-to-end testing.

**To activate (manual steps):**
1. Create Telnyx account, buy a phone number.
2. Create AI Assistant in Telnyx portal with Custom LLM.
3. Set `HTTP_PORT=3000` and `SERVER_API_KEY` in `.env`.
4. Use `ngrok http 3000` for public URL during development.
5. Point Telnyx Custom LLM base URL to `https://<ngrok-url>/v1`.
6. Call the phone number.

**What's next:**
- Set up Telnyx account and test end-to-end phone call.
- Add SSE streaming support to `/v1/chat/completions` for faster time-to-first-word.
- Consider Approach B (DIY WebSocket media streaming) if more voice control needed.
- VPS deployment for 24/7 availability (both Telegram + phone).

## 2026-02-20 — Phone Channel: First Call + Context & Latency Fixes

**First successful phone call:**
- Telnyx account set up, phone number purchased, AI Assistant configured with Custom LLM.
- Validated `/v1/chat/completions` endpoint via curl — clean conversational responses.
- First call connected successfully — voice responses heard after adding SSE streaming support.
- Telnyx sends `stream: true` and expects SSE (`text/event-stream`) format.

**Critical bugs found during live testing:**

1. **Context loss mid-conversation:** Every conversational turn from Telnyx generates a NEW conversation ID (no persistent ID in headers). Each turn was treated as a completely fresh conversation with zero history. The agent couldn't remember what was said 5 seconds ago.

2. **Duplicate request flooding:** Telnyx sends the same transcribed utterance 5-7 times simultaneously with different conversation IDs. Each duplicate triggered a full agent invocation, flooding the messages table and wasting API calls.

3. **Assistant responses labeled wrong channel:** `memory.saveMessage("assistant", ...)` was called without metadata, defaulting all assistant responses to `channel: "telegram"` in Supabase.

4. **Semantic search useless for voice:** Embedding webhooks are async — embeddings aren't ready for messages saved seconds ago. For rapid voice turns, semantic search returns nothing useful.

5. **Model too slow for voice:** Sonnet 4 inference (~3-5s) creates noticeable dead air in phone conversations.

**Fixes applied:**

| Fix | File(s) | Description |
|-----|---------|-------------|
| SSE streaming | `completions.ts` | Detects `stream: true`, returns `text/event-stream` with proper chunk + finish + `[DONE]` format |
| Conversation history injection | `completions.ts`, `agent/index.ts`, `prompt.ts` | Passes Telnyx's `body.messages` array as `conversationHistory` metadata; injected as RECENT CONVERSATION section in prompt |
| Skip semantic search for phone | `agent/index.ts` | When `conversationHistory` is present, skips the slow/useless semantic search; still fetches facts/goals |
| Request deduplication | `completions.ts` | Content-hash based dedup with 3-second window; duplicate requests return cached response |
| Channel metadata fix | `agent/index.ts` | `saveMessage("assistant", ...)` now passes `message.metadata` to preserve `channel: "phone"` |
| Haiku for phone | `agent/index.ts` | Phone calls use `claude-haiku-4-5-20251001` by default (configurable via `PHONE_MODEL` env var), with `maxTokens: 1024` |

**Latency budget analysis:**
- Telnyx STT: ~200ms (handled by Telnyx)
- Semantic search (skipped): was ~500ms, now 0ms
- Facts/goals fetch: ~100ms (parallel)
- LLM inference (Haiku): ~500ms-1s (was 3-5s with Sonnet)
- Telnyx TTS: ~200ms (handled by Telnyx)
- **Total estimated: ~1-1.5s** (was 4-6s)

**Current state:**
- Phone channel working end-to-end with conversation context preserved across turns.
- Duplicate requests deduplicated.
- Latency significantly reduced via Haiku + skipped semantic search.
- Ready for re-testing.

**What's next:**
- Re-test phone call with all fixes applied — verify context retention across turns.
- Monitor logs for `[phone]` prefix entries to validate dedup and history injection.
- Consider true token-by-token streaming (stream from Anthropic API → SSE) for even faster time-to-first-word.
- VPS deployment for 24/7 availability (both Telegram + phone).
- Consider Approach B (DIY WebSocket) if more voice control needed.

## 2026-02-20 — Background Tasks Fix: CHECK Constraint Mismatch

**Problem:** Background research tasks stopped working. User reported: sent a research request about OpenClaw via Telegram, got an acknowledgment ("On it!"), but no task was ever created in the `tasks` table and no research results were delivered. The `[TASK:]` tag was successfully parsed (visible in the stripped response text), but `createAndRunTask()` silently failed.

**Root cause:** The `tasks` table's `tasks_status_check` CHECK constraint only allowed: `pending`, `running`, `completed`, `failed`, `cancelled`. But the code inserts tasks with `status: "queued"` (in `createAndRunTask`) and updates to `"waiting_user"` (in the ask_user flow). Both of these are rejected by Postgres with a constraint violation.

The task system code uses 7 statuses (`types.ts`): `pending | queued | running | waiting_user | completed | failed | cancelled`. But the database CHECK constraint only had 5 (missing `queued` and `waiting_user`). The constraint was likely out of sync since the durable queue was added — the migration that added `queued`/`waiting_user` statuses to the TypeScript types didn't update the database CHECK.

**How it manifested:**

1. User sends research request → Claude responds with `[TASK: ...]` tag
2. `parseTaskIntents()` strips the tag and creates intent — works fine
3. `createAndRunTask()` tries to INSERT with `status: "queued"` → Postgres rejects it
4. Error logged: `console.error("Failed to create task:", error)` (server-side only)
5. `createAndRunTask()` returns `"Failed to create task."` → silently caught by the `startsWith("Failed")` check
6. User sees the acknowledgment but no task ever runs

**Why 3 older tasks worked:** The 3 existing completed tasks (Boston hotels, agentic AI, go-to-market) were likely created before the constraint was in its current form, or the constraint was updated at some point between those tasks and the OpenClaw request.

**Fix applied:**
- Supabase migration `fix_tasks_status_check_constraint`: dropped and re-created the CHECK to include all 7 statuses.
- Verified full lifecycle: `queued` → `running` → `waiting_user` → `completed` all pass.
- Added the `tasks` table definition to `db/schema.sql` (was completely missing — table had been created ad-hoc without being tracked in the schema file).
- Schema file now documents all 4 tables: messages, memory, logs, tasks.

**Files changed:**
- `db/schema.sql` — Added tasks table DDL + indexes + RLS policy (documentation fix)
- Supabase: migration applied to fix CHECK constraint

**Current state:**
- Task creation pipeline unblocked — `status: "queued"` inserts succeed.
- All phone channel fixes from previous session still in place.
- Ready for restart and end-to-end test of a Telegram research request.

**What's next:**
- Restart the bot and test a research request end-to-end via Telegram.
- Re-test phone call with all context/latency fixes.
- VPS deployment for 24/7 availability.

## 2026-02-20 — Crash Resilience: Error Handling & API Retry Strategy

**Problem:** Bot crashes entirely when the Anthropic API returns a 529 "Overloaded" error during concurrent usage. A background research task was running (iteration 6) while the user sent a new Telegram message. The chat-loop API call hit 529, the error propagated unhandled through grammY middleware, and the process exited.

**Root cause:** Three layers of missing error handling combined:

1. `bot.on("message:text")` had `try/finally` but no `catch` — every other handler had try/catch
2. No `bot.catch()` global error handler — grammY's default is to crash on unhandled errors
3. No `process.on("uncaughtException")`/`unhandledRejection` — no last-resort safety net

The Anthropic SDK retries 529 automatically (default `maxRetries: 2`), but 3 attempts weren't enough. After exhausting retries, the thrown error had nowhere safe to land.

**Fixes applied:**

| Fix | File | Description |
|-----|------|-------------|
| Global bot error handler | `bot.ts` | `bot.catch()` catches any unhandled middleware errors, logs them, notifies user |
| Text handler try/catch | `bot.ts` | Added missing `catch` block matching voice/photo/document pattern |
| Process safety nets | `index.ts` | `uncaughtException` + `unhandledRejection` handlers prevent process crash |
| Increased API retries | `chat-loop.ts`, `anthropic-api.ts` | `maxRetries: 3` (4 total attempts with backoff) |
| Background task retries | `runner.ts` | `maxRetries: 5` (6 total attempts — background tasks can afford longer waits) |
| Queue send guards | `queue.ts` | `.catch(() => {})` on `sendMessage` calls to prevent secondary crashes |

**Current state:**
- Bot will no longer crash from transient API errors.
- Background tasks retry more aggressively (5 retries vs 2 default).
- All error paths gracefully notify the user instead of crashing.

**What's next:**
- Restart and test concurrent research tasks.
- Re-test phone call with all previous fixes.
- VPS deployment for 24/7 availability.

## 2026-02-20 — Admin UI: Browser-Based Configuration Panel

**Motivation:** Need a way to configure settings, review chat logs, and manage MCP servers without editing files manually. Lightweight browser dashboard served from the existing HTTP server.

**New files (6):**

| File | Purpose |
|------|---------|
| `src/admin/env-parser.ts` | .env reader/writer — preserves comments and structure, creates `.env.backup` before writes |
| `src/admin/api.ts` | API handlers: status, config GET/PUT, MCP GET/PUT, messages, memory, tasks (all paginated) |
| `src/admin/routes.ts` | Route dispatcher — serves static files, checks Bearer auth for API routes |
| `src/admin/static/index.html` | SPA shell — Pico CSS (dark theme from CDN), nav, login dialog |
| `src/admin/static/app.js` | SPA router with 4 pages: Dashboard, Configuration, Chat Logs, MCP Servers |
| `src/admin/static/app.css` | Status badges, config grid layout, message styles, restart banner |

**Modified files (2):**

| File | Change |
|------|--------|
| `src/channels/phone/server.ts` | Added admin route delegation (`/admin/*`) before 404 fallback; `HTTPServerDeps` extends `PhoneDeps` with optional `adminDeps` |
| `src/index.ts` | Constructs `AdminDeps` with config, supabase client, task queue, env path; passes to HTTP server |

**Architecture:**
- Extends existing `Bun.serve` HTTP server — no separate process or port.
- Auth: `SERVER_API_KEY` required as `Authorization: Bearer` header for all API endpoints.
- Frontend: Vanilla HTML/JS SPA with hash-based routing. No build step, no npm deps.
- Pico CSS from CDN for dark-theme styling.
- Config changes write to `.env` (with backup), show "restart required" banner.
- Sensitive values (API keys) masked in GET responses (shows `****` + last 4 chars).
- Config PUT validates against a whitelist of known env var names.

**API endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/api/status` | Uptime, bot status, task queue counts, memory connection |
| GET | `/admin/api/config` | All env vars grouped by section (Core, Telegram, Anthropic, etc.) |
| PUT | `/admin/api/config` | Update env vars — writes to `.env`, creates backup |
| GET | `/admin/api/mcp` | List MCP servers from config JSON |
| PUT | `/admin/api/mcp` | Update MCP config file |
| GET | `/admin/api/messages` | Paginated chat messages from Supabase |
| GET | `/admin/api/memory` | Paginated memory entries from Supabase |
| GET | `/admin/api/tasks` | Paginated tasks with optional status filter |

**Frontend pages:**
- **Dashboard** — Status cards (uptime, bot status, memory, active/queued tasks) + recent tasks table.
- **Configuration** — Env vars in editable form grouped by section. Sensitive fields masked with show/hide toggle. Save → writes .env → "restart required" banner.
- **Chat Logs** — Paginated message list with role, channel, timestamp. Long messages truncated with click-to-expand.
- **MCP Servers** — List existing servers with remove button. Add form with name, command, args, approval policy.

**Current state:**
- Admin UI fully functional at `http://localhost:3000/admin` when `HTTP_PORT` and `SERVER_API_KEY` are set.
- All API endpoints tested via curl — auth, config, messages, status all working.
- Bot starts clean with admin routes integrated.

**What's next:**
- Live browser testing of the full admin UI workflow.
- Re-test concurrent research tasks with crash resilience fixes.
- Re-test phone call with all previous fixes.
- VPS deployment for 24/7 availability.

## 2026-02-20 — Fix: Task Result Continuity + Structured Logging

**Problem:** After a task completed, the heartbeat mentioned it was "available to review" 30 minutes later. When the user asked to see it, Bright responded generically — it had no memory of the task result. Investigation via Supabase confirmed the exact sequence: task completed at 16:25, heartbeat check-in at 16:54 mentioned it, user replied "sure" at 16:55, Bright said "Hey! What's up?" at 16:55.

**Root causes (3):**
1. Task results sent to Telegram (`sendMessage`) but never saved to `messages` table — invisible to semantic search and chat context.
2. `getActiveTasks()` only returns `queued/running/waiting_user` — completed tasks excluded from orchestrator context entirely.
3. No structured logging — couldn't trace the event sequence for debugging.

**Fixes applied:**

| Fix | File(s) | Description |
|-----|---------|-------------|
| Structured logger | `src/utils/logger.ts` (NEW) | Console + Supabase `logs` table. Format: `[HH:MM:SS] [COMPONENT] event — key=value`. Fire-and-forget DB writes. |
| Save task results to messages | `src/agent/tasks/queue.ts` | Added `saveMessage` to `TaskQueueDeps`. After `sendMessage`, calls `saveMessage("assistant", result, { source: "task", taskId, taskDescription })`. Also saves failed task messages. |
| Recent completions query | `src/agent/tasks/manager.ts` | New `getRecentCompletions(userId, hours=24)` — fetches completed/failed tasks from last 24h with result previews. |
| Completed tasks in context | `src/agent/index.ts`, `src/agent/prompt.ts` | Fourth parallel context fetch. Injects `RECENTLY COMPLETED TASKS` section with 500-char result previews + timeAgo labels into prompt. |
| Logger wiring | `src/channels/telegram/bot.ts`, `src/index.ts` | Logger created from Supabase client, passed to queue and heartbeat. All ad-hoc `console.log`/`console.error` replaced with structured `log.info`/`log.error` calls. |

**New file:**
- `src/utils/logger.ts` — `createLogger(supabaseClient?)` → `Logger { info, warn, error }`

**Modified files (7):**
- `src/agent/tasks/queue.ts` — `saveMessage` dep, logger integration, structured lifecycle logging
- `src/agent/tasks/manager.ts` — `getRecentCompletions()` method + interface update
- `src/agent/index.ts` — Fetches + injects completed task context, `timeAgo()` helper
- `src/agent/prompt.ts` — Accepts + includes `completedTaskContext`
- `src/channels/telegram/bot.ts` — Logger creation, passes `saveMessage`+`logger` to queue deps, structured logging in handlers
- `src/scheduler/heartbeat.ts` — Logger integration, replaced manual `logs` table inserts
- `src/index.ts` — Logger creation, passed to heartbeat

**How it fixes the continuity bug:**
1. Task result now saved to `messages` table → findable by semantic search on next conversation.
2. `getRecentCompletions()` provides explicit 24h window of completed tasks → injected into prompt as context.
3. When user says "show me the research", both semantic search AND explicit completions context will contain the task result.

**Current state:**
- Build passes clean (414 modules).
- Task results now persist in messages table for chat context.
- Structured logging throughout queue, bot, and heartbeat.
- Ready for end-to-end test: trigger research task → complete → ask about results.

**What's next:**
- End-to-end test: restart app, send messages on Telegram, verify Bright recalls conversation.
- VPS deployment for 24/7 availability.

## 2026-02-20 — Fix: Semantic Search Returning Zero Results (Memory Amnesia)

**Problem:** User reported Bright has "no memory at all" when chatting on Telegram. Bright said "I don't have any record of your previous questions" 49 seconds after successfully summarizing the conversation. Investigation showed all messages HAD embeddings — the data was there, but search returned nothing.

**Root cause:** The `search` Edge Function defaults to `match_threshold: 0.7`, but `text-embedding-3-small` cosine similarities between related messages are much lower than expected:
- Direct Q&A pair ("How about Claude code" → Claude Code response): **0.585**
- Topically related messages: **0.30–0.50**
- Meta-questions ("What were my last 3 things?"): only match themselves

A threshold of 0.7 filtered out **every single semantic match**. The search was working correctly — it was just too strict.

**Secondary issue:** No recent message history window. Pure semantic search can't handle meta-questions like "what did I just ask?" because the query is about *asking* things, not about the topics discussed. A rolling conversation window is needed for basic conversational continuity.

**Fixes applied:**

| Fix | File(s) | Description |
|-----|---------|-------------|
| Lower search threshold | `src/memory/index.ts` | Changed `match_threshold` from 0.7 (default) to 0.35 in both messages and memory search calls. |
| Recent messages context | `src/memory/index.ts` | New `getRecentMessages(limit=20)` method — fetches last 20 messages by recency (not similarity) for conversational continuity. |
| Wire into orchestrator | `src/agent/index.ts`, `src/agent/prompt.ts` | Fifth parallel context fetch. Injects `RECENT CONVERSATION` section with timestamped messages (300-char truncation). Skipped for phone channel. |
| Debug logging | `src/memory/index.ts` | `getRelevantContext` now logs errors/rejections via `console.warn` instead of silently returning `""`. |

**How it fixes the amnesia:**
1. Semantic search now returns matches (0.35+ threshold captures topically related messages).
2. Recent conversation window (last 20 messages) provides direct conversational continuity regardless of semantic similarity.
3. Meta-questions like "what were my last 3 questions?" are answerable from the recent messages window.
4. Search errors are now visible in console output for debugging.

**Current state:**
- Build passes clean (414 modules).
- Ready for end-to-end test: restart app, chat on Telegram, ask about recent conversation.

**What's next:**
- End-to-end test: restart app, chat on Telegram, verify memory works.
- VPS deployment for 24/7 availability.

## 2026-02-20 — Memory Architecture: Conversation-First with Tool-Based Retrieval

**Problem:** Semantic search fired on every single message — calling a Supabase Edge Function → OpenAI embeddings API → pgvector search. This was expensive, often irrelevant for casual chat, and redundant with the `search_memory` tool that already existed. Modern agentic patterns (Mem0, LangMem, A-MEM) treat memory retrieval as a tool the LLM invokes on demand, not an automatic pipeline step.

**Architecture change:**

| Before | After |
|--------|-------|
| 5 parallel fetches per message | 4 parallel fetches per message |
| Automatic semantic search (OpenAI API call) | Removed — LLM calls `search_memory` tool when needed |
| 20 recent messages (300 char truncation) | 50 recent messages (500 char truncation) |
| No keyword search | New `search_conversations` tool for keyword + time range |

**What changed:**

| File | Change |
|------|--------|
| `src/agent/index.ts` | Removed `getRelevantContext()` from parallel fetches; expanded recent messages to 50 |
| `src/agent/prompt.ts` | Removed `relevantContext` opt; added memory tool guidance to AVAILABLE TOOLS section |
| `src/memory/index.ts` | `getRecentMessages` default 50, 500-char truncation; new `getConversationHistory()` for keyword + time range search |
| `src/tools/builtin/memory-search.ts` | Enhanced description: explicit about when to use (previous sessions, long-term memory) |
| `src/tools/builtin/conversation-search.ts` | NEW — keyword + time range search tool (`search_conversations`) |
| `src/tools/index.ts` | Register `search_conversations` tool |

**Memory strategy now:**
- **Always-on** (cheap): facts/goals, active tasks, completed tasks, last 50 messages
- **On-demand** (LLM decides): `search_memory` (semantic similarity), `search_conversations` (keyword + recency)
- `getRelevantContext()` stays on the MemorySystem interface — the `search_memory` tool still calls it

**Current state:**
- Build passes clean (415 modules).
- Ready for end-to-end test.

**What's next:**
- End-to-end test: restart app, test memory continuity and tool-based retrieval.
- VPS deployment for 24/7 availability.

## 2026-02-20 — Proactive Agent: OpenClaw-Inspired Heartbeat Upgrade (Phase 1 & 2)

**Motivation:** Bright's heartbeat fired every 30 minutes during active hours and always called the Anthropic API — even when nothing had changed. Research into OpenClaw (an open-source personal AI assistant) revealed a more efficient pattern: cheap deterministic pre-checks before LLM calls, persistent state between heartbeat cycles, and configurable monitoring rules.

**Phase 1 — State Persistence + Cheap Pre-checks (3 new files, 2 modified):**

| File | Purpose |
|------|---------|
| `src/scheduler/state.ts` | `HeartbeatState` types + JSON persistence (`~/.bright/heartbeat-state.json`) with atomic writes, daily counter resets |
| `src/scheduler/wake.ts` | `shouldWake()` deterministic pre-checks: time guard (2h min), daily limit (3/day), user inactivity (4h), new completed tasks, approaching goal deadlines (24h), state change detection |
| `src/scheduler/data.ts` | Added `fetchGoalsRaw()` — raw goal data with IDs and ISO deadlines for deadline comparison |
| `src/scheduler/heartbeat.ts` | Two-tier `wake()` → `run()` architecture. `wake()` does cheap Supabase queries + deterministic checks (no LLM). `run()` fetches full context + LLM decision (only when signaled). Wake signals passed into prompt. State updated after each cycle. |
| `src/scheduler/index.ts` | Exports new types: `HeartbeatState`, `StateSnapshot`, `WakeSignal`, `WakeDecision`, `GoalRaw` |

**How the wake check works:**
1. Every 30 min: fetch lightweight snapshot (activity + task counts) — cheap Supabase queries
2. Run `shouldWake()` — deterministic checks in order:
   - Time guard: skip if last check-in < 2 hours ago
   - Daily limit: skip if 3+ check-ins already sent today
   - Signal detection: user inactive 4h+, new completed tasks, goal deadlines within 24h, state changed
3. If no signals → log skip reason, save state, done (no LLM call)
4. If signals found → proceed to full LLM check-in with signals in prompt

**Phase 2 — Configurable Monitoring + Config Injection (3 new files, 3 modified):**

| File | Purpose |
|------|---------|
| `config/heartbeat.example.md` | Example heartbeat config with monitoring rules, communication style, briefing preferences |
| `config/heartbeat.md` | Active config (user-editable) — defines what to monitor, how to communicate, limits |
| `src/config/profile.ts` | Added `loadHeartbeatRules()` — reads `config/heartbeat.md` at startup |
| `src/scheduler/heartbeat.ts` | `HeartbeatDeps` now includes `heartbeatRules: string`; injected into both check-in and briefing system prompts |
| `src/index.ts` | Loads heartbeat rules at startup, passes to Heartbeat constructor; `heartbeat.start()` now `await`ed |

**Impact:**
- ~85% fewer heartbeat API calls (cheap pre-checks eliminate "nothing changed" cycles)
- No duplicate alerts (state tracking + dedup sets)
- User-controllable behavior (edit `config/heartbeat.md` without code changes)
- No new database migrations (state lives on local filesystem)

**Current state:**
- Build passes clean (417 modules).
- Phases 1 & 2 complete.
- Phases 3 (follow-up tracking) and 4 (event-driven triggers) designed but not yet implemented.

**What's next:**
- End-to-end test: enable heartbeat, verify wake_skip/wake_triggered logs.
- Phase 3: Follow-up tracking (record what heartbeat told user, re-surface once with backoff).
- Phase 4: Event-driven triggers (task completion → immediate heartbeat check).
- VPS deployment for 24/7 availability.

## 2026-02-21 — MCP Server Integration: Universal Tool Access for All Agents

**What happened:**
Implemented full MCP integration so all agents (chat, background tasks, phone) can use MCP tools. Previously MCP tools were chat-only; background tasks had a separate, isolated tool set.

**Phase 1: Universal MCP Access**
- Changed MCP tool scope from `"chat"` to `"both"` in `adapter.ts` (default, per-server configurable via `scope` field)
- Added `scope` option to `MCPServerConfig` in `client.ts`
- Bridged registry tools into background tasks: `manager.ts` now accepts optional `ToolRegistry`, merges MCP tools into `buildTools()`
- Destructive MCP tools in background tasks are wrapped with approval via `ask_user`
- Task system prompt now dynamically lists available MCP tool categories
- Wired registry into task manager from `bot.ts`

**Phase 2: 10 MCP Server Configurations**
- Updated `config/mcp-servers.example.json` with 10 servers: Google Workspace, GitHub, Filesystem, Brave Search, Puppeteer, Notion, Slack, Memory/Knowledge Graph, Supabase, Image Generator (Replicate)
- Each server has placeholder env vars and appropriate approval policies

**Phase 3: Admin Panel MCP Enhancements**
- Added `mcpManager` to `AdminDeps`, wired from `index.ts`
- `handleGetMcp` now enriches server list with live connection status, tool counts, and tool names
- Created `src/admin/mcp-catalog.ts` with server templates (name, description, command, args, required env vars)
- Added `/admin/api/mcp/catalog` endpoint for the "Add Server" UI
- Rewrote admin MCP page: server cards with status dots, tool counts, expandable tool lists, catalog-based "Add Server" grid, manual add form as fallback
- Added CSS for status dots, tool lists, catalog grid

**Files changed:**

| File | Change |
|------|--------|
| `src/tools/mcp/adapter.ts` | Scope `"chat"` → `serverConfig.scope \|\| "both"` |
| `src/tools/mcp/client.ts` | Added `scope` to `MCPServerConfig` |
| `src/agent/tasks/manager.ts` | Added `registry` dep, bridge MCP tools into `buildTools()`, approval wrapping, dynamic system prompt |
| `src/channels/telegram/bot.ts` | Pass `registry` to task manager, expose `mcpManager` in `BotResult` |
| `src/index.ts` | Destructure `mcpManager`, pass to admin deps |
| `config/mcp-servers.example.json` | 10 MCP servers with configs |
| `src/admin/api.ts` | Added `mcpManager` to `AdminDeps`, enriched `handleGetMcp`, added `handleGetMcpCatalog` |
| `src/admin/mcp-catalog.ts` | **New** — server catalog with templates |
| `src/admin/routes.ts` | Added `/admin/api/mcp/catalog` route |
| `src/admin/static/app.js` | Rewrote MCP page with status, tools, catalog |
| `src/admin/static/app.css` | New styles for status dots, tool list, catalog grid |

**Impact:**
- Background tasks can now use MCP tools (e.g., "research X and make Google Slides")
- Destructive MCP tools require approval in background context
- 10 MCP servers pre-configured in example JSON
- Admin panel shows live server status, tool counts, and one-click server setup from catalog

**Current state:**
- Build passes clean (418 modules).
- All four phases complete.

**What's next:**
- Configure and test individual MCP servers (start with Google Workspace, Filesystem, Memory)
- Heartbeat Phases 3 & 4 (follow-up tracking, event-driven triggers)
- VPS deployment for 24/7 availability

## 2026-02-21 — Multi-Step Task Execution: Plan-and-Execute Architecture

**Motivation:** Agent was asked to "deeply research a topic and create a Google Slides presentation with infographics." It completed research but never created the slides — ran out of iterations and forgot. The task system treated every task as a flat "research and report" job with no planning, no iteration budget awareness, and no way to express multi-step workflows.

**Research:** Reviewed Plan-and-Execute (LangGraph), ReAct, AutoGPT, CrewAI, Devin, and OpenClaw patterns. Plan-and-Execute emerged as the best fit: agent plans all steps upfront, then executes sequentially with checkpoints.

**Phase 1: Enhanced Task System Prompt**

Rewrote `buildSystemPrompt()` in `manager.ts` with structured sections:
- **APPROACH**: Plan-first methodology — plan before any tool calls, allocate iteration budget across phases
- **CORE TOOLS**: Concise tool reference (web_search, fetch_url, send_progress, ask_user)
- **DELIVERABLES**: Explicit instruction to CREATE artifacts, not just describe them
- **EXTERNAL SERVICE TOOLS**: Dynamically generated per-category guidance for google and nanobanana MCP tools
- **OUTPUT**: Formatting guidance for Telegram

**Phase 2: Plan Persistence in Runner**

Modified `runner.ts` to extract the agent's execution plan from its first iteration response and re-inject it into the system prompt on every subsequent iteration. This keeps the plan visible even as tool results fill the context window.

**Phase 3: Task Chains (Sequential Dependencies)**

New `[TASKCHAIN:]` intent format lets the chat agent express dependent multi-step workflows:
```
[TASKCHAIN:
1. Research quantum immortality theories
2. Create Google Slides presentation based on the research
]
```

| File | Change |
|------|--------|
| `src/agent/tasks/intents.ts` | Added `chain` type + `chainSteps` field, TASKCHAIN regex parser |
| `src/agent/prompt.ts` | Added TASKCHAIN documentation to chat prompt's TASK MANAGEMENT section |
| `src/agent/index.ts` | Handle `chain` intent type, call `createTaskChain()` |
| `src/agent/tasks/manager.ts` | `createTaskChain()` — creates first step, stores remaining steps as chain metadata |
| `src/agent/tasks/queue.ts` | `continueChain()` — on task completion, auto-creates next step with previous result as context |

Chain metadata stored in tasks table's existing `metadata JSONB` column:
```json
{
  "chain_steps": ["step 2 description", "step 3 description"],
  "chain_step_index": 0,
  "chain_total": 3
}
```

**Phase 4: Sub-task Spawning (Parallel Fan-out)**

New tools let a running task spawn parallel child tasks for independent work:

| File | Change |
|------|--------|
| DB migration | Added `parent_task_id UUID REFERENCES tasks(id)` column + index |
| `src/agent/tasks/tools.ts` | `spawn_subtask` (create child task) + `get_subtask_results` (collect results with optional wait) |
| `src/agent/tasks/manager.ts` | Subtask tools wired into `buildTools()`, subtask guidance in system prompt |
| `src/agent/tasks/queue.ts` | Subtask-aware concurrency: allows +2 extra slots when subtasks of running tasks are queued (prevents deadlock) |

**How sub-tasks work:**
1. Parent task calls `spawn_subtask` with a description → child task created with `parent_task_id` set
2. Child tasks get 15 iterations (vs 25 for parents), priority 2 (run promptly)
3. Parent continues its own work or calls `get_subtask_results(wait: true)`
4. `get_subtask_results` polls every 5s for up to 60s, returns status + results for all children
5. Parent synthesizes child results into final output

**Concurrency deadlock prevention:** When `maxConcurrent` slots are full but queued subtasks belong to running parent tasks, the queue temporarily allows +2 extra slots so subtasks can execute without blocking.

**Files changed (summary):**

| File | Change |
|------|--------|
| `src/agent/tasks/manager.ts` | Rewrote `buildSystemPrompt()`, added `createTaskChain()`, subtask tools in `buildTools()`, subtask + chain prompt guidance |
| `src/agent/tasks/runner.ts` | Plan extraction from iteration 1, plan re-injection via `effectiveSystemPrompt` |
| `src/agent/tasks/intents.ts` | `[TASKCHAIN:]` parser, `chain` intent type |
| `src/agent/tasks/queue.ts` | Chain continuation on completion, subtask-aware concurrency |
| `src/agent/tasks/tools.ts` | `spawn_subtask` + `get_subtask_results` tools |
| `src/agent/prompt.ts` | TASKCHAIN docs + dynamic image generation guidance |
| `src/agent/index.ts` | Chain intent handling, images passthrough |

**Current state:**
- Build passes clean (418 modules).
- All 4 phases implemented.

**What's next:**
- End-to-end test: "research X and create a Google Slides presentation" via TASKCHAIN
- Test sub-task spawning: "compare 3 cloud providers" should spawn 3 parallel subtasks
- Configure and test MCP servers (Google Workspace, nanobanana)
- VPS deployment for 24/7 availability

## 2026-02-21 — Fix: Image Insertion into Google Docs/Slides from Background Tasks

**Problem:** User tested the full pipeline — "research a topic, use puppeteer to evaluate a website, create a Google Doc report with nanobanana infographics." The research and Google Doc were created successfully, but nanobanana-generated images were NOT included in the document despite MCP logs showing nanobanana was invoked multiple times.

**Root cause:** When nanobanana generates an image, `MCPClientManager.callTool()` saves it to a local temp file (`/tmp/bright-images/mcp_xxx.png`) and returns `[Image saved to: /path]` in the text result. The background task agent sees this path and tries to pass it to Google Docs/Slides for image insertion. But the Google Slides API `CreateImageRequest` requires a **publicly accessible URL** — local file paths are unreachable from Google's servers. The image generation worked, but the insertion silently failed because Google couldn't fetch the local file.

**Solution:** Created an `upload_image` task tool that bridges local files to public URLs via Supabase Storage.

**Flow (before):**
```
nanobanana → local file path → Google API (FAILS — can't access local files)
```

**Flow (after):**
```
nanobanana → local file path → upload_image → Supabase Storage public URL → Google API (works)
```

**Changes:**

| File | Change |
|------|--------|
| Supabase Storage | Created `task-images` public bucket (10MB limit, image MIME types only) + RLS policies for public read and insert |
| `src/agent/tasks/tools.ts` | New `createUploadImageTool()` — reads local file, uploads to Supabase Storage `task-images` bucket, returns public URL |
| `src/agent/tasks/manager.ts` | Added `supabaseUrl` to deps, wires `upload_image` tool into `buildTools()` when both supabaseClient and supabaseUrl available |
| `src/agent/tasks/manager.ts` | Updated system prompt: CORE TOOLS lists `upload_image`, Google section warns about public URLs, nanobanana section has CRITICAL WORKFLOW (generate → upload → insert) |
| `src/agent/prompt.ts` | Updated chat prompt's image generation guidance with upload_image workflow when Google tools available |
| `src/channels/telegram/bot.ts` | Passes `config.supabase?.url` as `supabaseUrl` to task manager |
| `src/agent/tasks/__tests__/task-system.test.ts` | 10 new tests (49 total): upload_image tool definition, file-not-found error, successful upload with public URL, upload error handling, system prompt guidance, buildTools inclusion/exclusion |

**How `upload_image` works:**
1. Agent generates image with nanobanana → gets local file path
2. Agent calls `upload_image` with the file path
3. Tool reads the file, uploads to Supabase Storage `task-images` bucket
4. Returns public URL: `https://{project}.supabase.co/storage/v1/object/public/task-images/{timestamp}_{name}.png`
5. Agent passes the public URL to Google Docs/Slides insertion tool

**Current state:**
- Build passes clean.
- 49 tests pass (134 assertions).
- Supabase Storage bucket created with public access.
- Ready for end-to-end test.

**What's next:**
- End-to-end test: "research a topic and create a Google Slides presentation with infographics" — verify images appear in the presentation.
- VPS deployment for 24/7 availability.

## 2026-02-21 — Personality System: OpenClaw-Inspired Soul.md

**Motivation:** Bright's personality was defined inside `config/profile.md`, mixed with user facts (name, timezone, occupation). OpenClaw uses a dedicated SOUL.md file for agent identity — values, personality traits, behavioral guidelines. This separation is cleaner: soul.md defines who Bright IS (shared across all instances), profile.md defines who the USER is (per-person). The soul.md also provides much richer personality guidance than the old 5-line "How You Should Behave" section.

**Approach:** Bright already handles CONTEXT, MEMORY, and GOALS dynamically via Supabase (better than static files). The only gap was a dedicated personality layer. Added `config/soul.md` and modified the loader to combine it with `profile.md` at load time — zero changes to downstream code.

**Changes:**

| File | Change |
|------|--------|
| `config/soul.md` | NEW — Bright's core personality: identity, values (agency, substance, honesty, memory-as-care), personality traits, behavioral guidelines (task acknowledgment, venting, uncertainty, mistakes, proactive messages), anti-patterns |
| `config/soul.example.md` | NEW — Stripped-down template for new users |
| `config/profile.md` | REFACTORED — User facts only (name, timezone, occupation, schedule, preferences). Personality directives moved to soul.md |
| `config/profile.example.md` | UPDATED — Facts-only template, points to soul.example.md for personality |
| `src/config/profile.ts` | Modified `loadProfile()` to load soul.md + profile.md via `Promise.all`, combine with `\n\n`, return as single string. Added `loadFile()` helper. |
| `.gitignore` | Added `config/soul.md` |
| `CLAUDE.md` | Phase 3 Personalize now mentions soul.md in setup steps |

**Design decisions:**
- Combined at the loader level, not the prompt builder — avoids threading a new `soul` parameter through 7+ files
- If soul.md doesn't exist, behavior is identical to before (backwards compatible)
- Didn't create CONTEXT.md, MEMORY.md, GOALS.md files — Supabase handles those dynamically (better approach)
- Single soul.md rather than OpenClaw's multi-file split — Bright is a single assistant, not a multi-agent framework

**Current state:**
- Build passes clean.
- soul.md loaded and combined with profile.md in all prompts (chat, tasks, heartbeat, phone).

**What's next:**
- Personality test via Telegram: verify Bright references its values and follows behavioral guidelines.
- End-to-end image pipeline test.
- VPS deployment for 24/7 availability.

## 2026-02-21 — Bright OS Phase 1: Windowed Desktop UI

**Motivation:** The existing admin panel was a vanilla JS SPA (~600 LOC) with basic dashboard, config, logs, and MCP management. Needed a proper extensible UI for live agent monitoring, browser-based chat, and future workflow building. Designed as a lightweight "Bright OS" — windowed workspace inspired by the agenticos project.

**Design:** "Matte Industrial" aesthetic — dark theme (#121212 base), amber/copper accents, JetBrains Mono + DM Sans fonts, subtle noise texture, sharp window edges. Design doc at `docs/plans/2026-02-21-bright-os-ui-design.md`.

**Tech stack:** React 19 + TypeScript + Vite 7 + Tailwind CSS 4 + Zustand + Lucide React

**New files (32 across `ui/` directory):**

| Module | Files | Purpose |
|--------|-------|---------|
| `ui/` scaffold | `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `index.html`, `.gitignore` | Vite + React + TS project with Tailwind CSS 4 |
| Design system | `src/styles/global.css` | Matte Industrial tokens via `@theme`, noise overlay, animations, scrollbar |
| Core | `src/core/event-bus.ts`, `src/core/app-registry.ts` | Typed pub/sub bus, plugin-style app registration |
| State | `src/stores/window-store.ts` | Zustand window manager: open/close/focus/move/resize/minimize/maximize |
| Lib | `src/lib/api.ts`, `src/lib/auth.ts` | API client with Bearer auth + auto-logout, sessionStorage auth |
| Components | `Window.tsx`, `Sidebar.tsx`, `Taskbar.tsx`, `TopBar.tsx`, `Login.tsx`, `Desktop.tsx` | Draggable/resizable windows, collapsible sidebar, taskbar pills, clock, API key login, shell layout |
| Apps | `src/apps/dashboard/`, `src/apps/config/`, `src/apps/index.ts` | Dashboard (live status, agents, tasks, messages), Config (env editor with masking) |
| Tests | `__tests__/event-bus.test.ts`, `__tests__/app-registry.test.ts`, `__tests__/window-store.test.ts` | 15 unit tests |
| Entry | `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts` | React entry point, auth gate |

**Backend changes:**
- `src/admin/routes.ts` — Rewritten to dynamically serve Vite build from `ui/dist/`, with SPA catch-all, path traversal guard, extended MIME types, binary-safe file serving
- `.gitignore` — Added `ui/dist/`, `ui/node_modules/`
- `package.json` — Added `build:ui`, `dev:ui` scripts

**Build output:** 220KB JS + 15KB CSS (69KB + 4KB gzipped), builds in ~800ms.

**15 unit tests passing** (event bus: 4, app registry: 4, window store: 7).

**Implementation plan:** `docs/plans/2026-02-21-bright-os-phase1-implementation.md` (16 tasks, all complete).

**What's next:**
- Phase 2: Agent Monitor app (real-time task transcript), WebSocket streaming, Chat app
- Phase 3: Logs app, MCP Manager app, Memory Explorer
- Phase 4: Workflow Builder with @dnd-kit canvas

## 2026-02-21 — Multi-Agent: Agent Types + Orchestrator (Tier 1 + 2)

**Motivation:** Bright's task system ran all background agents with the same personality, tools, and iteration budgets. Complex requests like "research from 3 angles and write a report" were handled by a single agent that ran out of iterations or forgot later steps. Inspired by OpenClaw's multi-agent architecture, added specialized agent types and an orchestrator for complex task decomposition.

**Tier 1 — Agent Types (4 config files, 1 new module, 5 modified):**

| File | Purpose |
|------|---------|
| `config/agents/researcher.md` | Research agent: 15 iterations, depth-over-breadth, structured findings with citations |
| `config/agents/writer.md` | Writer agent: 20 iterations, clear structure, engagement focus |
| `config/agents/analyst.md` | Analyst agent: 15 iterations, skeptical data-driven personality |
| `config/agents/default.md` | Fallback: 25 iterations, no additional personality (uses global soul.md) |
| `src/agent/tasks/agent-types.ts` | **NEW** — `loadAgentTypes()` reads `config/agents/*.md`, parses `## Config` for params, everything else becomes soul text |

Agent type `.md` format:
```markdown
# Researcher
## Config
- **Max iterations:** 15
- **Model:** default
## Personality
You are a thorough, methodical research agent...
```

**How agent types work:**
1. At startup, `loadAgentTypes()` reads all `.md` files from `config/agents/`
2. `[TASK:researcher: deep research on quantum computing]` → typed task creation
3. `buildSystemPrompt()` injects the type's soul text for identity, uses type's iteration budget
4. `startTask()` in queue applies optional model override from metadata
5. Untyped `[TASK: description]` falls back to default agent type (current behavior preserved)

**Tier 2 — Orchestrator (1 new module, dependency-aware scheduling):**

| File | Purpose |
|------|---------|
| `src/agent/tasks/orchestrator.ts` | **NEW** — `decompose()` calls Claude to break complex requests into typed task DAGs with dependency refs |

**How TASKFLOW works:**
1. Chat agent emits `[TASKFLOW: Research AI from 3 angles and write a report]`
2. Orchestrator calls Claude with available agent types → returns JSON task graph
3. `createTaskFlow()` creates all tasks in Supabase, maps temp IDs → real UUIDs in `depends_on`
4. Root tasks (no deps) enqueued immediately, run in parallel
5. Queue's `tick()` checks `metadata.depends_on` — skips tasks whose prerequisites aren't done
6. When deps complete, their results are injected into the dependent task's description as context
7. Final synthesis task runs with all predecessor results available

```
User: "Research AI from 3 angles and write a report"
  → [TASKFLOW: ...]
  → Orchestrator decomposes:
    ├── [researcher] "Industry angle"      (A) — no deps
    ├── [researcher] "Academic angle"       (B) — no deps
    ├── [researcher] "Ethics angle"         (C) — no deps
    └── [writer] "Write report"            (D) — depends_on: [A, B, C]
  → A, B, C run in parallel → D runs when all complete
```

**Modified files:**

| File | Change |
|------|--------|
| `src/agent/tasks/intents.ts` | Added `[TASK:type: description]` parsing, `[TASKFLOW:]` parsing, `agentType` field on TaskIntent |
| `src/agent/tasks/manager.ts` | `agentTypes` in deps, `agentType` param on `createAndRunTask()` and `buildSystemPrompt()`, new `createTaskFlow()` and `getAgentTypeNames()` methods |
| `src/agent/tasks/queue.ts` | Dependency-aware `tick()` with `depends_on` checking, dependency result injection into task description, agent model override in `startTask()` |
| `src/agent/prompt.ts` | `agentTypeNames` opt, typed task syntax + TASKFLOW guidance in TASK MANAGEMENT section |
| `src/agent/index.ts` | Handle `flow` intent (decompose → createTaskFlow with fallback), pass `agentType` on typed `create`, pass `agentTypeNames` to prompt |
| `src/channels/telegram/bot.ts` | Accept `agentTypes` param, pass to task manager, resolve `agentTypeNames`, pass to all `handleMessage` calls |
| `src/index.ts` | Load agent types at startup via `loadAgentTypes()`, pass to `createBot()` |

**Design decisions:**
- Agent types defined as `.md` files (human-readable, versionable, no code changes to add types)
- No DB migration needed — agent type, dependencies, and flow info stored in existing `metadata JSONB`
- Orchestrator is a single lightweight Claude call (1024 max_tokens) — decomposition, not execution
- Fallback on orchestrator failure: creates a single default task (graceful degradation)
- Cycle detection in orchestrator output (DFS) prevents infinite dependency loops
- Typed task regex has guard clauses to avoid matching `[TASKS: status]` and `[TASKS: cancel]`

**Current state:**
- Build passes clean (420 modules).
- Tier 1 + Tier 2 both implemented.

**What's next:**
- End-to-end test: send typed task `[TASK:researcher: ...]` → verify researcher personality in output
- End-to-end test: send TASKFLOW → verify parallel decomposition + dependency scheduling
- Add more agent types as needed (coder, planner, etc.)
- VPS deployment for 24/7 availability

## 2026-02-22 — Cloud-First File Storage for MCP Outputs

**Problem:**
MCP tools (nanobanana image generation, future ElevenLabs audio, etc.) saved files to local temp directories only. This caused several issues:
- Files ephemeral on VPS/cloud (OS cleans `$TMPDIR`)
- Background task agents couldn't deliver MCP-generated images (takePendingImages() never called in runner)
- 3-step manual workflow: generate → upload_image → use URL
- Images only — no path for audio, video, PDFs to cloud storage
- Chat loop had no upload capability

**What was built:**

| File | Change |
|------|--------|
| `src/utils/file-store.ts` | **NEW** — Reusable Supabase Storage upload utility. Supports images, audio, video, PDFs, CSV, etc. Returns public URL or null on failure (graceful). |
| `src/tools/mcp/client.ts` | Added `FileStore` injection via `setFileStore()`. `callTool()` now auto-uploads file outputs to Supabase Storage and appends `[URL: ...]` to tool text. Works for both image content blocks and text path detection. |
| `src/agent/tasks/tools.ts` | Renamed `upload_image` → `upload_file`. Bucket changed from `task-images` → `agent-files`. MIME types expanded from images-only to all common file types. Now a manual escape hatch (MCP auto-uploads). |
| `src/agent/tasks/manager.ts` | Renamed tool references. Simplified system prompt: removed "CRITICAL WORKFLOW" 3-step instructions, replaced with "MCP tools auto-upload, use the [URL: ...] directly". |
| `src/agent/prompt.ts` | Updated chat-loop image generation guidance to reference auto-upload instead of manual upload_image workflow. |
| `src/channels/telegram/bot.ts` | Creates `FileStore` from Supabase config, injects into `MCPClientManager` at startup. |
| `src/agent/tasks/__tests__/task-system.test.ts` | Updated all Phase 5 tests for `upload_file` name, `agent-files` bucket, auto-upload guidance assertions. |
| Supabase | Created `agent-files` bucket (public, 50MB limit, broad MIME types) with RLS policies. |

**Architecture:**

```
MCP Tool (nanobanana, ElevenLabs, etc.)
  ↓ callTool()
Save to local temp (for Telegram InputFile)  +  Auto-upload to Supabase → [URL: ...]
  ↓
Chat loop: sends local file via Telegram
Background tasks: agent sees [URL: ...] in tool output → uses directly with Google APIs
```

Before: generate → upload_image → use URL (3 steps, background only)
After: generate → use URL from output (1 step, automatic, everywhere)

**No breaking changes:**
- `_pendingImages` mechanism unchanged — Telegram photo delivery still works via local paths
- Old `task-images` bucket left in place (existing URLs continue to work)
- Build passes clean (421 modules), 49 tests pass

**What's next:**
- End-to-end test: ask nanobanana to generate an image → verify `[URL: ...]` appears in output
- End-to-end test: background task with Google Slides + nanobanana → verify agent uses auto-uploaded URL
- VPS deployment for 24/7 availability

## 2026-02-22 — Browser Automation: Playwright + Stagehand (Replacing Puppeteer)

**Motivation:** Replaced Puppeteer MCP with two complementary browser automation tools:
- **Playwright** (`@playwright/mcp`) — Deterministic, accessibility-tree-based automation. Fast, no vision model needed. Best for structured pages, screenshots, data extraction.
- **Stagehand** (`@browserbasehq/mcp-stagehand`) — AI-powered natural language browser control. `act("click the reservation button")`. Best for unknown/complex UIs, form filling, making reservations.

**Use cases now supported:**
- "Go to website X, search for Y, screenshot results, add analysis to a Google Doc" (Playwright)
- "Go to resy.com and make me a reservation for Friday at 7pm" (Stagehand)
- Combined multi-tool workflows (browser + Google Workspace + image gen)

**Changes:**

| File | Change |
|------|--------|
| `config/mcp-servers.json` | Replaced puppeteer → playwright + stagehand (both `scope: "background"`, headless) |
| `config/mcp-servers.example.json` | Same replacement with `"destructive"` approval policy |
| `src/admin/mcp-catalog.ts` | Replaced puppeteer catalog entry with playwright + stagehand templates |
| `config/agents/browser.md` | **NEW** — browser specialist agent type (30 iterations, guidance for when to use each tool) |
| `src/agent/tasks/manager.ts` | Added browser-specific system prompt guidance for playwright + stagehand MCP categories |
| `src/agent/prompt.ts` | Updated task capabilities description to mention browser automation |

**Design decisions:**
- Both tools scoped as `"background"` only — browser automation is slow and memory-heavy (spawns Chrome), should not block real-time chat
- Chat agent triggers browser work via `[TASK:browser: go to resy.com and make a reservation...]`
- Browser agent type gets 30 max iterations (higher than default 25) because browser interactions burn 2-3 tool calls per page action
- Stagehand runs in local headless mode by default (no Browserbase API key needed); cloud mode available by adding optional env vars later
- No code changes to MCP pipeline — both tools work through the existing generic MCP client/adapter/registry

**What's next:**
- Test Playwright: navigate to a page, take screenshot, extract data
- Test Stagehand: natural language form filling on a complex site
- Test combined workflow: `[TASK:browser: go to X, search for Y, screenshot results, add analysis to Google Doc]`
- VPS deployment for 24/7 availability

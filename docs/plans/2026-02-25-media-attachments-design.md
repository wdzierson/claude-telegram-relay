# Media Processing & Persistent Attachments

> Design doc for adding multimodal file support to Bright.
> Approved 2026-02-25.

## Problem

When a user sends a photo, document, or audio file via Telegram, the bot downloads it
to a temp file and passes the **file path as plain text** to Claude (e.g., `[Image: /path/to/file.jpg]`).
Claude never actually sees the image. After the response, the temp file is deleted.

Result: the agent cannot analyze images, read documents, or reference past uploads.

## Solution: Approach A — Inline Vision + Persistent Attachments

### Flow

```
User sends photo/document/audio via Telegram
  → bot.ts downloads file as Buffer
  → Upload original to Supabase Storage (persistent URL)
  → For images: convert to base64, build Anthropic image content block
  → For documents: extract text (PDF, Word, text files)
  → For audio: transcribe via Groq/Whisper
  → Pass multimodal content to chat-loop / anthropic-api
  → Claude sees the actual image / document text / transcription
  → Save attachment record to DB (with embedding for future search)
  → Agent can chain into web search tools automatically
```

### Supported File Types

| Input | file_type | Processing |
|---|---|---|
| Photos (jpg, png, webp) | `image` | Base64 → Claude Vision, persist to storage |
| Screenshots (png, jpg) | `image` | Same as photos. Highest resolution requested from Telegram API |
| Voice notes (.ogg opus) | `audio` | Transcribe via Groq/Whisper, persist .ogg, save transcription |
| Audio files (.mp3, .m4a, .wav, .flac) | `audio` | Transcribe via Groq/Whisper, persist original, save transcription |
| PDFs | `document` | Extract text (pdf-parse), persist original, embed text |
| Word docs (.docx) | `document` | Extract text (mammoth), persist original |
| Text files (.txt, .csv, .json, .md) | `document` | Read as UTF-8, persist original |

### Attachments Table

```sql
CREATE TABLE attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  message_id UUID REFERENCES messages(id),
  user_id TEXT,
  file_type TEXT NOT NULL,          -- 'image', 'document', 'audio', 'video'
  mime_type TEXT,
  original_filename TEXT,
  storage_url TEXT NOT NULL,        -- Supabase Storage public URL
  description TEXT,                 -- AI-generated description (vision or summary)
  extracted_text TEXT,              -- Full text for documents, transcription for audio
  file_size_bytes INTEGER,
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(1536)            -- Searchable via semantic search
);
```

Embeddings generated from `description + extracted_text` via the existing embed webhook pattern.

### Text Extraction

New module `src/utils/extract.ts`:

```typescript
async function extractText(
  buffer: Buffer,
  mimeType: string,
  voiceConfig?: VoiceConfig
): Promise<string | null>
```

- PDF → `pdf-parse`
- Word → `mammoth`
- Text files → UTF-8 read
- Audio → existing `transcribe()` from `src/voice/`
- Images → returns null (handled by vision instead)

### Search & Retrieval

- Add `attachments` to the embed webhook (same pattern as messages/memory)
- New `match_attachments` Postgres RPC for vector similarity search
- New `search_attachments` chat tool so the agent can find past uploads

### Multimodal API Changes

`IncomingMessage` gains:
- `fileBuffer?: Buffer`
- `fileUrl?: string` (Supabase Storage URL)
- `mimeType?: string`

`chat-loop.ts` and `anthropic-api.ts` accept `ContentBlock[]` for user messages
when media is present (image content blocks with base64 source).

### Code Changes

| File | Change |
|---|---|
| `src/agent/index.ts` | `IncomingMessage` gains file fields. Build multimodal content blocks. |
| `src/agent/chat-loop.ts` | Accept `ContentBlock[]` for user message. Build image blocks. |
| `src/agent/anthropic-api.ts` | Support content array with image blocks. |
| `src/channels/telegram/bot.ts` | Upload to storage, keep buffer, save attachment after response. |
| `src/utils/extract.ts` | New — text extraction for PDF, Word, text, audio transcription. |
| `src/utils/file-store.ts` | Add `uploadBuffer()` method. |
| `src/tools/builtins/` | New `search_attachments` tool. |
| `db/` | Migration: `attachments` table + `match_attachments` RPC. |
| `supabase/functions/embed/` | Handle `attachments` table inserts. |

### Vision Approach

Claude Vision only (no GPT-4o fallback). Images sent as base64 content blocks
in the Anthropic Messages API. The agent can autonomously chain vision → web search
to research what it identifies (e.g., identify a building, then search for more info).

### Design Decisions

- **Claude Vision only** — no multi-model fallback for now
- **Full persistence** — originals stored in Supabase Storage, text/descriptions embedded
- **Automatic web search follow-up** — agent can chain vision → search tools without asking
- **Inline processing** — no async pipeline; process in the message flow for immediate response
- **Single user** — no per-user partitioning in storage (matches current architecture)

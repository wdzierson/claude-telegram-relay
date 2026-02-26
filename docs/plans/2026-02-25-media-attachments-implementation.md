# Media Processing & Persistent Attachments — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable the agent to see images (Claude Vision), extract text from documents, transcribe audio — and persist all uploads with searchable embeddings.

**Architecture:** Files uploaded via Telegram are stored in Supabase Storage, processed inline (vision/extraction/transcription), and tracked in a new `attachments` table with vector embeddings. The chat loop and API layer gain multimodal content block support so Claude actually sees images.

**Tech Stack:** Anthropic Messages API (vision content blocks), Supabase Storage + pgvector, pdf-parse, mammoth, existing Groq/Whisper transcription.

---

### Task 1: Database Migration — Attachments Table

**Files:**
- Create: `db/migrations/002_attachments.sql`

**Step 1: Write the migration SQL**

```sql
-- db/migrations/002_attachments.sql

-- Attachments table — tracks uploaded files with searchable embeddings
CREATE TABLE IF NOT EXISTS attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  user_id TEXT,
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'document', 'audio', 'video')),
  mime_type TEXT,
  original_filename TEXT,
  storage_url TEXT NOT NULL,
  description TEXT,
  extracted_text TEXT,
  file_size_bytes INTEGER,
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(1536)
);

CREATE INDEX IF NOT EXISTS idx_attachments_created_at ON attachments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachments_file_type ON attachments(file_type);
CREATE INDEX IF NOT EXISTS idx_attachments_user_id ON attachments(user_id);

-- RLS
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON attachments FOR ALL USING (true);

-- Semantic search for attachments
CREATE OR REPLACE FUNCTION match_attachments(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  file_type TEXT,
  mime_type TEXT,
  original_filename TEXT,
  storage_url TEXT,
  description TEXT,
  extracted_text TEXT,
  created_at TIMESTAMPTZ,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.file_type,
    a.mime_type,
    a.original_filename,
    a.storage_url,
    a.description,
    a.extracted_text,
    a.created_at,
    1 - (a.embedding <=> query_embedding) AS similarity
  FROM attachments a
  WHERE a.embedding IS NOT NULL
    AND 1 - (a.embedding <=> query_embedding) > match_threshold
  ORDER BY a.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

**Step 2: Apply the migration via Supabase MCP**

Run `apply_migration` with project ID and the SQL above.

**Step 3: Verify tables exist**

Run `execute_sql`: `SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'attachments';`
Expected: count = 1

**Step 4: Commit**

```bash
git add db/migrations/002_attachments.sql
git commit -m "feat: add attachments table with vector search"
```

---

### Task 2: Install Dependencies — pdf-parse and mammoth

**Step 1: Install packages**

```bash
bun add pdf-parse mammoth
```

**Step 2: Verify installation**

```bash
bun run -e "import('pdf-parse').then(() => console.log('pdf-parse OK'))"
bun run -e "import('mammoth').then(() => console.log('mammoth OK'))"
```

Expected: Both print OK.

**Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore: add pdf-parse and mammoth for document extraction"
```

---

### Task 3: Text Extraction Utility

**Files:**
- Create: `src/utils/extract.ts`

**Step 1: Write the extraction module**

```typescript
// src/utils/extract.ts
/**
 * Text Extraction Utility
 *
 * Extracts text content from different file types:
 * - PDF → pdf-parse
 * - Word (.docx) → mammoth
 * - Text files → UTF-8 decode
 * - Audio → transcription via voice module
 * - Images → returns null (handled by Claude Vision)
 */

import type { VoiceConfig } from "../config/index.ts";
import { transcribe } from "../voice/index.ts";

const TEXT_EXTENSIONS = new Set([
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
]);

/**
 * Extract text from a file buffer based on its MIME type.
 * Returns null for images (handled by vision) or unsupported types.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  voiceConfig?: VoiceConfig
): Promise<string | null> {
  // Images — handled by Claude Vision, not text extraction
  if (mimeType.startsWith("image/")) {
    return null;
  }

  // PDF
  if (mimeType === "application/pdf") {
    return extractPdf(buffer);
  }

  // Word documents
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    return extractDocx(buffer);
  }

  // Plain text files
  if (TEXT_EXTENSIONS.has(mimeType)) {
    return buffer.toString("utf-8");
  }

  // Audio — transcribe
  if (mimeType.startsWith("audio/")) {
    if (!voiceConfig) return null;
    const text = await transcribe(buffer, voiceConfig);
    return text || null;
  }

  return null;
}

async function extractPdf(buffer: Buffer): Promise<string | null> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return result.text?.trim() || null;
  } catch (err: any) {
    console.warn("PDF extraction failed:", err.message);
    return null;
  }
}

async function extractDocx(buffer: Buffer): Promise<string | null> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value?.trim() || null;
  } catch (err: any) {
    console.warn("DOCX extraction failed:", err.message);
    return null;
  }
}
```

**Step 2: Verify it compiles**

```bash
bun build src/utils/extract.ts --no-bundle --outdir /tmp/extract-check 2>&1 | head -5
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/utils/extract.ts
git commit -m "feat: add text extraction utility for PDF, Word, text, audio"
```

---

### Task 4: FileStore — Add `uploadBuffer()` Method

**Files:**
- Modify: `src/utils/file-store.ts`

**Step 1: Add the `uploadBuffer` method**

After the existing `upload(localPath)` method (line 88), add:

```typescript
  /**
   * Upload a Buffer directly to Supabase Storage.
   * Returns the public URL, or null if the upload fails.
   */
  async uploadBuffer(
    buffer: Buffer,
    filename: string,
    contentType: string
  ): Promise<string | null> {
    try {
      const ext = filename.includes(".") ? filename.substring(filename.lastIndexOf(".")) : "";
      const baseName = filename.includes(".")
        ? filename.substring(0, filename.lastIndexOf("."))
        : filename;
      const storagePath = `${Date.now()}_${baseName}${ext}`;

      const { error } = await this.supabaseClient.storage
        .from(this.bucket)
        .upload(storagePath, buffer, {
          contentType,
          upsert: false,
        });

      if (error) {
        console.warn(`FileStore: buffer upload failed: ${error.message}`);
        return null;
      }

      return `${this.supabaseUrl}/storage/v1/object/public/${this.bucket}/${storagePath}`;
    } catch (err: any) {
      console.warn(`FileStore: buffer upload error: ${err.message}`);
      return null;
    }
  }
```

**Step 2: Commit**

```bash
git add src/utils/file-store.ts
git commit -m "feat: add uploadBuffer method to FileStore"
```

---

### Task 5: Update IncomingMessage and handleMessage for Multimodal

**Files:**
- Modify: `src/agent/index.ts`

**Step 1: Update the `IncomingMessage` interface (line 31-37)**

Replace the existing interface:

```typescript
export interface IncomingMessage {
  type: "text" | "voice" | "photo" | "document";
  text: string; // Original text, transcription, or caption
  filePath?: string; // For images/documents (local temp path)
  fileBuffer?: Buffer; // Raw file data for vision / extraction
  fileUrl?: string; // Supabase Storage persistent URL
  mimeType?: string; // e.g. "image/jpeg", "application/pdf"
  originalFilename?: string; // Original filename from Telegram
  userId?: string; // Telegram user ID (for multi-user)
  metadata?: Record<string, unknown>;
}
```

**Step 2: Update `handleMessage` to build multimodal content (lines 108-115)**

Replace the promptText block:

```typescript
  // Build the prompt text and optional image content
  let promptText = message.text;
  let imageBase64: { data: string; mediaType: string } | undefined;

  if (message.type === "voice") {
    promptText = `[Voice message transcribed]: ${message.text}`;
  } else if (message.type === "photo") {
    // Image will be sent as a vision content block
    if (message.fileBuffer && message.mimeType) {
      imageBase64 = {
        data: message.fileBuffer.toString("base64"),
        mediaType: message.mimeType,
      };
    }
    promptText = message.text || "Analyze this image.";
  } else if (message.type === "document") {
    // Extracted text is already in message.text from bot handler
    promptText = message.text;
  }
```

**Step 3: Pass image data through to the API callers (lines 147-172)**

Update the API call section to pass `imageBase64`:

```typescript
  let rawResponse: string;
  let images: string[] = [];
  if (config.agentBackend === "api" && effectiveConfig) {
    if (registry && registry.getChatTools().length > 0) {
      // Chat loop with tool use
      const result = await runChatLoop({
        systemPrompt: prompt.system,
        userMessage: prompt.user,
        config: effectiveConfig,
        registry,
        requestApproval,
        imageBase64,
      });
      rawResponse = result.text;
      images = result.images;
    } else {
      // Simple API call (no tools)
      rawResponse = await callAnthropicAPI(
        prompt.system,
        prompt.user,
        effectiveConfig,
        imageBase64
      );
    }
  } else {
    rawResponse = await callClaude(
      prompt.system + "\n\nUser: " + prompt.user,
      config.claude
    );
  }
```

**Step 4: Commit**

```bash
git add src/agent/index.ts
git commit -m "feat: add multimodal fields to IncomingMessage and handleMessage"
```

---

### Task 6: Multimodal Support in anthropic-api.ts

**Files:**
- Modify: `src/agent/anthropic-api.ts`

**Step 1: Update function signature and build content blocks**

Replace the entire `callAnthropicAPI` function:

```typescript
export async function callAnthropicAPI(
  systemPrompt: string,
  userMessage: string,
  config: AnthropicConfig,
  imageBase64?: { data: string; mediaType: string }
): Promise<string> {
  console.log(`Calling Anthropic API: ${userMessage.substring(0, 50)}...`);

  try {
    const anthropic = getClient(config);

    // Build content blocks — text only, or text + image
    const content: Anthropic.Messages.ContentBlockParam[] = [];

    if (imageBase64) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: imageBase64.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: imageBase64.data,
        },
      });
    }

    content.push({ type: "text", text: userMessage });

    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content }],
    });

    const block = response.content[0];
    if (block.type === "text") {
      return block.text.trim();
    }

    return "Error: Unexpected response format from Anthropic API";
  } catch (error: any) {
    console.error("Anthropic API error:", error.message || error);
    return `Error: ${error.message || "Anthropic API call failed"}`;
  }
}
```

**Step 2: Commit**

```bash
git add src/agent/anthropic-api.ts
git commit -m "feat: support vision content blocks in anthropic-api"
```

---

### Task 7: Multimodal Support in chat-loop.ts

**Files:**
- Modify: `src/agent/chat-loop.ts`

**Step 1: Add imageBase64 to ChatLoopOptions**

Update the interface (line 22-27):

```typescript
export interface ChatLoopOptions {
  systemPrompt: string;
  userMessage: string;
  config: AnthropicConfig;
  registry: ToolRegistry;
  requestApproval?: ApprovalCallback;
  imageBase64?: { data: string; mediaType: string };
}
```

**Step 2: Build multimodal first message (line 70-72)**

Replace the messages initialization:

```typescript
  // Build first message — text only, or text + image
  const userContent: Anthropic.Messages.ContentBlockParam[] = [];

  if (options.imageBase64) {
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: options.imageBase64.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: options.imageBase64.data,
      },
    });
  }

  userContent.push({ type: "text", text: userMessage });

  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userContent },
  ];
```

**Step 3: Commit**

```bash
git add src/agent/chat-loop.ts
git commit -m "feat: support vision content blocks in chat loop"
```

---

### Task 8: Update Telegram Bot Handlers

**Files:**
- Modify: `src/channels/telegram/bot.ts`

This is the largest change. The photo, document, and voice handlers need to:
1. Upload files to Supabase Storage (persist)
2. Keep the buffer for inline processing (vision/extraction)
3. Save an `attachments` record after the agent responds

**Step 1: Add helper imports and MIME detection at the top**

After the existing imports (around line 28), add:

```typescript
import { extractText } from "../../utils/extract.ts";
```

**Step 2: Add attachment-saving helper function**

After the `sendAgentResponse` function (line 358), add:

```typescript
  /** Save an attachment record to Supabase */
  async function saveAttachment(opts: {
    messageText: string;
    userId?: string;
    fileType: "image" | "document" | "audio" | "video";
    mimeType: string;
    originalFilename: string;
    storageUrl: string;
    description?: string;
    extractedText?: string;
    fileSize: number;
  }): Promise<void> {
    if (!memory.client) return;
    try {
      // Get the most recent message ID to link attachment
      const { data: recentMsg } = await memory.client
        .from("messages")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      await memory.client.from("attachments").insert({
        message_id: recentMsg?.id || null,
        user_id: opts.userId,
        file_type: opts.fileType,
        mime_type: opts.mimeType,
        original_filename: opts.originalFilename,
        storage_url: opts.storageUrl,
        description: opts.description,
        extracted_text: opts.extractedText?.substring(0, 50000) || null,
        file_size_bytes: opts.fileSize,
      });
    } catch (err) {
      console.error("Failed to save attachment:", err);
    }
  }
```

**Step 3: Create a FileStore instance**

After the `const log = createLogger(memory.client);` line (around line 61), add:

```typescript
  // --- File Store for persistent uploads ---
  let fileStore: FileStore | null = null;
  if (memory.client && config.supabase?.url) {
    fileStore = new FileStore(memory.client, config.supabase.url);
  }
```

**Step 4: Rewrite the photo handler (lines 472-513)**

Replace the entire `bot.on("message:photo", ...)` block:

```typescript
  // Photos (includes screenshots)
  bot.on("message:photo", async (ctx) => {
    log.info("bot", "photo_received");

    const stopTyping = startTyping(ctx);
    try {
      const photos = ctx.message.photo;
      const photo = photos[photos.length - 1]; // Highest resolution
      const file = await ctx.api.getFile(photo.file_id);

      // Download as buffer
      const resp = await fetch(
        `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`
      );
      const buffer = Buffer.from(await resp.arrayBuffer());
      const mimeType = file.file_path?.endsWith(".png") ? "image/png" : "image/jpeg";
      const filename = `image_${Date.now()}.${mimeType === "image/png" ? "png" : "jpg"}`;

      // Upload to Supabase Storage for persistence
      const storageUrl = fileStore
        ? await fileStore.uploadBuffer(buffer, filename, mimeType)
        : null;

      const caption = ctx.message.caption || "Analyze this image.";

      const incoming: IncomingMessage = {
        type: "photo",
        text: caption,
        fileBuffer: buffer,
        fileUrl: storageUrl || undefined,
        mimeType,
        originalFilename: filename,
        userId: ctx.from?.id.toString(),
      };

      const reply = await handleMessage(
        incoming, config, memory, profile, taskManager, registry, requestApproval, agentTypeNames
      );

      // Save attachment record with agent's description
      if (storageUrl) {
        await saveAttachment({
          messageText: caption,
          userId: ctx.from?.id.toString(),
          fileType: "image",
          mimeType,
          originalFilename: filename,
          storageUrl,
          description: reply.text.substring(0, 2000),
          fileSize: buffer.length,
        });
      }

      await sendAgentResponse(ctx, reply);
    } catch (error) {
      log.error("bot", "photo_error", { error: String(error) });
      await ctx.reply("Could not process image.");
    } finally {
      stopTyping();
    }
  });
```

**Step 5: Rewrite the document handler (lines 516-555)**

Replace the entire `bot.on("message:document", ...)` block:

```typescript
  // Documents (PDF, Word, text, audio files sent as documents)
  bot.on("message:document", async (ctx) => {
    const doc = ctx.message.document;
    log.info("bot", "document_received", { filename: doc.file_name, mimeType: doc.mime_type });

    const stopTyping = startTyping(ctx);
    try {
      const file = await ctx.getFile();
      const resp = await fetch(
        `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`
      );
      const buffer = Buffer.from(await resp.arrayBuffer());
      const mimeType = doc.mime_type || "application/octet-stream";
      const filename = doc.file_name || `file_${Date.now()}`;
      const caption = ctx.message.caption || "";

      // Upload to Supabase Storage for persistence
      const storageUrl = fileStore
        ? await fileStore.uploadBuffer(buffer, filename, mimeType)
        : null;

      // Extract text from document
      const extractedText = await extractText(buffer, mimeType, config.voice);

      // Determine file type category
      const isAudio = mimeType.startsWith("audio/");
      const fileType: "image" | "document" | "audio" | "video" = isAudio ? "audio" : "document";

      // Build message text: caption + extracted content
      let messageText = caption || `Analyze: ${filename}`;
      if (extractedText) {
        const preview = extractedText.substring(0, 8000);
        if (isAudio) {
          messageText = `[Audio file "${filename}" transcribed]: ${preview}\n\n${caption || "Respond to this audio."}`;
        } else {
          messageText = `[Document "${filename}" content]:\n${preview}\n\n${caption || "Analyze this document."}`;
        }
      }

      const incoming: IncomingMessage = {
        type: "document",
        text: messageText,
        fileBuffer: buffer,
        fileUrl: storageUrl || undefined,
        mimeType,
        originalFilename: filename,
        userId: ctx.from?.id.toString(),
      };

      const reply = await handleMessage(
        incoming, config, memory, profile, taskManager, registry, requestApproval, agentTypeNames
      );

      // Save attachment record
      if (storageUrl) {
        await saveAttachment({
          messageText: caption || filename,
          userId: ctx.from?.id.toString(),
          fileType,
          mimeType,
          originalFilename: filename,
          storageUrl,
          description: reply.text.substring(0, 2000),
          extractedText: extractedText || undefined,
          fileSize: buffer.length,
        });
      }

      await sendAgentResponse(ctx, reply);
    } catch (error) {
      log.error("bot", "document_error", { error: String(error) });
      await ctx.reply("Could not process document.");
    } finally {
      stopTyping();
    }
  });
```

**Step 6: Update the voice handler to also persist (lines 410-469)**

After the voice transcription succeeds (around line 433), add storage upload and attachment saving. Keep the existing voice flow but add persistence:

After `const transcription = await transcribe(buffer, config.voice);` and before the `IncomingMessage` construction, add:

```typescript
      // Upload voice note to Supabase Storage for persistence
      const voiceFilename = `voice_${Date.now()}.ogg`;
      const voiceStorageUrl = fileStore
        ? await fileStore.uploadBuffer(buffer, voiceFilename, "audio/ogg")
        : null;
```

After `await sendAgentResponse(ctx, reply);`, add:

```typescript
      // Persist voice attachment
      if (voiceStorageUrl) {
        await saveAttachment({
          messageText: transcription,
          userId: ctx.from?.id.toString(),
          fileType: "audio",
          mimeType: "audio/ogg",
          originalFilename: voiceFilename,
          storageUrl: voiceStorageUrl,
          description: `Voice message: ${transcription.substring(0, 200)}`,
          extractedText: transcription,
          fileSize: buffer.length,
        });
      }
```

**Step 7: Commit**

```bash
git add src/channels/telegram/bot.ts
git commit -m "feat: multimodal Telegram handlers with persistent uploads"
```

---

### Task 9: Search Attachments Tool

**Files:**
- Create: `src/tools/builtin/attachment-search.ts`
- Modify: `src/tools/index.ts`

**Step 1: Create the tool**

```typescript
// src/tools/builtin/attachment-search.ts
/**
 * Attachment Search Tool
 *
 * Searches past file uploads (images, documents, audio) by semantic similarity.
 * Returns storage URLs and descriptions so the agent can reference or re-share files.
 */

import type { ChatTool } from "../types.ts";
import type { MemorySystem } from "../../memory/index.ts";

export function createAttachmentSearchTool(memory: MemorySystem): ChatTool {
  return {
    definition: {
      name: "search_attachments",
      description:
        "Search the user's past file uploads (images, documents, audio, voice notes) " +
        "by semantic similarity. Use when the user asks about a file they uploaded previously, " +
        "wants to find an old image or document, or references something they shared in the past. " +
        "Returns file URLs, descriptions, and extracted text.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Natural language search query (e.g., 'that building photo', 'the PDF about architecture')",
          },
          file_type: {
            type: "string",
            enum: ["all", "image", "document", "audio"],
            description: "Filter by file type (default: all)",
          },
        },
        required: ["query"],
      },
    },
    async execute(input) {
      if (!memory.client) return "Attachment search not available (no database).";

      const query = input.query as string;
      const fileType = (input.file_type as string) || "all";

      try {
        // Use the search edge function to get embeddings match
        const { data, error } = await memory.client.functions.invoke("search", {
          body: {
            query,
            match_count: 5,
            table: "attachments",
            match_threshold: 0.35,
          },
        });

        if (error) {
          console.warn("Attachment search error:", error);
          return "Attachment search failed.";
        }

        if (!data?.length) {
          return "No matching attachments found.";
        }

        // Filter by type if specified
        const results = fileType === "all"
          ? data
          : data.filter((a: any) => a.file_type === fileType);

        if (!results.length) {
          return `No ${fileType} attachments matching "${query}".`;
        }

        return results
          .map((a: any) => {
            const parts = [
              `[${a.file_type}] ${a.original_filename || "unnamed"}`,
              `URL: ${a.storage_url}`,
              a.description ? `Description: ${a.description.substring(0, 300)}` : null,
              a.extracted_text ? `Content preview: ${a.extracted_text.substring(0, 300)}` : null,
              `Uploaded: ${new Date(a.created_at).toLocaleString()}`,
            ].filter(Boolean);
            return parts.join("\n");
          })
          .join("\n\n");
      } catch (err: any) {
        console.warn("Attachment search failed:", err.message);
        return "Attachment search failed.";
      }
    },
    scope: "both",
    approval: "never",
    category: "memory",
  };
}
```

**Step 2: Register it in `src/tools/index.ts`**

Add import (after line 19):

```typescript
import { createAttachmentSearchTool } from "./builtin/attachment-search.ts";
```

Add to the `createBuiltinTools` function body (after line 33):

```typescript
  tools.push(createAttachmentSearchTool(memory));
```

**Step 3: Commit**

```bash
git add src/tools/builtin/attachment-search.ts src/tools/index.ts
git commit -m "feat: add search_attachments tool for finding past uploads"
```

---

### Task 10: Update Supabase Edge Functions

**Files:**
- Modify: `supabase/functions/embed/index.ts`
- Modify: `supabase/functions/search/index.ts`

**Step 1: Update the embed function to handle attachments**

The embed function currently processes `messages` and `memory` table inserts. Add handling for `attachments`:

In the embed function, where it reads `record.content`, add a branch:

```typescript
// For attachments, combine description + extracted_text for embedding
let textToEmbed: string;
if (table === "attachments") {
  const desc = record.description || "";
  const extracted = record.extracted_text || "";
  textToEmbed = `${desc}\n${extracted}`.trim().substring(0, 8000);
} else {
  textToEmbed = record.content;
}
```

And update the column check to also handle `attachments`:

```typescript
// Skip if embedding already exists
if (record.embedding) return new Response("Already embedded", { status: 200 });
```

**Step 2: Update the search function to handle attachments**

Add `"attachments"` to the allowed table names and call `match_attachments` RPC:

```typescript
if (table === "attachments") {
  const { data, error } = await supabase.rpc("match_attachments", {
    query_embedding: embedding,
    match_threshold,
    match_count,
  });
  // ...return results
}
```

**Step 3: Deploy updated edge functions via Supabase MCP**

Use `deploy_edge_function` for both `embed` and `search`.

**Step 4: Set up webhook for attachments**

Tell the user to add a database webhook in Supabase dashboard:
- Name: `embed_attachments`, Table: `attachments`, Events: INSERT
- Type: Supabase Edge Function, Function: `embed`

**Step 5: Commit**

```bash
git add supabase/functions/embed/index.ts supabase/functions/search/index.ts
git commit -m "feat: extend embed/search edge functions for attachments table"
```

---

### Task 11: Smoke Test End-to-End

**Step 1: Start the bot**

```bash
bun run start
```

**Step 2: Test image upload**

Send a photo to the Telegram bot with caption "What building is this?"
Expected: The agent describes the image content and may search for more info.

**Step 3: Test document upload**

Send a PDF file.
Expected: The agent extracts and discusses the document content.

**Step 4: Test voice note persistence**

Send a voice note.
Expected: Voice is transcribed, agent responds, and the attachment is persisted.

**Step 5: Test search_attachments**

Send: "Can you find the image I uploaded earlier?"
Expected: The agent uses the search_attachments tool and returns the file.

**Step 6: Verify Supabase Storage**

Check the `agent-files` bucket in Supabase dashboard. Uploaded files should be visible.

**Step 7: Verify attachments table**

Run `execute_sql`: `SELECT id, file_type, original_filename, storage_url FROM attachments ORDER BY created_at DESC LIMIT 5;`
Expected: Records for each uploaded file.

---

### Task 12: Update Project Docs

**Files:**
- Modify: `docs/WORKLOG.md`
- Modify: `docs/PROJECT_OVERVIEW.md`
- Modify: `docs/AGENT_ARCHITECTURE.md`

**Step 1: Add worklog entry**

```markdown
## 2026-02-25 — Media Processing & Persistent Attachments

**What happened:**
- Added multimodal support: Claude Vision for images, text extraction for documents, audio transcription persistence.
- New `attachments` table with vector embeddings for semantic search across past uploads.
- Files persist in Supabase Storage; searchable via `search_attachments` tool.
- Updated embed/search Edge Functions to handle attachments.

**Supported file types:**
- Images (jpg, png, webp, screenshots) → Claude Vision
- PDFs → pdf-parse text extraction
- Word docs (.docx) → mammoth text extraction
- Text files (.txt, .csv, .json, .md) → UTF-8 read
- Voice notes (.ogg) → Groq/Whisper transcription + persistence
- Audio files (.mp3, .m4a, .wav, .flac) → transcription + persistence

**What's next:**
- Test with real uploads and verify search quality.
- Consider adding video frame extraction in future.
```

**Step 2: Update PROJECT_OVERVIEW.md current state**

Add "multimodal file processing (vision, document extraction, audio transcription persistence)" to the working stack.

**Step 3: Update AGENT_ARCHITECTURE.md**

Add `attachments` to the Database Schema section. Add `src/utils/extract.ts` to the module map.

**Step 4: Commit**

```bash
git add docs/WORKLOG.md docs/PROJECT_OVERVIEW.md docs/AGENT_ARCHITECTURE.md
git commit -m "docs: update project docs with media processing feature"
```

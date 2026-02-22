/**
 * OpenAI-Compatible Chat Completions Endpoint
 *
 * Handles POST /v1/chat/completions from Telnyx AI Assistants (or any
 * OpenAI-compatible client). Translates the request into Bright's
 * handleMessage() and returns a standard chat completion response.
 *
 * Supports both streaming (SSE) and non-streaming responses.
 * Telnyx AI Assistants typically send stream: true.
 *
 * Key design decisions:
 * - Telnyx generates a NEW conversation ID per request, so we pass the full
 *   messages array as conversationHistory for the agent to use as context.
 * - Deduplication prevents the same utterance from being processed multiple
 *   times when Telnyx sends overlapping transcriptions.
 */

import type { Config } from "../../config/index.ts";
import type { MemorySystem } from "../../memory/index.ts";
import type { ToolRegistry } from "../../tools/registry.ts";
import type { TaskManager } from "../../agent/tasks/index.ts";
import type { IncomingMessage } from "../../agent/index.ts";
import { handleMessage } from "../../agent/index.ts";
import type { PhoneSessionManager } from "./session.ts";

export interface PhoneDeps {
  config: Config;
  memory: MemorySystem;
  profile: string;
  registry: ToolRegistry | null;
  sessions: PhoneSessionManager;
  taskManager?: TaskManager | null;
}

interface ChatCompletionsRequest {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface ChatCompletionsResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: "assistant"; content: string };
    finish_reason: "stop";
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// --- Deduplication ---
// Telnyx often sends the same transcribed utterance multiple times with
// different conversation IDs. We deduplicate by content hash + time window.
const recentRequests = new Map<string, { promise: Promise<Response>; timestamp: number }>();
const DEDUP_WINDOW_MS = 3_000; // 3 seconds

function cleanupDedup() {
  const now = Date.now();
  for (const [key, entry] of recentRequests) {
    if (now - entry.timestamp > DEDUP_WINDOW_MS * 3) {
      recentRequests.delete(key);
    }
  }
}

export async function handleCompletions(
  req: Request,
  deps: PhoneDeps
): Promise<Response> {
  // Validate API key if configured
  if (deps.config.server?.apiKey) {
    const auth = req.headers.get("authorization");
    const token = auth?.replace(/^Bearer\s+/i, "");
    if (token !== deps.config.server.apiKey) {
      console.log("[phone] Auth failed — invalid token");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: ChatCompletionsRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.messages?.length) {
    return Response.json({ error: "messages array is required" }, { status: 400 });
  }

  // Extract the latest user message
  const userMessages = body.messages.filter((m) => m.role === "user");
  const latestMessage = userMessages[userMessages.length - 1];
  if (!latestMessage) {
    return Response.json({ error: "No user message found" }, { status: 400 });
  }

  // Log the incoming request
  console.log(`[phone] User said: "${latestMessage.content}" (${body.messages.length} msgs in history, stream: ${body.stream})`);

  // --- Deduplication check ---
  // If the same user content arrived within the dedup window, return the cached response
  cleanupDedup();
  const dedupKey = latestMessage.content.trim().toLowerCase();
  const existing = recentRequests.get(dedupKey);
  if (existing && Date.now() - existing.timestamp < DEDUP_WINDOW_MS) {
    console.log("[phone] Dedup hit — returning cached response");
    return existing.promise.then((r) => r.clone());
  }

  // Build conversation history from Telnyx's messages array.
  // Exclude the system message and the latest user message (that's the current turn).
  const conversationHistory = body.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(0, -1); // everything except the last user message

  const callerId = req.headers.get("x-telnyx-caller-id") || "phone";
  const conversationId = req.headers.get("x-telnyx-conversation-id") || crypto.randomUUID();

  // Build IncomingMessage for the agent
  const incoming: IncomingMessage = {
    type: "text",
    text: latestMessage.content,
    metadata: {
      channel: "phone",
      conversationId,
      callerId,
      conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
    },
  };

  // Process the request and cache the promise for deduplication
  const responsePromise = processRequest(incoming, body, deps);
  recentRequests.set(dedupKey, { promise: responsePromise, timestamp: Date.now() });

  return responsePromise;
}

async function processRequest(
  incoming: IncomingMessage,
  body: ChatCompletionsRequest,
  deps: PhoneDeps
): Promise<Response> {
  try {
    const startTime = Date.now();

    // Call the agent — no requestApproval (can't do inline buttons on phone)
    const response = await handleMessage(
      incoming,
      deps.config,
      deps.memory,
      deps.profile,
      deps.taskManager ?? null,
      deps.registry,
      undefined // no approval callback
    );

    const elapsed = Date.now() - startTime;
    console.log(`[phone] Agent response (${elapsed}ms): "${response.text.substring(0, 200)}"`);

    const completionId = `chatcmpl-${crypto.randomUUID().replace(/-/g, "").substring(0, 24)}`;
    const created = Math.floor(Date.now() / 1000);
    const model = body.model || "bright-agent";

    // If stream requested, return SSE format
    if (body.stream) {
      return streamResponse(completionId, created, model, response.text);
    }

    // Non-streaming: return standard JSON
    const result: ChatCompletionsResponse = {
      id: completionId,
      object: "chat.completion",
      created,
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: response.text },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };

    return Response.json(result);
  } catch (error) {
    console.error("[phone] Completions error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Stream the response as SSE (Server-Sent Events) in OpenAI format.
 *
 * Telnyx AI Assistants send stream: true and expect chunked SSE.
 * We send the full response as a single content chunk + [DONE] sentinel.
 */
function streamResponse(
  id: string,
  created: number,
  model: string,
  text: string
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send the content chunk
      const chunk = {
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: text },
            finish_reason: null,
          },
        ],
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));

      // Send the finish chunk
      const finishChunk = {
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop",
          },
        ],
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(finishChunk)}\n\n`));

      // Send the [DONE] sentinel
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  console.log(`[phone] Streaming response (${text.length} chars)`);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

/** GET /v1/models — Telnyx uses this to populate the model dropdown */
export function handleModels(): Response {
  return Response.json({
    object: "list",
    data: [
      {
        id: "bright-agent",
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "bright",
      },
    ],
  });
}

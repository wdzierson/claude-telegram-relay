/**
 * HTTP Server
 *
 * Bun.serve instance that runs alongside the Telegram bot.
 * Routes:
 *   POST /v1/chat/completions  — OpenAI-compatible endpoint (Telnyx AI Assistant)
 *   GET  /v1/models            — Model list for Telnyx portal auto-discovery
 *   GET  /health               — Health check
 *   /admin/*                   — Admin dashboard UI and API
 *   /admin/ws                  — WebSocket for real-time events
 */

import type { Server } from "bun";
import type { PhoneDeps } from "./completions.ts";
import type { AdminDeps } from "../../admin/api.ts";
import { handleCompletions, handleModels } from "./completions.ts";
import { handleAdminRequest, validateApiKey } from "../../admin/routes.ts";

export interface PhoneServer {
  server: Server;
  stop: () => void;
}

export interface HTTPServerDeps extends PhoneDeps {
  adminDeps?: AdminDeps;
}

export function startHTTPServer(deps: HTTPServerDeps): PhoneServer {
  const port = deps.config.server?.port || 3000;

  const server = Bun.serve({
    port,
    async fetch(req, server) {
      const url = new URL(req.url);

      // WebSocket upgrade — /admin/ws?key=<api_key>
      if (url.pathname === "/admin/ws" && deps.adminDeps) {
        const key = url.searchParams.get("key") || "";
        if (!validateApiKey(key, deps.adminDeps)) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (server.upgrade(req)) return undefined;
        return new Response("WebSocket upgrade failed", { status: 500 });
      }

      // POST /v1/chat/completions — main Telnyx integration point
      if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
        return handleCompletions(req, deps);
      }

      // GET /v1/models — Telnyx portal model discovery
      if (req.method === "GET" && url.pathname === "/v1/models") {
        return handleModels();
      }

      // GET /health — basic health check
      if (req.method === "GET" && url.pathname === "/health") {
        return new Response("ok");
      }

      // Admin UI and API
      if (url.pathname.startsWith("/admin") && deps.adminDeps) {
        const adminResponse = await handleAdminRequest(req, url, deps.adminDeps);
        if (adminResponse) return adminResponse;
      }

      return new Response("Not Found", { status: 404 });
    },
    websocket: {
      open(ws) {
        ws.subscribe("tasks");
      },
      message(_ws, _data) {
        // Server-to-client only; ignore client messages
      },
      close(ws) {
        ws.unsubscribe("tasks");
      },
    },
  });

  // Wire broadcast into adminDeps so other parts of the system can publish
  if (deps.adminDeps) {
    deps.adminDeps.broadcast = (topic: string, data: unknown) => {
      server.publish(topic, JSON.stringify(data));
    };
  }

  console.log(`HTTP server listening on port ${port}`);
  if (deps.config.server?.publicUrl) {
    console.log(`Public URL: ${deps.config.server.publicUrl}`);
  }
  if (deps.adminDeps) {
    console.log(`Admin UI: http://localhost:${port}/admin`);
  }

  return {
    server,
    stop: () => {
      deps.sessions.stop();
      server.stop();
    },
  };
}

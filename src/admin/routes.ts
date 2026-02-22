/**
 * Admin Route Dispatcher
 *
 * Matches /admin/* requests, checks auth for API routes,
 * and delegates to the appropriate handler.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname, extname, resolve } from "path";
import type { AdminDeps } from "./api.ts";
import {
  handleStatus,
  handleGetConfig,
  handlePutConfig,
  handleGetMcp,
  handlePutMcp,
  handleGetMcpCatalog,
  handleGetMessages,
  handleGetMemory,
  handleGetTasks,
  handleChat,
  handleCancelTask,
} from "./api.ts";

const UI_DIST_DIR = resolve(dirname(import.meta.path), "../../ui/dist");
const LEGACY_STATIC_DIR = resolve(dirname(import.meta.path), "static");
const STATIC_DIR = existsSync(UI_DIST_DIR) ? UI_DIST_DIR : LEGACY_STATIC_DIR;

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

const TEXT_EXTENSIONS = new Set([".html", ".js", ".css", ".json", ".svg"]);

function serveStatic(filename: string): Response {
  const filepath = resolve(STATIC_DIR, filename);
  // Guard against path traversal (e.g. ../../.env)
  if (!filepath.startsWith(STATIC_DIR + "/") && filepath !== STATIC_DIR) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    if (!existsSync(filepath)) {
      return new Response("Not Found", { status: 404 });
    }
    const ext = extname(filename);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    if (TEXT_EXTENSIONS.has(ext)) {
      const content = readFileSync(filepath, "utf-8");
      return new Response(content, {
        headers: { "Content-Type": contentType },
      });
    } else {
      const content = readFileSync(filepath);
      return new Response(content, {
        headers: { "Content-Type": contentType },
      });
    }
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

function checkAuth(req: Request, deps: AdminDeps): Response | null {
  const apiKey = deps.config.server?.apiKey;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "SERVER_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const auth = req.headers.get("Authorization");
  if (!auth || auth !== `Bearer ${apiKey}`) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  return null; // Auth OK
}

/**
 * Validate an API key against the config. Returns true if valid.
 */
export function validateApiKey(key: string, deps: AdminDeps): boolean {
  const apiKey = deps.config.server?.apiKey;
  return !!apiKey && key === apiKey;
}

export async function handleAdminRequest(
  req: Request,
  url: URL,
  deps: AdminDeps
): Promise<Response | null> {
  const path = url.pathname;

  // --- Static files (Vite build or legacy) ---
  if (path === "/admin" || path === "/admin/") {
    return serveStatic("index.html");
  }

  // --- API routes (all require auth) ---
  if (path.startsWith("/admin/api/")) {
    const authError = checkAuth(req, deps);
    if (authError) return authError;

    if (req.method === "GET" && path === "/admin/api/status") {
      return handleStatus(deps);
    }
    if (req.method === "GET" && path === "/admin/api/config") {
      return handleGetConfig(deps);
    }
    if (req.method === "PUT" && path === "/admin/api/config") {
      return handlePutConfig(req, deps);
    }
    if (req.method === "GET" && path === "/admin/api/mcp") {
      return handleGetMcp(deps);
    }
    if (req.method === "PUT" && path === "/admin/api/mcp") {
      return handlePutMcp(req, deps);
    }
    if (req.method === "GET" && path === "/admin/api/mcp/catalog") {
      return handleGetMcpCatalog();
    }
    if (req.method === "GET" && path === "/admin/api/messages") {
      return handleGetMessages(url, deps);
    }
    if (req.method === "GET" && path === "/admin/api/memory") {
      return handleGetMemory(url, deps);
    }
    if (req.method === "GET" && path === "/admin/api/tasks") {
      return handleGetTasks(url, deps);
    }
    if (req.method === "POST" && path === "/admin/api/chat") {
      return handleChat(req, deps);
    }
    const cancelMatch = path.match(/^\/admin\/api\/tasks\/([^/]+)\/cancel$/);
    if (req.method === "POST" && cancelMatch) {
      return handleCancelTask(cancelMatch[1], deps);
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Not an admin route
  if (!path.startsWith("/admin")) {
    return null;
  }

  // --- Dynamic static file serving (Vite assets, etc.) ---
  const relativePath = path.replace(/^\/admin\//, "");
  if (relativePath && existsSync(join(STATIC_DIR, relativePath))) {
    return serveStatic(relativePath);
  }

  // SPA catch-all: serve index.html for unmatched /admin/* routes
  return serveStatic("index.html");
}

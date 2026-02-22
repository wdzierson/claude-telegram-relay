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

  postChat: (message: string) =>
    request<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  cancelTask: (taskId: string) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/cancel`, {
      method: "POST",
    }),
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

export interface ChatResponse {
  text: string;
  taskIds: string[];
}

export interface TaskRow {
  id: string;
  status: string;
  description: string;
  result?: string;
  error?: string;
  iteration_count: number;
  max_iterations: number;
  token_usage: { input: number; output: number };
  created_at: string;
  started_at?: string;
  completed_at?: string;
  parent_task_id?: string;
}

export interface TasksResponse {
  tasks: TaskRow[];
  total?: number;
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

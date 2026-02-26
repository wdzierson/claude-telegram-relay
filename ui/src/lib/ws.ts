import { useEffect, useRef, useCallback } from "react";
import { getApiKey } from "./auth";

export interface TaskEvent {
  type: "task:status" | "task:iteration" | "task:interrupted";
  taskId: string;
  status?: string;
  result?: string | null;
  error?: string | null;
  iteration?: number;
  tokenUsage?: { input: number; output: number };
  toolName?: string;
  thoughtText?: string;
  toolCalls?: { name: string; inputPreview: string }[];
  interruptMessage?: string;
  timestamp: string;
}

type TaskEventHandler = (event: TaskEvent) => void;

const listeners = new Set<TaskEventHandler>();
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getWsUrl(): string {
  const key = getApiKey();
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/admin/ws?key=${encodeURIComponent(key || "")}`;
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(getWsUrl());

  ws.onmessage = (e) => {
    try {
      const event: TaskEvent = JSON.parse(e.data);
      listeners.forEach((fn) => fn(event));
    } catch {
      // ignore unparseable messages
    }
  };

  ws.onclose = () => {
    ws = null;
    if (listeners.size > 0 && !reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 3000);
    }
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

/**
 * Subscribe to real-time task events via WebSocket.
 * Manages a singleton connection -- first subscriber connects, last unsubscriber disconnects.
 */
export function useTaskEvents(handler: TaskEventHandler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const stableHandler = useCallback((event: TaskEvent) => {
    handlerRef.current(event);
  }, []);

  useEffect(() => {
    listeners.add(stableHandler);
    connect();

    return () => {
      listeners.delete(stableHandler);
      if (listeners.size === 0) {
        disconnect();
      }
    };
  }, [stableHandler]);
}

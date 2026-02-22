type Handler = (data: unknown) => void;

export interface EventBus {
  on(event: string, handler: Handler): () => void;
  emit(event: string, data?: unknown): void;
}

export function createEventBus(): EventBus {
  const listeners = new Map<string, Set<Handler>>();

  return {
    on(event: string, handler: Handler): () => void {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(handler);
      return () => {
        listeners.get(event)?.delete(handler);
      };
    },

    emit(event: string, data?: unknown): void {
      listeners.get(event)?.forEach((handler) => handler(data));
    },
  };
}

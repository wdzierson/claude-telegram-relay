import { useState, useRef, useEffect, useCallback } from "react";
import { Zap, Loader, Send } from "lucide-react";
import type { BrightApp, AppProps } from "../../core/app-registry";
import { api } from "../../lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  taskIds?: string[];
}

function Chat(_props: AppProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-scroll to bottom on new messages or loading state change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    },
    []
  );

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError("");

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const response = await api.postChat(text);

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response.text,
        timestamp: new Date(),
        taskIds: response.taskIds,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }, [input, loading]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  const formatTime = (date: Date): string =>
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col h-full">
      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !loading ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full gap-3 text-text-secondary">
            <Zap size={32} strokeWidth={1.5} className="text-accent-amber opacity-50" />
            <span className="text-sm font-body">Send a message to Bright</span>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm font-body ${
                    msg.role === "user"
                      ? "bg-accent-amber/15 text-text-primary"
                      : "bg-surface text-text-primary"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>

                  {/* Task spawn chips */}
                  {msg.taskIds && msg.taskIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {msg.taskIds.map((taskId) => (
                        <span
                          key={taskId}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent-copper/20 text-accent-copper text-[10px] font-mono"
                        >
                          <Zap size={10} strokeWidth={1.5} />
                          {taskId.slice(0, 8)}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="text-[10px] text-text-secondary mt-1">
                    {formatTime(msg.timestamp)}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm font-body bg-surface text-text-secondary">
                  <div className="flex items-center gap-2">
                    <Loader size={14} strokeWidth={1.5} className="animate-spin" />
                    <span>Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="px-4 py-2 text-center text-sm text-status-error">{error}</div>
      )}

      {/* Input area */}
      <div className="shrink-0 px-4 pb-3 pt-2 border-t border-border">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Message Bright..."
            rows={1}
            className="flex-1 resize-none bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-body placeholder:text-text-secondary/50 focus:outline-none focus:border-accent-amber transition-colors"
            style={{ maxHeight: 120 }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="p-2 rounded-lg bg-accent-amber text-base hover:bg-accent-amber/80 disabled:opacity-30 transition-colors shrink-0"
          >
            <Send size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

export const ChatApp: BrightApp = {
  id: "chat",
  name: "Chat",
  icon: "message-square",
  defaultSize: { w: 500, h: 650 },
  minSize: { w: 350, h: 400 },
  component: Chat,
  category: "core",
};

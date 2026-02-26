import { useState, useRef, useEffect, useCallback } from "react";
import { Paperclip, Plus, Send, X, Zap } from "lucide-react";
import type { BrightApp, AppProps } from "../../core/app-registry";
import { api } from "../../lib/api";
import type { MessagesResponse } from "../../lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  taskIds?: string[];
  attachmentName?: string;
  attachmentDataUrl?: string;
}

interface AttachedFile {
  name: string;
  size: number;
  dataUrl?: string;
}

interface Session {
  id: string;
  title: string;
  startedAt: Date;
  endedAt: Date;
  messages: Message[];
}

// ---------------------------------------------------------------------------
// Session grouping
// ---------------------------------------------------------------------------

const SESSION_GAP_MS = 2 * 60 * 60 * 1000; // 2 hours

function groupIntoSessions(rawMessages: MessagesResponse["messages"]): Session[] {
  if (!rawMessages.length) return [];

  const sorted = [...rawMessages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const sessions: Session[] = [];
  let current: Message[] = [];

  for (const raw of sorted) {
    const ts = new Date(raw.created_at);
    const prev = current[current.length - 1];

    if (prev && ts.getTime() - prev.timestamp.getTime() > SESSION_GAP_MS) {
      sessions.push(buildSession(current));
      current = [];
    }

    current.push({
      id: raw.id,
      role: raw.role as "user" | "assistant",
      content: raw.content,
      timestamp: ts,
    });
  }

  if (current.length > 0) sessions.push(buildSession(current));

  return sessions.reverse(); // most recent first
}

function buildSession(messages: Message[]): Session {
  const firstUser = messages.find((m) => m.role === "user");
  const title = firstUser?.content.trim().slice(0, 55) ?? "Conversation";
  return {
    id: messages[0].timestamp.toISOString(),
    title,
    startedAt: messages[0].timestamp,
    endedAt: messages[messages.length - 1].timestamp,
    messages,
  };
}

// ---------------------------------------------------------------------------
// Date group labels
// ---------------------------------------------------------------------------

function sessionDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yesterday.getTime()) return "Yesterday";

  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: "long" });
  if (date.getFullYear() === now.getFullYear())
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function groupSessionsByDate(sessions: Session[]) {
  const groups: { label: string; sessions: Session[] }[] = [];
  const seen = new Map<string, number>();

  for (const session of sessions) {
    const label = sessionDateLabel(session.startedAt);
    if (seen.has(label)) {
      groups[seen.get(label)!].sessions.push(session);
    } else {
      seen.set(label, groups.length);
      groups.push({ label, sessions: [session] });
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Sessions Sidebar
// ---------------------------------------------------------------------------

function SessionSidebar({
  groups,
  activeSessionId,
  onSelect,
  onNewChat,
}: {
  groups: { label: string; sessions: Session[] }[];
  activeSessionId: string | null;
  onSelect: (session: Session) => void;
  onNewChat: () => void;
}) {
  return (
    <div
      className="flex flex-col shrink-0 h-full overflow-hidden"
      style={{
        width: 196,
        borderRight: "1px solid var(--color-border)",
        background: "rgba(0,0,0,0.18)",
      }}
    >
      {/* New chat button */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all"
          style={{
            background: "rgba(255,255,255,0.05)",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.09)";
            e.currentTarget.style.color = "var(--color-text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            e.currentTarget.style.color = "var(--color-text-secondary)";
          }}
        >
          <Plus size={13} strokeWidth={1.5} />
          New Chat
        </button>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--color-border)", marginBottom: 4 }} />

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-1">
        {groups.length === 0 ? (
          <div
            className="px-4 py-6 text-xs text-center leading-relaxed"
            style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}
          >
            No conversation history yet
          </div>
        ) : (
          groups.map(({ label, sessions }) => (
            <div key={label} className="mb-3">
              <div
                className="px-3 pb-1 text-[9px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--color-text-secondary)", opacity: 0.45 }}
              >
                {label}
              </div>
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <button
                    key={session.id}
                    onClick={() => onSelect(session)}
                    className="w-full text-left px-3 py-2.5 transition-all"
                    style={{
                      background: isActive ? "rgba(255,255,255,0.07)" : "transparent",
                      color: isActive
                        ? "var(--color-text-primary)"
                        : "var(--color-text-secondary)",
                      borderLeft: isActive
                        ? "2px solid var(--color-accent-primary)"
                        : "2px solid transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                        e.currentTarget.style.color = "var(--color-text-primary)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "var(--color-text-secondary)";
                      }
                    }}
                  >
                    <div
                      className="font-mono mb-0.5"
                      style={{ fontSize: 9, opacity: 0.45 }}
                    >
                      {session.startedAt.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div
                      className="leading-snug"
                      style={{
                        fontSize: 11,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {session.title}
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex items-end gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar (assistant only) */}
      {!isUser && (
        <div
          className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center mb-1"
          style={{ background: "var(--color-accent-primary)", opacity: 0.85 }}
        >
          <span style={{ fontSize: 10, color: "#fff", fontWeight: 700, lineHeight: 1 }}>
            B
          </span>
        </div>
      )}

      <div
        className="max-w-[78%] text-sm font-body"
        style={{
          background: isUser
            ? "rgba(255, 107, 138, 0.11)"
            : "rgba(255, 255, 255, 0.045)",
          border: `1px solid ${
            isUser ? "rgba(255, 107, 138, 0.22)" : "rgba(255,255,255,0.08)"
          }`,
          borderRadius: isUser ? "18px 18px 5px 18px" : "18px 18px 18px 5px",
          padding: "10px 14px",
        }}
      >
        {/* Attachment image preview */}
        {message.attachmentDataUrl && (
          <img
            src={message.attachmentDataUrl}
            alt={message.attachmentName ?? "attachment"}
            style={{
              maxWidth: "100%",
              maxHeight: 180,
              borderRadius: 8,
              marginBottom: 8,
              display: "block",
              objectFit: "cover",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          />
        )}

        {/* Attachment filename (non-image) */}
        {message.attachmentName && !message.attachmentDataUrl && (
          <div
            className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-md text-[10px] font-mono"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
          >
            <Paperclip size={10} />
            {message.attachmentName}
          </div>
        )}

        <div
          className="whitespace-pre-wrap wrap-break-word"
          style={{ color: "var(--color-text-primary)", lineHeight: 1.55 }}
        >
          {message.content}
        </div>

        {/* Task spawn chips */}
        {message.taskIds && message.taskIds.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {message.taskIds.map((taskId) => (
              <span
                key={taskId}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono"
                style={{
                  background: "rgba(0,212,170,0.1)",
                  color: "var(--color-accent-active)",
                  border: "1px solid rgba(0,212,170,0.2)",
                }}
              >
                <Zap size={9} strokeWidth={1.5} />
                {taskId.slice(0, 8)}
              </span>
            ))}
          </div>
        )}

        <div
          className="font-mono mt-1.5"
          style={{
            fontSize: 9,
            color: "var(--color-text-secondary)",
            textAlign: isUser ? "right" : "left",
            opacity: 0.55,
          }}
        >
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typing indicator (animated dots)
// ---------------------------------------------------------------------------

const BOUNCE_CSS = `@keyframes _bright_bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.3; }
  30% { transform: translateY(-5px); opacity: 1; }
}`;

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2.5">
      <div
        className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center"
        style={{ background: "var(--color-accent-primary)", opacity: 0.85 }}
      >
        <span style={{ fontSize: 10, color: "#fff", fontWeight: 700, lineHeight: 1 }}>B</span>
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.045)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "18px 18px 18px 5px",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "var(--color-text-secondary)",
              display: "block",
              animation: `_bright_bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compose Bar
// ---------------------------------------------------------------------------

function ComposeBar({
  onSend,
  loading,
}: {
  onSend: (text: string, file?: AttachedFile) => void;
  loading: boolean;
}) {
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<AttachedFile | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const attached: AttachedFile = { name: file.name, size: file.size };
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) =>
        setAttachment({ ...attached, dataUrl: ev.target?.result as string });
      reader.readAsDataURL(file);
    } else {
      setAttachment(attached);
    }
    e.target.value = "";
  };

  const handleSend = () => {
    const text = input.trim();
    if ((!text && !attachment) || loading) return;
    onSend(text, attachment ?? undefined);
    setInput("");
    setAttachment(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = (input.trim().length > 0 || attachment !== null) && !loading;

  return (
    <div className="shrink-0 px-4 pb-4 pt-2">
      {/* Attachment preview strip */}
      {attachment && (
        <div className="flex items-center gap-2 mb-2 px-1">
          {attachment.dataUrl ? (
            <img
              src={attachment.dataUrl}
              alt={attachment.name}
              style={{
                height: 52,
                maxWidth: 80,
                borderRadius: 8,
                objectFit: "cover",
                border: "1px solid var(--color-border)",
              }}
            />
          ) : (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              <Paperclip size={11} />
              {attachment.name}
            </div>
          )}
          <button
            onClick={() => setAttachment(null)}
            className="p-1 rounded transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--color-status-error)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--color-text-secondary)")
            }
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Input row */}
      <div
        className="flex items-end gap-2 rounded-2xl px-3 py-2"
        style={{
          background: "rgba(255,255,255,0.045)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
          transition: "border-color 0.15s",
        }}
        onFocusCapture={(e) =>
          ((e.currentTarget as HTMLDivElement).style.borderColor =
            "rgba(255,255,255,0.18)")
        }
        onBlurCapture={(e) =>
          ((e.currentTarget as HTMLDivElement).style.borderColor =
            "rgba(255,255,255,0.1)")
        }
      >
        {/* Attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 p-1.5 rounded-lg transition-colors mb-0.5"
          style={{ color: "var(--color-text-secondary)" }}
          title="Attach image or file"
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--color-text-primary)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--color-text-secondary)")
          }
        >
          <Paperclip size={15} strokeWidth={1.5} />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.txt,.md,.csv,.json"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder="Message Bright…"
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm font-body outline-none"
          style={{
            color: "var(--color-text-primary)",
            maxHeight: 120,
            lineHeight: 1.5,
            paddingTop: 3,
          }}
        />

        <button
          onClick={handleSend}
          disabled={!canSend}
          className="shrink-0 p-2 rounded-xl transition-all mb-0.5"
          style={{
            background: canSend ? "var(--color-accent-primary)" : "rgba(255,255,255,0.08)",
            color: canSend ? "#fff" : "var(--color-text-secondary)",
            transform: canSend ? "scale(1)" : "scale(0.92)",
          }}
        >
          <Send size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Chat Component
// ---------------------------------------------------------------------------

function Chat(_props: AppProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const displayMessages = activeSession ? activeSession.messages : liveMessages;
  const isViewingHistory = activeSessionId !== null;

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages, loading]);

  // Load history on mount
  useEffect(() => {
    const load = async () => {
      setHistoryLoading(true);
      try {
        const data = await api.getMessages(300, 0, "admin");
        const grouped = groupIntoSessions(data.messages);
        setSessions(grouped);
        // Prime live view with the most recent session if it's still "active"
        if (grouped.length > 0) {
          const mostRecent = grouped[0];
          const msSinceLast = Date.now() - mostRecent.endedAt.getTime();
          if (msSinceLast < SESSION_GAP_MS) {
            setLiveMessages(mostRecent.messages);
          }
        }
      } catch {
        // Non-critical
      } finally {
        setHistoryLoading(false);
      }
    };
    load();
  }, []);

  const refreshSessions = useCallback(() => {
    api
      .getMessages(300, 0, "admin")
      .then((data) => setSessions(groupIntoSessions(data.messages)))
      .catch(() => {});
  }, []);

  const handleSelectSession = (session: Session) => {
    setActiveSessionId(session.id);
    setError("");
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setLiveMessages([]);
    setError("");
  };

  const handleSend = useCallback(
    async (text: string, file?: AttachedFile) => {
      if (!text.trim() && !file) return;
      if (loading) return;

      // Leave history view when user sends new message
      setActiveSessionId(null);
      setError("");

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: text || (file ? `[Attached: ${file.name}]` : ""),
        timestamp: new Date(),
        attachmentName: file?.name,
        attachmentDataUrl: file?.dataUrl,
      };

      setLiveMessages((prev) => [...prev, userMessage]);
      setLoading(true);

      try {
        const response = await api.postChat(text || `Attached file: ${file?.name ?? ""}`);
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.text,
          timestamp: new Date(),
          taskIds: response.taskIds,
        };
        setLiveMessages((prev) => [...prev, assistantMessage]);
        refreshSessions();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [loading, refreshSessions]
  );

  const sessionGroups = groupSessionsByDate(sessions);

  return (
    <>
      <style>{BOUNCE_CSS}</style>
      <div className="flex h-full overflow-hidden">
        {/* Sessions sidebar */}
        <SessionSidebar
          groups={sessionGroups}
          activeSessionId={activeSessionId}
          onSelect={handleSelectSession}
          onNewChat={handleNewChat}
        />

        {/* Main thread */}
        <div className="flex flex-col flex-1 min-w-0 h-full">
          {/* History banner */}
          {isViewingHistory && (
            <div
              className="shrink-0 px-4 py-2 text-xs text-center"
              style={{
                borderBottom: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              Viewing past conversation ·{" "}
              <button
                onClick={handleNewChat}
                style={{
                  color: "var(--color-accent-primary)",
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                Start new chat
              </button>
            </div>
          )}

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {historyLoading && displayMessages.length === 0 ? (
              <div
                className="flex items-center justify-center h-full text-xs"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Loading…
              </div>
            ) : displayMessages.length === 0 && !loading ? (
              <div
                className="flex flex-col items-center justify-center h-full gap-3"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center"
                  style={{ background: "var(--color-accent-primary)", opacity: 0.8 }}
                >
                  <span style={{ fontSize: 18, color: "#fff", fontWeight: 700 }}>B</span>
                </div>
                <span className="text-sm font-body">Send a message to Bright</span>
              </div>
            ) : (
              <div className="space-y-3">
                {displayMessages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                {loading && !isViewingHistory && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div
              className="px-4 py-2 text-center text-xs"
              style={{ color: "var(--color-status-error)" }}
            >
              {error}
            </div>
          )}

          {/* Compose / history CTA */}
          {isViewingHistory ? (
            <div className="shrink-0 px-4 pb-4 pt-2">
              <button
                onClick={handleNewChat}
                className="w-full py-2.5 rounded-2xl text-xs font-medium transition-colors"
                style={{
                  background: "rgba(255,107,138,0.09)",
                  color: "var(--color-accent-primary)",
                  border: "1px solid rgba(255,107,138,0.2)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(255,107,138,0.15)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "rgba(255,107,138,0.09)")
                }
              >
                + New Chat
              </button>
            </div>
          ) : (
            <ComposeBar onSend={handleSend} loading={loading} />
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// App Registration
// ---------------------------------------------------------------------------

export const ChatApp: BrightApp = {
  id: "chat",
  name: "Chat",
  icon: "message-square",
  defaultSize: { w: 780, h: 660 },
  minSize: { w: 440, h: 400 },
  component: Chat,
  category: "core",
};

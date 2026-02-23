import { useState } from "react";
import { Zap, ArrowRight } from "lucide-react";
import { setApiKey } from "../lib/auth";

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/admin/api/status", {
        headers: { Authorization: `Bearer ${key.trim()}` },
      });

      if (res.ok) {
        setApiKey(key.trim());
        onLogin();
      } else {
        setError("Invalid API key");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-base">
      <div
        className="w-full max-w-sm px-10 py-10"
        style={{
          border: "1px solid var(--color-glass-border)",
          borderRadius: "var(--radius-window)",
          background: "var(--color-glass)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        <div className="flex items-center gap-3 mb-10">
          <Zap size={22} strokeWidth={1.5} className="text-accent-primary" />
          <h1 className="font-body text-xl font-medium text-text-primary">
            Bright OS
          </h1>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block mb-3 text-[11px] font-body font-medium uppercase tracking-widest text-text-secondary">
            API Key
          </label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="SERVER_API_KEY"
            autoFocus
            className="w-full px-4 py-3 mb-6 font-mono text-sm bg-elevated border text-text-primary placeholder:text-text-secondary/50 outline-none focus:border-accent-active transition-colors"
            style={{
              borderColor: "var(--color-border)",
              borderRadius: "var(--radius-input)",
            }}
          />
          {error && (
            <p className="text-sm mb-4" style={{ color: "var(--color-status-error)" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 font-body text-sm font-medium transition-colors"
            style={{
              background: "var(--color-accent-primary)",
              color: "var(--color-base)",
              borderRadius: "var(--radius-button)",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Connecting..." : "Sign In"}
            {!loading && <ArrowRight size={14} />}
          </button>
        </form>
      </div>
    </div>
  );
}

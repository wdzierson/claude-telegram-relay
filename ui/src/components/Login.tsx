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
        className="w-full max-w-sm p-8"
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: "2px",
          background: "var(--color-surface)",
        }}
      >
        <div className="flex items-center gap-2 mb-8">
          <Zap size={20} strokeWidth={1.5} className="text-accent-amber" />
          <h1 className="font-mono text-lg font-medium text-text-primary">
            Bright OS
          </h1>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block mb-2 text-xs font-body font-semibold uppercase tracking-widest text-text-secondary">
            API Key
          </label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="SERVER_API_KEY"
            autoFocus
            className="w-full px-3 py-2 mb-4 font-mono text-sm bg-base border rounded-md text-text-primary placeholder:text-text-secondary/50 outline-none focus:border-accent-amber transition-colors"
            style={{
              borderColor: "var(--color-border)",
              borderRadius: "6px",
            }}
          />
          {error && (
            <p className="text-sm mb-3" style={{ color: "var(--color-status-error)" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 font-body text-sm font-medium rounded-md transition-colors"
            style={{
              background: "var(--color-accent-amber)",
              color: "var(--color-base)",
              borderRadius: "6px",
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

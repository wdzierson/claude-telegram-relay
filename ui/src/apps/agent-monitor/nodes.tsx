import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface IterationNodeData extends Record<string, unknown> {
  iteration: number;
  toolName?: string;
  thoughtText?: string;
  toolCalls?: { name: string; inputPreview: string }[];
  tokenUsage: { input: number; output: number };
  timestamp: string;
  isActive: boolean;
}

export interface StartNodeData extends Record<string, unknown> {
  description: string;
  status: string;
}

export function IterationNode({ data }: NodeProps) {
  const nodeData = data as IterationNodeData;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        background: "var(--color-surface)",
        border: `1px solid ${nodeData.isActive ? "var(--color-accent-active)" : "var(--color-border)"}`,
        borderRadius: "var(--radius-card)",
        padding: "12px 16px",
        minWidth: 240,
        maxWidth: 360,
        cursor: "pointer",
        animation: nodeData.isActive ? "pulse-border 1.5s ease-in-out infinite" : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: "var(--color-border)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-text-secondary)" }}>
          #{nodeData.iteration}
        </span>
        {nodeData.toolName && (
          <span className="badge-tool">{nodeData.toolName}</span>
        )}
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-text-secondary)" }}>
          {new Date(nodeData.timestamp).toLocaleTimeString()}
        </span>
      </div>
      {nodeData.toolCalls && nodeData.toolCalls.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: expanded ? 8 : 0 }}>
          {nodeData.toolCalls.map((tc, i) => (
            <span key={i} className="badge-tool" style={{ fontSize: 10 }}>{tc.name}</span>
          ))}
        </div>
      )}
      {expanded && nodeData.thoughtText && (
        <div
          className="panel-elevated"
          style={{ marginTop: 8, padding: "8px 10px", fontSize: 11, color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)", lineHeight: 1.5, maxHeight: 120, overflowY: "auto" }}
        >
          {nodeData.thoughtText}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: "var(--color-border)" }} />
    </div>
  );
}

export function StartNode({ data }: NodeProps) {
  const nodeData = data as StartNodeData;
  return (
    <div
      style={{
        background: "var(--color-elevated)",
        border: "1px solid var(--color-accent-primary)",
        borderRadius: "var(--radius-card)",
        padding: "12px 16px",
        minWidth: 240,
        maxWidth: 360,
      }}
    >
      <div className="section-label" style={{ marginBottom: 6 }}>TASK</div>
      <div style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.5 }}>
        {nodeData.description.substring(0, 120)}{nodeData.description.length > 120 ? "…" : ""}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: "var(--color-border)" }} />
    </div>
  );
}

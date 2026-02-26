import { useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { IterationLogEntry } from "./index";
import { IterationNode, StartNode } from "./nodes";

const NODE_WIDTH  = 280;
const NODE_HEIGHT = 120;
const nodeTypes = { iteration: IterationNode, start: StartNode };

interface GraphViewProps {
  iterationLog: IterationLogEntry[];
  taskStatus: string;
  taskDescription: string;
}

export function GraphView({ iterationLog, taskStatus, taskDescription }: GraphViewProps) {
  const isRunning = taskStatus === "running";

  const rawNodes = useMemo(() => [
    {
      id: "start",
      type: "start",
      position: { x: 0, y: 0 },
      data: { description: taskDescription, status: taskStatus },
      style: { width: NODE_WIDTH },
    },
    ...iterationLog.map((entry, i) => ({
      id: `iter-${entry.iteration}`,
      type: "iteration",
      position: { x: 0, y: (i + 1) * NODE_HEIGHT + 16 },
      data: {
        iteration:   entry.iteration,
        toolName:    entry.toolName,
        thoughtText: entry.thoughtText,
        toolCalls:   entry.toolCalls,
        tokenUsage:  entry.tokenUsage,
        timestamp:   entry.timestamp,
        isActive:    isRunning && i === iterationLog.length - 1,
      },
      style: { width: NODE_WIDTH },
    })),
  ], [iterationLog, taskStatus, taskDescription, isRunning]);

  const rawEdges = useMemo(() => iterationLog.map((entry, i) => ({
    id: `e-${i}`,
    source: i === 0 ? "start" : `iter-${iterationLog[i - 1].iteration}`,
    target: `iter-${entry.iteration}`,
    animated: isRunning && i === iterationLog.length - 1,
    markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-border-active)" },
    style: { stroke: "var(--color-border-active)", strokeWidth: 1.5 },
  })), [iterationLog, isRunning]);

  const [nodes, setNodes, onNodesChange] = useNodesState(rawNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawEdges);

  // Sync state whenever source data changes (ReactFlow initialises once from props)
  useEffect(() => { setNodes(rawNodes); }, [rawNodes, setNodes]);
  useEffect(() => { setEdges(rawEdges); }, [rawEdges, setEdges]);

  if (iterationLog.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)", opacity: 0.6 }}>
          No steps yet — graph will appear once the task starts
        </span>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 360 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(255,255,255,0.05)"
        />
      </ReactFlow>
    </div>
  );
}

/**
 * Task System — Orchestrator
 *
 * Decomposes complex [TASKFLOW:] requests into a dependency graph
 * of typed tasks. Uses a lightweight Claude call to plan the work,
 * then returns structured TaskFlowNodes for the manager to create.
 */

import Anthropic from "@anthropic-ai/sdk";

export interface TaskNode {
  tempId: string;
  agentType: string;
  description: string;
  dependsOn: string[];
}

/**
 * Decompose a complex request into a dependency graph of typed tasks.
 *
 * Calls Claude with a structured prompt listing available agent types.
 * Returns validated TaskNode[] with temp IDs and dependency references.
 */
export async function decompose(
  request: string,
  availableTypes: string[],
  anthropicConfig: { apiKey: string; model: string; maxTokens: number }
): Promise<TaskNode[]> {
  const client = new Anthropic({ apiKey: anthropicConfig.apiKey });

  const typeList = availableTypes.length > 0
    ? availableTypes.map((t) => `- ${t}`).join("\n")
    : "- default (general-purpose agent)";

  const systemPrompt = `You are a task planner. Decompose the user's request into a dependency graph of specialized tasks.

Available agent types:
${typeList}
- default (general-purpose, use when no specialized type fits)

Rules:
- Each task should be focused and achievable by a single agent
- Independent tasks should have no dependencies (they run in parallel)
- Dependent tasks should list their prerequisites by temp ID
- Include a final synthesis/delivery task that depends on all others when results need merging
- Keep the total number of tasks reasonable (2-6 typically)
- Use "default" type if no specialized type fits well

Output ONLY valid JSON matching this schema (no markdown, no explanation):
{"tasks":[{"id":"A","type":"researcher","description":"...","depends_on":[]},{"id":"B","type":"writer","description":"...","depends_on":["A"]}]}

Use single capital letters for IDs (A, B, C, ...).`;

  const response = await client.messages.create({
    model: anthropicConfig.model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: request }],
  });

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Parse JSON from the response (handle potential markdown wrapping)
  const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  let parsed: { tasks: Array<{ id: string; type: string; description: string; depends_on: string[] }> };

  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Orchestrator returned invalid JSON: ${jsonStr.substring(0, 200)}`);
  }

  if (!parsed.tasks || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    throw new Error("Orchestrator returned empty task list");
  }

  // Validate the graph
  const validIds = new Set(parsed.tasks.map((t) => t.id));
  const nodes: TaskNode[] = [];

  for (const task of parsed.tasks) {
    // Filter out invalid dependency references
    const validDeps = (task.depends_on || []).filter((dep) => validIds.has(dep) && dep !== task.id);

    nodes.push({
      tempId: task.id,
      agentType: task.type || "default",
      description: task.description,
      dependsOn: validDeps,
    });
  }

  // Check for cycles (simple DFS)
  if (hasCycle(nodes)) {
    throw new Error("Orchestrator produced a cyclic dependency graph");
  }

  return nodes;
}

function hasCycle(nodes: TaskNode[]): boolean {
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    adj.set(n.tempId, n.dependsOn);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(id: string): boolean {
    if (inStack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);
    for (const dep of adj.get(id) || []) {
      if (dfs(dep)) return true;
    }
    inStack.delete(id);
    return false;
  }

  for (const n of nodes) {
    if (dfs(n.tempId)) return true;
  }
  return false;
}

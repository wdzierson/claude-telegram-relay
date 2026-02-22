/**
 * Task System — Intent Parser
 *
 * Parses task-related tags from Claude's response:
 * - [TASK: description]                  — untyped background task
 * - [TASK:type: description]             — typed background task (agent type)
 * - [TASKCHAIN: numbered steps]          — sequential dependent tasks
 * - [TASKFLOW: complex description]      — orchestrator-decomposed task graph
 * - [TASKS: status], [TASKS: cancel ID]  — task management
 */

export interface TaskIntent {
  type: "create" | "status" | "cancel" | "chain" | "flow";
  description?: string;
  agentType?: string;
  taskId?: string;
  chainSteps?: string[];
}

export function parseTaskIntents(response: string): {
  clean: string;
  intents: TaskIntent[];
} {
  let clean = response;
  const intents: TaskIntent[] = [];

  // [TASKFLOW: complex multi-step description]
  // Must be matched before [TASK:] to avoid partial matches
  for (const match of response.matchAll(/\[TASKFLOW:\s*([\s\S]+?)\]/gi)) {
    intents.push({ type: "flow", description: match[1].trim() });
    clean = clean.replace(match[0], "");
  }

  // [TASKCHAIN: multi-step dependent tasks]
  // Matches a numbered list inside [TASKCHAIN: ... ]
  for (const match of response.matchAll(/\[TASKCHAIN:\s*\n((?:\d+\.\s*.+\n?)+)\]/gi)) {
    const stepsText = match[1];
    const steps = stepsText
      .split(/\n/)
      .map((line) => line.replace(/^\d+\.\s*/, "").trim())
      .filter((line) => line.length > 0);

    if (steps.length > 0) {
      intents.push({ type: "chain", chainSteps: steps });
    }
    clean = clean.replace(match[0], "");
  }

  // [TASK:type: description] — typed task (agent type specified)
  // Must be matched before untyped [TASK:] to avoid consuming the type as description
  for (const match of response.matchAll(/\[TASK:(\w+):\s*(.+?)\]/gi)) {
    // Guard: skip if the "type" is a known non-type keyword
    const maybeType = match[1].toLowerCase();
    if (maybeType === "status" || maybeType === "cancel") continue;
    intents.push({ type: "create", agentType: match[1], description: match[2] });
    clean = clean.replace(match[0], "");
  }

  // [TASK: description] — untyped task (no agent type)
  for (const match of clean.matchAll(/\[TASK:\s*([^\]]+?)\]/gi)) {
    intents.push({ type: "create", description: match[1].trim() });
    clean = clean.replace(match[0], "");
  }

  // [TASKS: status]
  for (const match of clean.matchAll(/\[TASKS:\s*status\]/gi)) {
    intents.push({ type: "status" });
    clean = clean.replace(match[0], "");
  }

  // [TASKS: cancel TASK_ID]
  for (const match of clean.matchAll(/\[TASKS:\s*cancel\s+(.+?)\]/gi)) {
    intents.push({ type: "cancel", taskId: match[1] });
    clean = clean.replace(match[0], "");
  }

  return { clean: clean.trim(), intents };
}

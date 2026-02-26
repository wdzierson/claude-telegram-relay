/**
 * MCP Tool Adapter
 *
 * Converts MCP server tools into ChatTool format for the registry.
 * Tools are namespaced as "servername__toolname" to prevent collisions.
 */

import type { ChatTool, ApprovalPolicy } from "../types.ts";
import type { MCPClientManager, MCPServerConfig } from "./client.ts";

/** Patterns that suggest a tool modifies external state */
const DESTRUCTIVE_PATTERNS = [
  /^create/i,
  /^delete/i,
  /^remove/i,
  /^send/i,
  /^update/i,
  /^modify/i,
  /^write/i,
  /^post/i,
  /^put/i,
  /^patch/i,
];

/**
 * Heuristic: determine if a tool name suggests a destructive action.
 */
function looksDestructive(toolName: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(toolName));
}

/**
 * Sanitize a tool name: Claude API requires [a-zA-Z0-9_-]{1,128}
 */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Normalize an MCP input schema to match what the Anthropic API expects:
 * - Must have type: "object"
 * - Must have properties (at least empty)
 */
function normalizeSchema(
  schema: Record<string, unknown>
): { type: "object"; properties?: Record<string, unknown>; required?: string[] } {
  return {
    type: "object" as const,
    properties: (schema.properties as Record<string, unknown>) || {},
    ...(Array.isArray(schema.required) ? { required: schema.required as string[] } : {}),
  };
}

/**
 * Import all tools from an MCP server into ChatTool format.
 */
export function importMCPTools(
  manager: MCPClientManager,
  serverConfig: MCPServerConfig
): ChatTool[] {
  const tools = manager.getServerTools(serverConfig.name);
  const serverApproval = serverConfig.approvalPolicy || "destructive";

  return tools.map((mcpTool) => {
    const safeName = sanitizeName(mcpTool.name);
    const namespacedName = sanitizeName(`${serverConfig.name}__${safeName}`);

    const chatTool: ChatTool = {
      definition: {
        name: namespacedName,
        description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
        input_schema: normalizeSchema(mcpTool.inputSchema),
      },
      execute: async (input: Record<string, unknown>) => {
        // Pre-validate required fields to give Claude a concise error
        // instead of a verbose MCP JSON-RPC validation dump
        const required = Array.isArray(mcpTool.inputSchema.required)
          ? (mcpTool.inputSchema.required as string[])
          : [];
        const missing = required.filter(
          (field) => input[field] === undefined || input[field] === null
        );
        if (missing.length > 0) {
          throw new Error(
            `Missing required field(s): ${missing.join(", ")}. You MUST include ${missing.join(" and ")} in your tool call.`
          );
        }
        return manager.callTool(serverConfig.name, mcpTool.name, input);
      },
      scope: serverConfig.scope || "both",
      approval: serverApproval,
      category: `mcp:${serverConfig.name}`,
      describeAction:
        serverApproval === "destructive"
          ? (input) => {
              if (looksDestructive(mcpTool.name)) {
                const preview = JSON.stringify(input).substring(0, 100);
                return `${namespacedName}: ${preview}`;
              }
              return null;
            }
          : undefined,
    };

    return chatTool;
  });
}

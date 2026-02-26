/**
 * Tool System — Public API
 *
 * Re-exports and factory for creating built-in tools.
 */

export type { ChatTool, ToolScope, ApprovalPolicy, ApprovalRequest, ApprovalCallback } from "./types.ts";
export { ToolRegistry } from "./registry.ts";
export { ApprovalManager } from "./approval.ts";

import type { ChatTool } from "./types.ts";
import type { Config } from "../config/index.ts";
import type { MemorySystem } from "../memory/index.ts";
import { createWeatherTool } from "./builtin/weather.ts";
import { createSearchTool } from "./builtin/search.ts";
import { createMemorySearchTool } from "./builtin/memory-search.ts";
import { createDateTimeTool } from "./builtin/datetime.ts";
import { createFetchUrlTool } from "./builtin/fetch-url.ts";
import { createConversationSearchTool } from "./builtin/conversation-search.ts";
import { createAttachmentSearchTool } from "./builtin/attachment-search.ts";

/**
 * Create all applicable built-in tools based on config.
 * Skips tools that require unconfigured services.
 */
export function createBuiltinTools(config: Config, memory: MemorySystem): ChatTool[] {
  const tools: ChatTool[] = [];

  // Always available
  tools.push(createDateTimeTool(config.user.timezone));
  tools.push(createFetchUrlTool());
  tools.push(createMemorySearchTool(memory));
  tools.push(createConversationSearchTool(memory));
  tools.push(createAttachmentSearchTool(memory));

  // Requires location config
  if (config.location) {
    tools.push(createWeatherTool(config.location, config.user));
  }

  // Requires Tavily API key
  if (config.tasks.tavilyApiKey) {
    tools.push(createSearchTool(config.tasks.tavilyApiKey));
  }

  return tools;
}

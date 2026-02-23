import type { AppRegistry } from "../core/app-registry";
import { DashboardApp } from "./dashboard";
import { ConfigApp } from "./config";
import { AgentMonitorApp } from "./agent-monitor";
import { ChatApp } from "./chat";
import { McpManagerApp } from "./mcp-manager";

export function registerApps(registry: AppRegistry) {
  registry.register(DashboardApp);
  registry.register(ConfigApp);
  registry.register(AgentMonitorApp);
  registry.register(ChatApp);
  registry.register(McpManagerApp);
}

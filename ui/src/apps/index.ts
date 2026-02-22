import type { AppRegistry } from "../core/app-registry";
import { DashboardApp } from "./dashboard";
import { ConfigApp } from "./config";

export function registerApps(registry: AppRegistry) {
  registry.register(DashboardApp);
  registry.register(ConfigApp);
}

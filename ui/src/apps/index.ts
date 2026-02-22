import type { AppRegistry } from "../core/app-registry";
import { DashboardApp } from "./dashboard";

export function registerApps(registry: AppRegistry) {
  registry.register(DashboardApp);
}

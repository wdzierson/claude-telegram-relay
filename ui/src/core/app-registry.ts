import type { ComponentType } from "react";

export interface AppProps {
  windowId: string;
}

export interface BrightApp {
  id: string;
  name: string;
  icon: string;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  component: ComponentType<AppProps>;
  category: "core" | "tools" | "custom";
}

export interface AppRegistry {
  register(app: BrightApp): void;
  get(id: string): BrightApp | undefined;
  getAll(): BrightApp[];
  getByCategory(category: BrightApp["category"]): BrightApp[];
}

export function createAppRegistry(): AppRegistry {
  const apps = new Map<string, BrightApp>();

  return {
    register(app: BrightApp) {
      apps.set(app.id, app);
    },
    get(id: string) {
      return apps.get(id);
    },
    getAll() {
      return Array.from(apps.values());
    },
    getByCategory(category: BrightApp["category"]) {
      return Array.from(apps.values()).filter((a) => a.category === category);
    },
  };
}

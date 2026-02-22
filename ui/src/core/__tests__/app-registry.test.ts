import { describe, it, expect } from "vitest";
import { createAppRegistry, type BrightApp } from "../app-registry";

const makeApp = (id: string, category: BrightApp["category"] = "core"): BrightApp => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  icon: "layout-dashboard",
  defaultSize: { w: 800, h: 600 },
  component: () => null,
  category,
});

describe("AppRegistry", () => {
  it("registers and retrieves an app", () => {
    const reg = createAppRegistry();
    reg.register(makeApp("dashboard"));
    expect(reg.get("dashboard")).toBeDefined();
    expect(reg.get("dashboard")!.name).toBe("Dashboard");
  });

  it("returns undefined for unregistered app", () => {
    const reg = createAppRegistry();
    expect(reg.get("nope")).toBeUndefined();
  });

  it("lists all apps", () => {
    const reg = createAppRegistry();
    reg.register(makeApp("a"));
    reg.register(makeApp("b"));
    expect(reg.getAll()).toHaveLength(2);
  });

  it("lists apps by category", () => {
    const reg = createAppRegistry();
    reg.register(makeApp("dash", "core"));
    reg.register(makeApp("monitor", "tools"));
    reg.register(makeApp("chat", "core"));
    expect(reg.getByCategory("core")).toHaveLength(2);
    expect(reg.getByCategory("tools")).toHaveLength(1);
  });
});

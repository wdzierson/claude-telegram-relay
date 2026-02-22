import { describe, it, expect, beforeEach } from "vitest";
import { useWindowStore } from "../window-store";

describe("WindowStore", () => {
  beforeEach(() => {
    useWindowStore.setState({ windows: {}, nextZIndex: 1 });
  });

  it("creates a window with default position", () => {
    const { openWindow } = useWindowStore.getState();
    const id = openWindow({ appId: "dashboard", title: "Dashboard", w: 800, h: 600 });
    const { windows } = useWindowStore.getState();
    expect(windows[id]).toBeDefined();
    expect(windows[id].title).toBe("Dashboard");
    expect(windows[id].w).toBe(800);
    expect(windows[id].h).toBe(600);
    expect(windows[id].isMinimized).toBe(false);
    expect(windows[id].isMaximized).toBe(false);
  });

  it("closes a window", () => {
    const { openWindow } = useWindowStore.getState();
    const id = openWindow({ appId: "test", title: "Test", w: 400, h: 300 });
    useWindowStore.getState().closeWindow(id);
    expect(useWindowStore.getState().windows[id]).toBeUndefined();
  });

  it("focuses a window (bumps zIndex)", () => {
    const { openWindow } = useWindowStore.getState();
    const id1 = openWindow({ appId: "a", title: "A", w: 400, h: 300 });
    const id2 = openWindow({ appId: "b", title: "B", w: 400, h: 300 });
    useWindowStore.getState().focusWindow(id1);
    const { windows } = useWindowStore.getState();
    expect(windows[id1].zIndex).toBeGreaterThan(windows[id2].zIndex);
  });

  it("moves a window", () => {
    const { openWindow } = useWindowStore.getState();
    const id = openWindow({ appId: "test", title: "Test", w: 400, h: 300 });
    useWindowStore.getState().moveWindow(id, 100, 200);
    expect(useWindowStore.getState().windows[id].x).toBe(100);
    expect(useWindowStore.getState().windows[id].y).toBe(200);
  });

  it("resizes a window respecting minSize", () => {
    const { openWindow } = useWindowStore.getState();
    const id = openWindow({ appId: "test", title: "Test", w: 400, h: 300, minW: 200, minH: 150 });
    useWindowStore.getState().resizeWindow(id, 100, 50);
    const win = useWindowStore.getState().windows[id];
    expect(win.w).toBe(200);
    expect(win.h).toBe(150);
  });

  it("toggles maximize", () => {
    const { openWindow } = useWindowStore.getState();
    const id = openWindow({ appId: "test", title: "Test", w: 400, h: 300 });
    useWindowStore.getState().toggleMaximize(id);
    expect(useWindowStore.getState().windows[id].isMaximized).toBe(true);
    useWindowStore.getState().toggleMaximize(id);
    expect(useWindowStore.getState().windows[id].isMaximized).toBe(false);
  });

  it("toggles minimize", () => {
    const { openWindow } = useWindowStore.getState();
    const id = openWindow({ appId: "test", title: "Test", w: 400, h: 300 });
    useWindowStore.getState().minimizeWindow(id);
    expect(useWindowStore.getState().windows[id].isMinimized).toBe(true);
  });
});

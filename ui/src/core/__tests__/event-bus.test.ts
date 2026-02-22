import { describe, it, expect, vi } from "vitest";
import { createEventBus } from "../event-bus";

describe("EventBus", () => {
  it("emits and receives events", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on("test-event", handler);
    bus.emit("test-event", { value: 42 });
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it("unsubscribes correctly", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const unsub = bus.on("test-event", handler);
    unsub();
    bus.emit("test-event", { value: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports multiple listeners", () => {
    const bus = createEventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on("evt", h1);
    bus.on("evt", h2);
    bus.emit("evt", "data");
    expect(h1).toHaveBeenCalledWith("data");
    expect(h2).toHaveBeenCalledWith("data");
  });

  it("does not bleed between event types", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on("a", handler);
    bus.emit("b", "data");
    expect(handler).not.toHaveBeenCalled();
  });
});

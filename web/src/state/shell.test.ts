import { describe, expect, it, vi } from "vitest";
import { createShell, guardOutput } from "./shell";

describe("shell", () => {
  it("has at most one panel; toggling the open one closes it; another switches", () => {
    const s = createShell();
    expect(s.panel()).toBeNull();
    s.toggle("library");
    expect(s.panel()).toBe("library");
    s.toggle("info");
    expect(s.panel()).toBe("info");
    s.toggle("info");
    expect(s.panel()).toBeNull();
    s.toggle("settings");
    s.close();
    expect(s.panel()).toBeNull();
  });

  it("connection popover is independent of the panel", () => {
    const s = createShell();
    s.toggle("import");
    s.openConnection();
    expect(s.connectionOpen()).toBe(true);
    expect(s.panel()).toBe("import");
    s.closeConnection();
    expect(s.connectionOpen()).toBe(false);
  });

  it("guardOutput runs fn with its arguments when an output exists", () => {
    const s = createShell();
    const fn = vi.fn();
    guardOutput({ hasOutput: () => true }, s, fn)(3, 90);
    expect(fn).toHaveBeenCalledWith(3, 90);
    expect(s.connectionOpen()).toBe(false);
  });

  it("guardOutput opens the connection popover and does not run fn without an output", () => {
    const s = createShell();
    const fn = vi.fn();
    guardOutput({ hasOutput: () => false }, s, fn)();
    expect(fn).not.toHaveBeenCalled();
    expect(s.connectionOpen()).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { logError, logInfo } from "../logger.js";

describe("logInfo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes to console.log with an ISO timestamp prefix", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logInfo("hello world");

    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0]?.[0] as string;
    expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] hello world$/);
  });
});

describe("logError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes to console.error with a timestamp prefix and the error's stack", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("boom");

    logError("something failed", err);

    expect(spy).toHaveBeenCalledOnce();
    const [line, detail] = spy.mock.calls[0] as [string, unknown];
    expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}T.*\] something failed$/);
    expect(detail).toBe(err.stack);
  });

  it("still logs a message with no error argument, without an extra undefined", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logError("no error object here");

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]).toHaveLength(1);
  });

  it("logs non-Error values (e.g. a plain string throw) as-is", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logError("something failed", "a plain string error");

    expect(spy.mock.calls[0]?.[1]).toBe("a plain string error");
  });
});

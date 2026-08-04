import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without `test.globals: true` in the vitest config, RTL can't auto-detect
// the test framework to register its own cleanup - do it explicitly so
// each test starts from a fresh DOM instead of accumulating render output
// from every previous test in the file (which causes spurious "found
// multiple elements" failures).
afterEach(cleanup);

// jsdom doesn't implement ResizeObserver - SankeyChart uses it to track its
// container width. A minimal stub is enough for tests: components under
// test don't need real resize callbacks, just something that doesn't throw
// "ResizeObserver is not defined" when they call `new ResizeObserver(...)`.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver ??= ResizeObserverStub;

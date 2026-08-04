import { describe, expect, it } from "vitest";
import { nodeDisplayLabel } from "./nodeDisplayLabel";

describe("nodeDisplayLabel", () => {
  it("shows only the last segment of a hierarchical prefix", () => {
    expect(nodeDisplayLabel("acme/sales/orders")).toBe("orders");
    expect(nodeDisplayLabel("acme/sales")).toBe("sales");
    expect(nodeDisplayLabel("acme")).toBe("acme");
  });

  it("keeps wildcard segments as-is", () => {
    expect(nodeDisplayLabel("acme/sales/orders/>")).toBe(">");
    expect(nodeDisplayLabel("acme/*")).toBe("*");
  });

  it("leaves endpoint labels (no slash) unchanged", () => {
    expect(nodeDisplayLabel("Queue: orders-q")).toBe("Queue: orders-q");
    expect(nodeDisplayLabel("Topic Endpoint: te-orders")).toBe(
      "Topic Endpoint: te-orders",
    );
  });

  it("falls back to the full id if it ends with a trailing slash", () => {
    expect(nodeDisplayLabel("acme/sales/")).toBe("acme/sales/");
  });
});

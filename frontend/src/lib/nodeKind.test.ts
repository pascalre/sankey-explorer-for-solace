import { describe, expect, it } from "vitest";
import { endpointTypeLabel, isEndpointNode } from "./nodeKind";

describe("isEndpointNode", () => {
  it("recognizes queue and topic-endpoint ids", () => {
    expect(isEndpointNode("Queue: orders-q")).toBe(true);
    expect(isEndpointNode("Topic Endpoint: te-orders")).toBe(true);
    expect(isEndpointNode("acme/sales")).toBe(false);
  });
});

describe("endpointTypeLabel", () => {
  it("returns a human-readable type for endpoint ids", () => {
    expect(endpointTypeLabel("Queue: orders-q")).toBe("Queue");
    expect(endpointTypeLabel("Topic Endpoint: te-orders")).toBe("Topic Endpoint");
  });

  it("returns null for non-endpoint (topic hierarchy) ids", () => {
    expect(endpointTypeLabel("acme/sales")).toBeNull();
  });

  it("still works when a broker-disambiguation suffix is present", () => {
    expect(endpointTypeLabel("Queue: orders-q (EU-Broker)")).toBe("Queue");
  });
});

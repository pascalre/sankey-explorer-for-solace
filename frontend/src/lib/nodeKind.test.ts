import { describe, expect, it } from "vitest";
import { endpointTypeLabel, isEndpointNode } from "./nodeKind";

describe("isEndpointNode", () => {
  it("recognizes queue, topic-endpoint and direct-subscriber ids", () => {
    expect(isEndpointNode("Queue: orders-q")).toBe(true);
    expect(isEndpointNode("Topic Endpoint: te-orders")).toBe(true);
    expect(isEndpointNode("Direct Subscriber: my-app-1")).toBe(true);
    expect(isEndpointNode("acme/sales")).toBe(false);
  });
});

describe("endpointTypeLabel", () => {
  it("returns a human-readable type for endpoint ids", () => {
    expect(endpointTypeLabel("Queue: orders-q")).toBe("Queue");
    expect(endpointTypeLabel("Topic Endpoint: te-orders")).toBe("Topic Endpoint");
    expect(endpointTypeLabel("Direct Subscriber: my-app-1")).toBe("Direct Subscriber");
  });

  it("returns null for non-endpoint (topic hierarchy) ids", () => {
    expect(endpointTypeLabel("acme/sales")).toBeNull();
  });

  it("still works when a broker-disambiguation suffix is present", () => {
    expect(endpointTypeLabel("Queue: orders-q (EU-Broker)")).toBe("Queue");
  });
});

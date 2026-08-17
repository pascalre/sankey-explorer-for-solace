import { describe, expect, it } from "vitest";
import { endpointDisplayName } from "./endpointDisplayName";

describe("endpointDisplayName", () => {
  it("strips the 'Queue: ' prefix", () => {
    expect(endpointDisplayName("Queue: orders-q")).toBe("orders-q");
  });

  it("strips the 'Topic Endpoint: ' prefix", () => {
    expect(endpointDisplayName("Topic Endpoint: te-orders")).toBe("te-orders");
  });

  it("strips the 'Direct Subscriber: ' prefix", () => {
    expect(endpointDisplayName("Direct Subscriber: my-app-1")).toBe("my-app-1");
  });

  it("strips a trailing broker-disambiguation suffix in parentheses", () => {
    expect(endpointDisplayName("Queue: orders-q (EU-Broker)")).toBe("orders-q");
  });

  it("leaves non-endpoint ids (topic hierarchy nodes) unchanged", () => {
    expect(endpointDisplayName("acme/sales")).toBe("acme/sales");
  });

  it("does not strip parentheses that are part of the actual endpoint name itself", () => {
    // Only strips a suffix if the id also has a recognized type prefix -
    // here there's no "Queue: "/"Topic Endpoint: " prefix, so it's treated
    // as a non-endpoint id and left alone entirely.
    expect(endpointDisplayName("weird(name)")).toBe("weird(name)");
  });
});

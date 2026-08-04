import { describe, expect, it } from "vitest";
import { buildEndpointOwners } from "./buildEndpointOwners";
import type { EndpointInfo } from "../types";

describe("buildEndpointOwners", () => {
  it("maps each endpoint's Sankey label to its owner", () => {
    const endpoints: EndpointInfo[] = [
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: [],
        owner: "app-svc-orders",
        brokerLabel: "default",
        brokerHost: "localhost:8080",
      },
      {
        type: "topic-endpoint",
        name: "te-orders",
        vpn: "default",
        subscriptions: [],
        owner: "app-svc-fulfillment",
        brokerLabel: "default",
        brokerHost: "localhost:8080",
      },
    ];

    const owners = buildEndpointOwners(endpoints);

    expect(owners.get("Queue: orders-q")).toBe("app-svc-orders");
    expect(owners.get("Topic Endpoint: te-orders")).toBe("app-svc-fulfillment");
  });

  it("omits endpoints without a known owner", () => {
    const endpoints: EndpointInfo[] = [
      {
        type: "queue",
        name: "no-owner-q",
        vpn: "default",
        subscriptions: [],
        brokerLabel: "default",
        brokerHost: "localhost:8080",
      },
    ];

    const owners = buildEndpointOwners(endpoints);

    expect(owners.has("Queue: no-owner-q")).toBe(false);
  });
});

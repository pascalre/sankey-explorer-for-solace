import { describe, expect, it } from "vitest";
import { buildEndpointLabelMap } from "./buildEndpointLabelMap";
import type { EndpointInfo } from "../types";

describe("buildEndpointLabelMap", () => {
  it("maps each endpoint's Sankey label to whatever getValue returns", () => {
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
    ];

    const owners = buildEndpointLabelMap(endpoints, (e) => e.owner);

    expect(owners.get("Queue: orders-q")).toBe("app-svc-orders");
  });

  it("omits entries where getValue returns undefined", () => {
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

    const owners = buildEndpointLabelMap(endpoints, (e) => e.owner);

    expect(owners.has("Queue: no-owner-q")).toBe(false);
  });

  it("applies the same broker-disambiguation suffix as the rest of the pipeline", () => {
    const endpoints: EndpointInfo[] = [
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: [],
        brokerLabel: "EU-Broker",
        brokerHost: "host-a",
      },
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: [],
        brokerLabel: "US-Broker",
        brokerHost: "host-b",
      },
    ];

    const hosts = buildEndpointLabelMap(endpoints, (e) => e.brokerHost);

    expect(hosts.get("Queue: orders-q (EU-Broker)")).toBe("host-a");
    expect(hosts.get("Queue: orders-q (US-Broker)")).toBe("host-b");
  });
});

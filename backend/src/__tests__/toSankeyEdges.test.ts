import { describe, expect, it } from "vitest";
import { toSankeyEdges } from "../semp/toSankeyEdges.js";
import type { EndpointInfo } from "../semp/types.js";

describe("toSankeyEdges", () => {
  it("creates one edge per topic-to-endpoint pair", () => {
    const endpoints: EndpointInfo[] = [
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: ["orders/created", "orders/cancelled"],
        brokerLabel: "default",
        brokerHost: "localhost:8080",
      },
      {
        type: "topic-endpoint",
        name: "te-orders",
        vpn: "default",
        subscriptions: ["orders/created"],
        brokerLabel: "default",
        brokerHost: "localhost:8080",
      },
      {
        type: "direct-subscriber",
        name: "my-app-1",
        vpn: "default",
        subscriptions: ["orders/created"],
        brokerLabel: "default",
        brokerHost: "localhost:8080",
      },
    ];

    const edges = toSankeyEdges(endpoints);

    expect(edges).toEqual(
      expect.arrayContaining([
        { source: "orders/created", target: "Queue: orders-q", value: 1 },
        { source: "orders/cancelled", target: "Queue: orders-q", value: 1 },
        {
          source: "orders/created",
          target: "Topic Endpoint: te-orders",
          value: 1,
        },
        {
          source: "orders/created",
          target: "Direct Subscriber: my-app-1",
          value: 1,
        },
      ]),
    );
    expect(edges).toHaveLength(4);
  });

  it("merges duplicate subscriptions on the same endpoint into one edge with value > 1", () => {
    const endpoints: EndpointInfo[] = [
      {
        type: "queue",
        name: "dup-q",
        vpn: "default",
        subscriptions: ["orders/created", "orders/created"],
        brokerLabel: "default",
        brokerHost: "localhost:8080",
      },
    ];

    const edges = toSankeyEdges(endpoints);

    expect(edges).toEqual([
      { source: "orders/created", target: "Queue: dup-q", value: 2 },
    ]);
  });

  it("returns an empty array for endpoints without subscriptions", () => {
    const endpoints: EndpointInfo[] = [
      {
        type: "queue",
        name: "empty-q",
        vpn: "default",
        subscriptions: [],
        brokerLabel: "default",
        brokerHost: "localhost:8080",
      },
    ];

    expect(toSankeyEdges(endpoints)).toEqual([]);
  });

  it("does not suffix the broker label when only one broker is present", () => {
    const endpoints: EndpointInfo[] = [
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: ["orders/created"],
        brokerLabel: "EU-Broker",
        brokerHost: "localhost:8080",
      },
    ];

    expect(toSankeyEdges(endpoints)).toEqual([
      { source: "orders/created", target: "Queue: orders-q", value: 1 },
    ]);
  });

  it("suffixes the broker label to disambiguate same-named endpoints across multiple brokers", () => {
    const endpoints: EndpointInfo[] = [
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: ["orders/created"],
        brokerLabel: "EU-Broker",
        brokerHost: "localhost:8080",
      },
      {
        type: "queue",
        name: "orders-q", // same name, different broker - must NOT merge
        vpn: "default",
        subscriptions: ["orders/created"],
        brokerLabel: "US-Broker",
        brokerHost: "localhost:8080",
      },
    ];

    const edges = toSankeyEdges(endpoints);

    expect(edges).toEqual(
      expect.arrayContaining([
        {
          source: "orders/created",
          target: "Queue: orders-q (EU-Broker)",
          value: 1,
        },
        {
          source: "orders/created",
          target: "Queue: orders-q (US-Broker)",
          value: 1,
        },
      ]),
    );
    expect(edges).toHaveLength(2);
  });

  it("adds an implied edge for a queue whose wildcard subscription also covers a different endpoint's more specific topic", () => {
    const endpoints: EndpointInfo[] = [
      {
        type: "queue",
        name: "all-sales-q",
        vpn: "default",
        subscriptions: ["acme/sales/>"],
        brokerLabel: "default",
        brokerHost: "localhost:8080",
      },
      {
        type: "topic-endpoint",
        name: "te-orders",
        vpn: "default",
        subscriptions: ["acme/sales/orders"],
        brokerLabel: "default",
        brokerHost: "localhost:8080",
      },
    ];

    const edges = toSankeyEdges(endpoints);

    expect(edges).toEqual(
      expect.arrayContaining([
        { source: "acme/sales/>", target: "Queue: all-sales-q", value: 1 },
        { source: "acme/sales/orders", target: "Topic Endpoint: te-orders", value: 1 },
        { source: "acme/sales/orders", target: "Queue: all-sales-q", value: 1 },
      ]),
    );
    expect(edges).toHaveLength(3);
  });
});

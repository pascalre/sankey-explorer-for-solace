import { describe, expect, it } from "vitest";
import { toSankeyEdges, shouldShowBrokerSuffix } from "./toSankeyEdges";
import type { EndpointInfo } from "../types";

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
    ];

    const edges = toSankeyEdges(endpoints);

    expect(edges).toEqual(
      expect.arrayContaining([
        { source: "orders/created", target: "Queue: orders-q", value: 1 },
        { source: "orders/cancelled", target: "Queue: orders-q", value: 1 },
      ]),
    );
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
        name: "orders-q",
        vpn: "default",
        subscriptions: ["orders/created"],
        brokerLabel: "US-Broker",
        brokerHost: "localhost:8080",
      },
    ];

    const edges = toSankeyEdges(endpoints);

    expect(edges).toEqual(
      expect.arrayContaining([
        { source: "orders/created", target: "Queue: orders-q (EU-Broker)", value: 1 },
        { source: "orders/created", target: "Queue: orders-q (US-Broker)", value: 1 },
      ]),
    );
    expect(edges).toHaveLength(2);
  });
});

describe("shouldShowBrokerSuffix", () => {
  it("is false for zero or one distinct broker, true for two or more", () => {
    expect(shouldShowBrokerSuffix([])).toBe(false);
    expect(shouldShowBrokerSuffix([{ brokerLabel: "A" } as EndpointInfo])).toBe(false);
    expect(
      shouldShowBrokerSuffix([
        { brokerLabel: "A" } as EndpointInfo,
        { brokerLabel: "A" } as EndpointInfo,
      ]),
    ).toBe(false);
    expect(
      shouldShowBrokerSuffix([
        { brokerLabel: "A" } as EndpointInfo,
        { brokerLabel: "B" } as EndpointInfo,
      ]),
    ).toBe(true);
  });
});

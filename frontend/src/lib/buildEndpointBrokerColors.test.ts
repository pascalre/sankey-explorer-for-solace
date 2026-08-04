import { describe, expect, it } from "vitest";
import {
  buildBrokerColorPalette,
  buildEndpointBrokerColors,
} from "./buildEndpointBrokerColors";
import type { EndpointInfo } from "../types";

describe("buildBrokerColorPalette", () => {
  it("assigns distinct colors in first-seen order", () => {
    const palette = buildBrokerColorPalette(["Broker-A", "Broker-B", "Broker-A"]);

    expect(palette.get("Broker-A")).toBeDefined();
    expect(palette.get("Broker-B")).toBeDefined();
    expect(palette.get("Broker-A")).not.toBe(palette.get("Broker-B"));
  });

  it("cycles the palette when there are more brokers than colors", () => {
    const manyBrokers = Array.from({ length: 20 }, (_, i) => `Broker-${i}`);
    const palette = buildBrokerColorPalette(manyBrokers);

    // Every broker still gets *some* color, even beyond the palette length.
    for (const b of manyBrokers) {
      expect(palette.get(b)).toBeDefined();
    }
  });
});

describe("buildEndpointBrokerColors", () => {
  it("maps each endpoint's Sankey label to its broker's color and reports the broker count", () => {
    const endpoints: EndpointInfo[] = [
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: [],
        brokerLabel: "Broker-A",
        brokerHost: "localhost:8080",
      },
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: [],
        brokerLabel: "Broker-B",
        brokerHost: "localhost:8080",
      },
    ];

    const { colorByEndpointLabel, brokerCount } = buildEndpointBrokerColors(endpoints);

    expect(brokerCount).toBe(2);
    // Labels get the broker suffix here because there are 2 distinct brokers.
    const colorA = colorByEndpointLabel.get("Queue: orders-q (Broker-A)");
    const colorB = colorByEndpointLabel.get("Queue: orders-q (Broker-B)");
    expect(colorA).toBeDefined();
    expect(colorB).toBeDefined();
    expect(colorA).not.toBe(colorB);
  });

  it("reports brokerCount 1 and does not suffix labels for a single broker", () => {
    const endpoints: EndpointInfo[] = [
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: [],
        brokerLabel: "Broker-A",
        brokerHost: "localhost:8080",
      },
    ];

    const { colorByEndpointLabel, brokerCount } = buildEndpointBrokerColors(endpoints);

    expect(brokerCount).toBe(1);
    expect(colorByEndpointLabel.get("Queue: orders-q")).toBeDefined();
  });
});

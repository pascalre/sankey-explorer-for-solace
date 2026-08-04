import { describe, expect, it } from "vitest";
import { buildEndpointBrokerLabels } from "./buildEndpointBrokerLabels";
import type { EndpointInfo } from "../types";

describe("buildEndpointBrokerLabels", () => {
  it("maps each endpoint's Sankey label to its message VPN (broker) label", () => {
    const endpoints: EndpointInfo[] = [
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: [],
        brokerLabel: "EU-VPN",
        brokerHost: "localhost:8080",
      },
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: [],
        brokerLabel: "US-VPN",
        brokerHost: "localhost:8080",
      },
    ];

    const labels = buildEndpointBrokerLabels(endpoints);

    // 2 distinct brokers present -> labels get the disambiguating suffix.
    expect(labels.get("Queue: orders-q (EU-VPN)")).toBe("EU-VPN");
    expect(labels.get("Queue: orders-q (US-VPN)")).toBe("US-VPN");
  });

  it("does not suffix the label when only one message VPN is present", () => {
    const endpoints: EndpointInfo[] = [
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: [],
        brokerLabel: "EU-VPN",
        brokerHost: "localhost:8080",
      },
    ];

    const labels = buildEndpointBrokerLabels(endpoints);

    expect(labels.get("Queue: orders-q")).toBe("EU-VPN");
  });
});

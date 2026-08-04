import { describe, expect, it } from "vitest";
import { buildEndpointVpnHost } from "./buildEndpointVpnHost";
import type { EndpointInfo } from "../types";

describe("buildEndpointVpnHost", () => {
  it("maps each endpoint's Sankey label to 'vpn at host'", () => {
    const endpoints: EndpointInfo[] = [
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: [],
        brokerLabel: "EU-Broker",
        brokerHost: "localhost:8080",
      },
    ];

    const vpnHost = buildEndpointVpnHost(endpoints);

    // Single broker -> no disambiguation suffix on the key, matching how
    // every other per-endpoint map (owner, broker color) keys itself.
    expect(vpnHost.get("Queue: orders-q")).toBe("default at localhost:8080");
  });

  it("uses the actual VPN name, not the (possibly custom) broker label", () => {
    const endpoints: EndpointInfo[] = [
      {
        type: "queue",
        name: "orders-q",
        vpn: "prod-vpn",
        subscriptions: [],
        brokerLabel: "My Custom Broker Name",
        brokerHost: "broker.example.com",
      },
    ];

    const vpnHost = buildEndpointVpnHost(endpoints);

    expect(vpnHost.get("Queue: orders-q")).toBe("prod-vpn at broker.example.com");
  });
});

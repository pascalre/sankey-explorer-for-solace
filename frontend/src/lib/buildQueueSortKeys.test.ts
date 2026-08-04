import { describe, expect, it } from "vitest";
import { buildQueueSortKeys } from "./buildQueueSortKeys";
import type { SankeyEdge } from "./toSankeyEdges";

describe("buildQueueSortKeys", () => {
  it("gives an endpoint (sink node) its own id as sort key", () => {
    const edges: SankeyEdge[] = [
      { source: "orders/created", target: "Queue: B", value: 1 },
    ];

    const keys = buildQueueSortKeys(edges);

    expect(keys.get("Queue: B")).toBe("Queue: B");
  });

  it("gives a topic node the key of the single endpoint it reaches", () => {
    const edges: SankeyEdge[] = [
      { source: "acme", target: "acme/sales", value: 1 },
      { source: "acme/sales", target: "Queue: B", value: 1 },
    ];

    const keys = buildQueueSortKeys(edges);

    expect(keys.get("acme/sales")).toBe("Queue: B");
    expect(keys.get("acme")).toBe("Queue: B");
  });

  it("uses the alphabetically smallest reachable endpoint when a topic fans out to several", () => {
    const edges: SankeyEdge[] = [
      { source: "acme", target: "Queue: B", value: 1 },
      { source: "acme", target: "Queue: A", value: 1 },
    ];

    const keys = buildQueueSortKeys(edges);

    expect(keys.get("acme")).toBe("Queue: A");
  });

  it("lets independent branches sort by their own destination queue", () => {
    const edges: SankeyEdge[] = [
      { source: "acme/sales/orders", target: "Queue: Orders", value: 1 },
      { source: "acme/sales/cart", target: "Queue: Abandoned", value: 1 },
    ];

    const keys = buildQueueSortKeys(edges);

    expect(keys.get("acme/sales/orders")).toBe("Queue: Orders");
    expect(keys.get("acme/sales/cart")).toBe("Queue: Abandoned");
  });

  it("accepts a custom endpointKey function to key by something other than the endpoint's own id (e.g. owner)", () => {
    const edges: SankeyEdge[] = [
      { source: "acme/sales/orders", target: "Queue: Orders", value: 1 },
      { source: "acme/sales/cart", target: "Queue: Abandoned", value: 1 },
    ];
    const owners = new Map([
      ["Queue: Orders", "team-fulfillment"],
      ["Queue: Abandoned", "team-marketing"],
    ]);

    const keys = buildQueueSortKeys(edges, (id) => owners.get(id) ?? "");

    expect(keys.get("Queue: Orders")).toBe("team-fulfillment");
    expect(keys.get("acme/sales/orders")).toBe("team-fulfillment");
    expect(keys.get("acme/sales/cart")).toBe("team-marketing");
  });
});

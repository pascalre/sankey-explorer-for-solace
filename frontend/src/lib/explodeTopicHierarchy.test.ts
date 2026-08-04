import { describe, expect, it } from "vitest";
import { explodeTopicHierarchy } from "./explodeTopicHierarchy";
import type { SankeyEdge } from "./toSankeyEdges";

describe("explodeTopicHierarchy", () => {
  it("splits a multi-level topic into a chain of prefix nodes", () => {
    const edges: SankeyEdge[] = [
      { source: "acme/sales/orders/>", target: "Queue: XY", value: 1 },
    ];

    const result = explodeTopicHierarchy(edges);

    expect(result).toEqual(
      expect.arrayContaining([
        { source: "acme", target: "acme/sales", value: 1 },
        { source: "acme/sales", target: "acme/sales/orders", value: 1 },
        { source: "acme/sales/orders", target: "acme/sales/orders/>", value: 1 },
        { source: "acme/sales/orders/>", target: "Queue: XY", value: 1 },
      ]),
    );
    expect(result).toHaveLength(4);
  });

  it("leaves a single-segment topic (no slash) as one edge", () => {
    const edges: SankeyEdge[] = [{ source: "orders", target: "Queue: XY", value: 1 }];

    const result = explodeTopicHierarchy(edges);

    expect(result).toEqual([{ source: "orders", target: "Queue: XY", value: 1 }]);
  });

  it("merges shared prefixes from different topics and sums their value", () => {
    const edges: SankeyEdge[] = [
      { source: "acme/sales/orders", target: "Queue: A", value: 1 },
      { source: "acme/sales/refunds", target: "Queue: B", value: 1 },
    ];

    const result = explodeTopicHierarchy(edges);

    // "acme" -> "acme/sales" is traversed by both topics -> value 2
    expect(result).toContainEqual({ source: "acme", target: "acme/sales", value: 2 });
    // paths diverge again from here
    expect(result).toContainEqual({
      source: "acme/sales",
      target: "acme/sales/orders",
      value: 1,
    });
    expect(result).toContainEqual({
      source: "acme/sales",
      target: "acme/sales/refunds",
      value: 1,
    });
  });

  it("respects the original edge value as weight through the whole chain", () => {
    const edges: SankeyEdge[] = [
      { source: "a/b", target: "Queue: X", value: 3 },
    ];

    const result = explodeTopicHierarchy(edges);

    expect(result).toEqual([
      { source: "a", target: "a/b", value: 3 },
      { source: "a/b", target: "Queue: X", value: 3 },
    ]);
  });
});

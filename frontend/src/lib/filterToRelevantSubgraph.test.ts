import { describe, expect, it } from "vitest";
import { filterToRelevantSubgraph } from "./filterToRelevantSubgraph";
import type { SankeyEdge } from "./toSankeyEdges";

const edges: SankeyEdge[] = [
  // acme/sales/orders -> Queue A
  { source: "acme", target: "acme/sales", value: 2 },
  { source: "acme/sales", target: "acme/sales/orders", value: 1 },
  { source: "acme/sales/orders", target: "Queue: A", value: 1 },
  // acme/sales/cart -> Queue B (teilt den "acme/sales"-Ast mit A)
  { source: "acme/sales", target: "acme/sales/cart", value: 1 },
  { source: "acme/sales/cart", target: "Queue: B", value: 1 },
  // completely independent branch -> Queue C
  { source: "finance", target: "finance/payments", value: 1 },
  { source: "finance/payments", target: "Queue: C", value: 1 },
];

describe("filterToRelevantSubgraph", () => {
  it("clicking a queue (sink node) returns only its ancestor chain, not unrelated branches", () => {
    const result = filterToRelevantSubgraph(edges, "Queue: A");

    expect(result).toEqual(
      expect.arrayContaining([
        { source: "acme", target: "acme/sales", value: 2 },
        { source: "acme/sales", target: "acme/sales/orders", value: 1 },
        { source: "acme/sales/orders", target: "Queue: A", value: 1 },
      ]),
    );
    expect(result).toHaveLength(3);
    // Queue B and the finance branch must NOT show up.
    expect(result.some((e) => e.target === "Queue: B")).toBe(false);
    expect(result.some((e) => e.source === "finance")).toBe(false);
  });

  it("clicking a mid-level topic segment returns ancestors AND all reachable descendants/queues", () => {
    const result = filterToRelevantSubgraph(edges, "acme/sales");

    // Ancestor: acme -> acme/sales
    expect(result).toContainEqual({ source: "acme", target: "acme/sales", value: 2 });
    // Descendants: both branches (orders->A and cart->B) are reachable
    expect(result).toContainEqual({
      source: "acme/sales",
      target: "acme/sales/orders",
      value: 1,
    });
    expect(result).toContainEqual({
      source: "acme/sales/orders",
      target: "Queue: A",
      value: 1,
    });
    expect(result).toContainEqual({
      source: "acme/sales",
      target: "acme/sales/cart",
      value: 1,
    });
    expect(result).toContainEqual({ source: "acme/sales/cart", target: "Queue: B", value: 1 });
    // finance branch stays completely out of the result
    expect(result.some((e) => e.source === "finance" || e.target === "Queue: C")).toBe(
      false,
    );
  });

  it("returns an empty array for a node id that does not exist in the edges", () => {
    expect(filterToRelevantSubgraph(edges, "does-not-exist")).toEqual([]);
  });

  it("returns the same edges when filtering on a leaf-most root with only one branch", () => {
    const result = filterToRelevantSubgraph(edges, "finance");
    expect(result).toEqual([
      { source: "finance", target: "finance/payments", value: 1 },
      { source: "finance/payments", target: "Queue: C", value: 1 },
    ]);
  });
});

describe("filterToRelevantSubgraph as the anchor for edge hover/click", () => {
  it("calling it with a link's TARGET gives the exact same result as clicking/hovering that link directly would need", () => {
    // A link between "acme/sales" and "acme/sales/orders" should highlight/
    // select exactly the same thing as the "acme/sales/orders" node itself -
    // that's the whole point of resolving link hover/click to their target
    // node id in SankeyChart instead of a separate edge-based computation.
    const result = filterToRelevantSubgraph(edges, "acme/sales/orders");

    expect(result).toEqual(
      expect.arrayContaining([
        { source: "acme", target: "acme/sales", value: 2 },
        { source: "acme/sales", target: "acme/sales/orders", value: 1 },
        { source: "acme/sales/orders", target: "Queue: A", value: 1 },
      ]),
    );
    expect(result).toHaveLength(3);
    // The sibling "cart" branch must not show up.
    expect(result.some((e) => e.target === "Queue: B")).toBe(false);
  });
});

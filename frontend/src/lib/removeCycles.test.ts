import { describe, expect, it } from "vitest";
import { removeCycles } from "./removeCycles";
import type { SankeyEdge } from "./toSankeyEdges";

describe("removeCycles", () => {
  it("keeps a normal acyclic bipartite graph untouched", () => {
    const edges: SankeyEdge[] = [
      { source: "orders/created", target: "Queue: orders-q", value: 1 },
      { source: "orders/created", target: "Topic Endpoint: te-orders", value: 1 },
    ];

    const { acyclicEdges, removedEdges } = removeCycles(edges);

    expect(removedEdges).toEqual([]);
    expect(acyclicEdges).toHaveLength(2);
  });

  it("removes a self-loop (topic name collides with its own endpoint label)", () => {
    const edges: SankeyEdge[] = [
      { source: "Queue: orders-q", target: "Queue: orders-q", value: 1 },
      { source: "orders/created", target: "Queue: orders-q", value: 1 },
    ];

    const { acyclicEdges, removedEdges } = removeCycles(edges);

    expect(removedEdges).toEqual([
      { source: "Queue: orders-q", target: "Queue: orders-q", value: 1 },
    ]);
    expect(acyclicEdges).toEqual([
      { source: "orders/created", target: "Queue: orders-q", value: 1 },
    ]);
  });

  it("removes edges stuck in a multi-hop cycle", () => {
    const edges: SankeyEdge[] = [
      { source: "a", target: "b", value: 1 },
      { source: "b", target: "c", value: 1 },
      { source: "c", target: "a", value: 1 },
      { source: "x", target: "a", value: 1 }, // not part of the cycle, stays
    ];

    const { acyclicEdges, removedEdges } = removeCycles(edges);

    expect(acyclicEdges).toEqual([{ source: "x", target: "a", value: 1 }]);
    expect(removedEdges).toHaveLength(3);
  });
});

import { describe, expect, it } from "vitest";
import { addWildcardCoverageEdges } from "../semp/addWildcardCoverageEdges.js";
import type { SankeyEdge } from "../semp/toSankeyEdges.js";

describe("addWildcardCoverageEdges", () => {
  it("adds an implied edge from a specific topic to an endpoint with a broader wildcard on a different subscription", () => {
    const edges: SankeyEdge[] = [
      { source: "acme/sales/>", target: "Queue: all-sales-q", value: 1 },
      { source: "acme/sales/orders", target: "Topic Endpoint: te-orders", value: 1 },
    ];

    const result = addWildcardCoverageEdges(edges);

    expect(result).toEqual(
      expect.arrayContaining([
        ...edges,
        { source: "acme/sales/orders", target: "Queue: all-sales-q", value: 1 },
      ]),
    );
    expect(result).toHaveLength(3);
  });

  it("does not duplicate an edge that already exists directly", () => {
    const edges: SankeyEdge[] = [
      { source: "acme/sales/>", target: "Queue: all-sales-q", value: 5 },
      { source: "acme/sales/orders", target: "Queue: all-sales-q", value: 3 },
    ];

    expect(addWildcardCoverageEdges(edges)).toEqual(edges);
  });

  it("returns the input unchanged when no subscription is a wildcard", () => {
    const edges: SankeyEdge[] = [
      { source: "acme/sales/orders", target: "Queue: q1", value: 1 },
      { source: "acme/sales/cancellations", target: "Queue: q2", value: 1 },
    ];

    expect(addWildcardCoverageEdges(edges)).toEqual(edges);
  });
});

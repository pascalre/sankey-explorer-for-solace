import { describe, expect, it } from "vitest";
import { addWildcardCoverageEdges } from "./addWildcardCoverageEdges";
import type { SankeyEdge } from "./toSankeyEdges";

describe("addWildcardCoverageEdges", () => {
  it("adds an implied edge from a specific topic to an endpoint with a broader wildcard on a different subscription (the reported bug)", () => {
    const edges: SankeyEdge[] = [
      { source: "acme/sales/>", target: "Queue: all-sales-q", value: 1 },
      { source: "acme/sales/orders", target: "Topic Endpoint: te-orders", value: 1 },
    ];

    const result = addWildcardCoverageEdges(edges);

    expect(result).toEqual(
      expect.arrayContaining([
        ...edges,
        { source: "acme/sales/orders", target: "Queue: all-sales-q", value: 1, implied: true },
      ]),
    );
    expect(result).toHaveLength(3);
  });

  it("does not add anything when no subscription is a wildcard", () => {
    const edges: SankeyEdge[] = [
      { source: "acme/sales/orders", target: "Queue: q1", value: 1 },
      { source: "acme/sales/cancellations", target: "Queue: q2", value: 1 },
    ];

    expect(addWildcardCoverageEdges(edges)).toEqual(edges);
  });

  it("does not add anything when the wildcard doesn't actually cover the other topic", () => {
    const edges: SankeyEdge[] = [
      { source: "acme/support/>", target: "Queue: support-q", value: 1 },
      { source: "acme/sales/orders", target: "Topic Endpoint: te-orders", value: 1 },
    ];

    expect(addWildcardCoverageEdges(edges)).toEqual(edges);
  });

  it("does not duplicate an edge that already exists directly", () => {
    const edges: SankeyEdge[] = [
      { source: "acme/sales/>", target: "Queue: all-sales-q", value: 5 },
      { source: "acme/sales/orders", target: "Queue: all-sales-q", value: 3 },
    ];

    // Both subscriptions already point at the same endpoint directly -
    // nothing new to add, and the existing value must NOT be touched/doubled.
    expect(addWildcardCoverageEdges(edges)).toEqual(edges);
  });

  it("does not add a self-referential edge for a single wildcard subscription", () => {
    const edges: SankeyEdge[] = [{ source: "acme/sales/>", target: "Queue: q1", value: 1 }];

    expect(addWildcardCoverageEdges(edges)).toEqual(edges);
  });

  it("adds one edge per covered endpoint when multiple different endpoints have broader wildcards - including wildcard-covers-wildcard", () => {
    const edges: SankeyEdge[] = [
      { source: "acme/sales/orders", target: "Topic Endpoint: te-orders", value: 1 },
      { source: "acme/sales/>", target: "Queue: q1", value: 1 },
      { source: "acme/>", target: "Queue: q2", value: 1 },
    ];

    const result = addWildcardCoverageEdges(edges);

    expect(result).toEqual(
      expect.arrayContaining([
        ...edges,
        { source: "acme/sales/orders", target: "Queue: q1", value: 1, implied: true },
        { source: "acme/sales/orders", target: "Queue: q2", value: 1, implied: true },
        // "acme/>" (q2) is itself broader than "acme/sales/>" (q1) - q2
        // must also show up wherever q1's own wildcard subscription does.
        { source: "acme/sales/>", target: "Queue: q2", value: 1, implied: true },
      ]),
    );
    expect(result).toHaveLength(6);
  });

  it("does not add a duplicate implied edge when two of the endpoint's own wildcards both cover the same narrower topic", () => {
    const edges: SankeyEdge[] = [
      { source: "acme/sales/orders", target: "Topic Endpoint: te-orders", value: 1 },
      { source: "acme/sales/>", target: "Queue: q1", value: 1 },
      { source: "acme/>", target: "Queue: q1", value: 1 },
    ];

    const result = addWildcardCoverageEdges(edges);

    // Exactly one implied edge to Queue: q1, not two (which would double
    // its value once explodeTopicHierarchy merges by source+target).
    const implied = result.filter(
      (e) => e.source === "acme/sales/orders" && e.target === "Queue: q1",
    );
    expect(implied).toHaveLength(1);
    expect(implied[0]?.value).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { computeSankeyLayout } from "./sankeyLayout";
import type { SankeyEdge } from "./toSankeyEdges";

describe("computeSankeyLayout", () => {
  it("lays out a normal bipartite topic->endpoint graph without throwing", () => {
    const edges: SankeyEdge[] = [
      { source: "orders/created", target: "Queue: orders-q", value: 1 },
      { source: "orders/created", target: "Topic Endpoint: te-orders", value: 1 },
    ];

    expect(() => computeSankeyLayout(edges, 800, 400)).not.toThrow();
  });

  it("does not throw when a topic string collides with an endpoint label (self-loop)", () => {
    // Reproduces the real bug: if a topic string happens to be identical
    // to an endpoint label, the same node becomes source AND target -
    // d3-sankey requires an acyclic graph and otherwise throws
    // "RangeError: Invalid array length" in computeNodeLayers.
    const edges: SankeyEdge[] = [
      { source: "Queue: orders-q", target: "Queue: orders-q", value: 1 },
      { source: "orders/created", target: "Queue: orders-q", value: 1 },
    ];

    expect(() => computeSankeyLayout(edges, 800, 400)).not.toThrow();
  });

  it("returns an empty graph (not a throw) when every edge is stuck in a cycle", () => {
    const edges: SankeyEdge[] = [
      { source: "a", target: "b", value: 1 },
      { source: "b", target: "c", value: 1 },
      { source: "c", target: "a", value: 1 },
    ];

    const graph = computeSankeyLayout(edges, 800, 400);

    expect(graph.nodes).toEqual([]);
    expect(graph.links).toEqual([]);
  });

  it("does not throw on an empty edges array (the actual reported bug)", () => {
    // Reproduces the real crash: SankeyChart ALWAYS calls computeSankeyLayout
    // via useMemo, even when edges=[] (e.g. endpoints with no subscriptions
    // at all) - the "empty" display in the component only comes AFTER the
    // hook and can't prevent the crash.
    expect(() => computeSankeyLayout([], 800, 400)).not.toThrow();
  });

  it("sorts nodes within the same column alphabetically by id, top to bottom", () => {
    const edges: SankeyEdge[] = [
      { source: "acme/sales/order", target: "Queue: order-q", value: 1 },
      { source: "acme/sales/cart", target: "Queue: cart-q", value: 1 },
      { source: "acme/sales/return", target: "Queue: return-q", value: 1 },
    ];

    const graph = computeSankeyLayout(edges, 800, 400);

    // All three topic nodes sit in the same column (depth 0).
    const topicNodes = graph.nodes
      .filter((n) => n.id.startsWith("acme/sales/"))
      .sort((a, b) => (a.y0 ?? 0) - (b.y0 ?? 0));

    expect(topicNodes.map((n) => n.id)).toEqual([
      "acme/sales/cart",
      "acme/sales/order",
      "acme/sales/return",
    ]);
  });

  it("sorts topic nodes by their destination queue name when sortMode is 'queue'", () => {
    // Bewusst so gewählt, dass Topic-alphabetische und Queue-alphabetische
    // Reihenfolge sich WIDERSPRECHEN - sonst würde der Test auch grün sein,
    // ohne dass der Queue-Sort-Modus tatsächlich etwas tut.
    const edges: SankeyEdge[] = [
      { source: "zzz-topic", target: "Queue: Apple", value: 1 },
      { source: "aaa-topic", target: "Queue: Zebra", value: 1 },
    ];

    const graph = computeSankeyLayout(edges, 800, 400, "queue");

    const topicNodes = graph.nodes
      .filter((n) => n.id.endsWith("-topic"))
      .sort((a, b) => (a.y0 ?? 0) - (b.y0 ?? 0));

    // "zzz-topic" feeds Queue: Apple (comes first alphabetically) -> must
    // come first, even though "aaa-topic" < "zzz-topic" by its own name.
    expect(topicNodes.map((n) => n.id)).toEqual(["zzz-topic", "aaa-topic"]);
  });

  it("defaults to topic sort mode when sortMode is omitted", () => {
    const edges: SankeyEdge[] = [
      { source: "b-topic", target: "Queue: Apple", value: 1 },
      { source: "a-topic", target: "Queue: Zebra", value: 1 },
    ];

    const graph = computeSankeyLayout(edges, 800, 400);

    const topicNodes = graph.nodes
      .filter((n) => n.id.endsWith("-topic"))
      .sort((a, b) => (a.y0 ?? 0) - (b.y0 ?? 0));

    // By topic name: "a-topic" before "b-topic", regardless of which queue
    // each one feeds.
    expect(topicNodes.map((n) => n.id)).toEqual(["a-topic", "b-topic"]);
  });

  it("sorts by owner (via the endpointOwners map) when sortMode is 'owner'", () => {
    const edges: SankeyEdge[] = [
      { source: "zzz-topic", target: "Queue: Apple", value: 1 },
      { source: "aaa-topic", target: "Queue: Zebra", value: 1 },
    ];
    const endpointOwners = new Map([
      ["Queue: Apple", "team-a"],
      ["Queue: Zebra", "team-z"],
    ]);

    const graph = computeSankeyLayout(edges, 800, 400, "owner", endpointOwners);

    const topicNodes = graph.nodes
      .filter((n) => n.id.endsWith("-topic"))
      .sort((a, b) => (a.y0 ?? 0) - (b.y0 ?? 0));

    // "zzz-topic" feeds Queue: Apple, owned by "team-a" (comes first
    // alphabetically) -> must come first, even though "aaa-topic" < "zzz-topic".
    expect(topicNodes.map((n) => n.id)).toEqual(["zzz-topic", "aaa-topic"]);
  });

  it("falls back to an empty owner key for endpoints missing from the owners map", () => {
    const edges: SankeyEdge[] = [
      { source: "topic-a", target: "Queue: NoOwner", value: 1 },
      { source: "topic-b", target: "Queue: HasOwner", value: 1 },
    ];
    const endpointOwners = new Map([["Queue: HasOwner", "team-a"]]);

    // Must not throw when an endpoint simply has no known owner.
    expect(() =>
      computeSankeyLayout(edges, 800, 400, "owner", endpointOwners),
    ).not.toThrow();
  });

  it("reserves a horizontal margin so outer-column labels have room and aren't clipped", () => {
    const edges: SankeyEdge[] = [
      { source: "acme", target: "acme/sales", value: 1 },
      { source: "acme/sales", target: "Queue: orders-q", value: 1 },
    ];

    const width = 800;
    const graph = computeSankeyLayout(edges, width, 400);

    const leftmost = Math.min(...graph.nodes.map((n) => n.x0 ?? 0));
    const rightmost = Math.max(...graph.nodes.map((n) => n.x1 ?? 0));

    // Some margin must be reserved on both sides - the diagram must not
    // span the full raw pixel width edge to edge.
    expect(leftmost).toBeGreaterThan(10);
    expect(rightmost).toBeLessThan(width - 10);
  });

  it("grows the right margin to fit a long endpoint label instead of clipping it at a fixed cap", () => {
    const width = 800;
    const shortLabelEdges: SankeyEdge[] = [
      { source: "orders/created", target: "Queue: q1", value: 1 },
    ];
    const longLabelEdges: SankeyEdge[] = [
      {
        source: "orders/created",
        target: "Queue: RDP_to_Mobiles_Extremely_Long_Queue_Name",
        value: 1,
      },
    ];

    const shortGraph = computeSankeyLayout(shortLabelEdges, width, 400);
    const longGraph = computeSankeyLayout(longLabelEdges, width, 400);

    const rightEdgeFor = (graph: typeof shortGraph) =>
      width - Math.max(...graph.nodes.map((n) => n.x1 ?? 0));

    // The reserved space after the rightmost bar must be noticeably bigger
    // when the endpoint label is much longer - a fixed cap would make both
    // the same regardless of label length, which is exactly the reported bug.
    expect(rightEdgeFor(longGraph)).toBeGreaterThan(rightEdgeFor(shortGraph) * 2);
  });

  it("also grows the right margin for a long vpn@host sub-label, even when the endpoint name itself is short", () => {
    const width = 800;
    const edges: SankeyEdge[] = [
      { source: "orders/created", target: "Queue: q1", value: 1 },
    ];

    const withoutVpnHost = computeSankeyLayout(edges, width, 400);
    const withLongVpnHost = computeSankeyLayout(
      edges,
      width,
      400,
      "topic",
      undefined,
      undefined,
      new Map([["Queue: q1", "some-really-long-vpn-name @ broker.example.com:55555"]]),
    );

    const rightEdgeFor = (graph: typeof withoutVpnHost) =>
      width - Math.max(...graph.nodes.map((n) => n.x1 ?? 0));

    expect(rightEdgeFor(withLongVpnHost)).toBeGreaterThan(rightEdgeFor(withoutVpnHost));
  });

  it("sorts by message VPN (via the endpointBrokerLabels map) when sortMode is 'messageVpn'", () => {
    const edges: SankeyEdge[] = [
      { source: "zzz-topic", target: "Queue: Apple", value: 1 },
      { source: "aaa-topic", target: "Queue: Zebra", value: 1 },
    ];
    const endpointBrokerLabels = new Map([
      ["Queue: Apple", "vpn-a"],
      ["Queue: Zebra", "vpn-z"],
    ]);

    const graph = computeSankeyLayout(
      edges,
      800,
      400,
      "messageVpn",
      undefined,
      endpointBrokerLabels,
    );

    const topicNodes = graph.nodes
      .filter((n) => n.id.endsWith("-topic"))
      .sort((a, b) => (a.y0 ?? 0) - (b.y0 ?? 0));

    // "zzz-topic" feeds Queue: Apple, on "vpn-a" (comes first alphabetically)
    // -> must come first, even though "aaa-topic" < "zzz-topic" by name.
    expect(topicNodes.map((n) => n.id)).toEqual(["zzz-topic", "aaa-topic"]);
  });

  it("does not throw for sortMode 'crossing' and produces a fully laid-out graph", () => {
    const edges: SankeyEdge[] = [
      { source: "s1", target: "Queue: t3", value: 1 },
      { source: "s2", target: "Queue: t1", value: 1 },
      { source: "s3", target: "Queue: t2", value: 1 },
    ];

    const graph = computeSankeyLayout(edges, 800, 400, "crossing");

    expect(graph.nodes).toHaveLength(6);
    for (const node of graph.nodes) {
      expect(node.x0).toBeDefined();
      expect(node.y0).toBeDefined();
    }
  });

  it("'crossing' mode does not just fall back to alphabetical order for a deliberately crossing-heavy layout", () => {
    // s1->t3, s2->t1, s3->t2: alphabetical order on both sides (s1,s2,s3 /
    // t1,t2,t3) crosses every line. A real crossing-minimizing layout
    // should reorder at least one side away from plain alphabetical.
    //
    // Empirically (verified by running this): d3-sankey's crossing
    // minimizer keeps the SOURCE column in input order (sources have no
    // incoming links to compute a barycenter from) and reorders the
    // TARGET column instead - here to t3,t1,t2, perfectly matching each
    // source across with zero crossings.
    const edges: SankeyEdge[] = [
      { source: "s1", target: "Queue: t3", value: 1 },
      { source: "s2", target: "Queue: t1", value: 1 },
      { source: "s3", target: "Queue: t2", value: 1 },
    ];

    const targetOrderFor = (mode: "topic" | "crossing") => {
      const graph = computeSankeyLayout(edges, 800, 400, mode);
      return graph.nodes
        .filter((n) => n.id.startsWith("Queue:"))
        .sort((a, b) => (a.y0 ?? 0) - (b.y0 ?? 0))
        .map((n) => n.id);
    };

    expect(targetOrderFor("topic")).toEqual(["Queue: t1", "Queue: t2", "Queue: t3"]);
    expect(targetOrderFor("crossing")).toEqual(["Queue: t3", "Queue: t1", "Queue: t2"]);
  });
});

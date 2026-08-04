import type { SankeyEdge } from "./toSankeyEdges";

/**
 * d3-sankey requires an acyclic graph (see the comment in sankeyLayout.ts).
 * In our bipartite topic->endpoint model, a "cycle" can only arise from a
 * name collision (a topic string is identical to an endpoint label, e.g.
 * because a topic happens to be named "Queue: orders-q").
 *
 * Kahn's algorithm: topologically sortable edges are kept; anything stuck
 * in a cycle gets removed and returned for diagnostics.
 */
export function removeCycles(edges: SankeyEdge[]): {
  acyclicEdges: SankeyEdge[];
  removedEdges: SankeyEdge[];
} {
  const nodeIds = new Set<string>();
  for (const e of edges) {
    nodeIds.add(e.source);
    nodeIds.add(e.target);
  }

  const outgoing = new Map<string, SankeyEdge[]>();
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) inDegree.set(id, 0);
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const queue: string[] = [...nodeIds].filter((id) => inDegree.get(id) === 0);
  const acyclicEdges: SankeyEdge[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const edge of outgoing.get(id) ?? []) {
      acyclicEdges.push(edge);
      const remaining = (inDegree.get(edge.target) ?? 0) - 1;
      inDegree.set(edge.target, remaining);
      if (remaining === 0) queue.push(edge.target);
    }
  }

  const keptSet = new Set(acyclicEdges);
  const removedEdges = edges.filter((e) => !keptSet.has(e));

  return { acyclicEdges, removedEdges };
}

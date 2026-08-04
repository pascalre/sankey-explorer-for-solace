import type { SankeyEdge } from "./toSankeyEdges";

function buildAdjacency(edges: SankeyEdge[]): {
  outgoing: Map<string, string[]>;
  incoming: Map<string, string[]>;
} {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source)!.push(edge.target);
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target)!.push(edge.source);
  }
  return { outgoing, incoming };
}

function collectReachable(start: string, adjacency: Map<string, string[]>): Set<string> {
  const visited = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return visited;
}

/**
 * Reduces the graph to the part connected to `selectedNodeId`: all
 * ancestors (the path leading there, e.g. the topic hierarchy up to the
 * root) AND all descendants (everything reachable from there, e.g. the
 * queues/topic-endpoints that receive this subscription).
 *
 * This covers all three UI interactions with the same logic:
 * - Click/hover a queue (has no outgoing edges) -> only ancestors come
 *   back = "which subscriptions land here".
 * - Click/hover a topic/segment -> ancestors (its place in the tree) AND
 *   descendants (which queues/topic-endpoints it reaches).
 * - Click/hover the connecting LINK between two levels -> the caller
 *   passes that link's TARGET node id here. In a tree (every node has
 *   exactly one parent), ancestors-of-target already equals
 *   ancestors-of-source + source itself, so this gives the exact same
 *   result as hovering/clicking the node the link points into - by
 *   construction, not by coincidence, which is what guarantees hovering a
 *   connector and hovering the block/text it leads to are always identical.
 */
export function filterToRelevantSubgraph(
  edges: SankeyEdge[],
  selectedNodeId: string,
): SankeyEdge[] {
  const nodeExists = edges.some(
    (edge) => edge.source === selectedNodeId || edge.target === selectedNodeId,
  );
  if (!nodeExists) return [];

  const { outgoing, incoming } = buildAdjacency(edges);
  const descendants = collectReachable(selectedNodeId, outgoing);
  const ancestors = collectReachable(selectedNodeId, incoming);
  const relevantNodes = new Set([...descendants, ...ancestors]);

  return edges.filter(
    (edge) => relevantNodes.has(edge.source) && relevantNodes.has(edge.target),
  );
}

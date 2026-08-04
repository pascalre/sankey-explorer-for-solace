import type { SankeyEdge } from "./toSankeyEdges";

/**
 * For every node, computes a sort key derived from the endpoint(s) it
 * ultimately reaches: an endpoint (a sink - no outgoing edges) uses
 * `endpointKey(id)` (defaults to its own id, i.e. "sort by queue name").
 * A topic node uses the alphabetically smallest key among the endpoints
 * reachable via its outgoing edges (recursively). This lets topic branches
 * that ultimately feed the same queue - or the same owner, if `endpointKey`
 * looks that up - cluster together when sorted, instead of by their own
 * topic string.
 *
 * Expects an already-acyclic edge list (run removeCycles first) - a real
 * cycle would make "reachable endpoint" ill-defined and this function
 * would recurse forever.
 */
export function buildQueueSortKeys(
  edges: SankeyEdge[],
  endpointKey: (endpointId: string) => string = (id) => id,
): Map<string, string> {
  const outgoing = new Map<string, string[]>();
  const nodeIds = new Set<string>();
  for (const edge of edges) {
    nodeIds.add(edge.source);
    nodeIds.add(edge.target);
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source)!.push(edge.target);
  }

  const memo = new Map<string, string>();

  function keyFor(id: string): string {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;

    const children = outgoing.get(id);
    if (!children || children.length === 0) {
      // Sink node - it IS an endpoint.
      const key = endpointKey(id);
      memo.set(id, key);
      return key;
    }

    let smallest: string | null = null;
    for (const child of children) {
      const childKey = keyFor(child);
      if (smallest === null || childKey < smallest) smallest = childKey;
    }
    memo.set(id, smallest!);
    return smallest!;
  }

  for (const id of nodeIds) keyFor(id);
  return memo;
}

import type { SankeyEdge } from "./toSankeyEdges";

/**
 * Splits topic strings along "/" into a chain of prefix nodes, so the
 * hierarchy is visible in the Sankey instead of a single blob per full
 * topic string.
 *
 * "acme/sales/orders/>" becomes a chain:
 *   acme -> acme/sales -> acme/sales/orders -> acme/sales/orders/> -> Endpoint
 *
 * Nodes are identified by their full prefix string - identical prefixes
 * from different topics automatically merge into the same node, and their
 * values get summed (making fan-out/fan-in visible).
 */
export function explodeTopicHierarchy(edges: SankeyEdge[]): SankeyEdge[] {
  const merged = new Map<string, SankeyEdge>();

  function addOrMerge(source: string, target: string, value: number): void {
    const key = `${source}\u0000${target}`;
    const existing = merged.get(key);
    if (existing) {
      existing.value += value;
    } else {
      merged.set(key, { source, target, value });
    }
  }

  for (const edge of edges) {
    const segments = edge.source.split("/").filter((s) => s.length > 0);

    if (segments.length === 0) {
      // Empty/slash-only topic - keep the original edge unchanged instead
      // of silently swallowing it.
      addOrMerge(edge.source, edge.target, edge.value);
      continue;
    }

    let prefix = "";
    let previous: string | null = null;
    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      if (previous !== null) {
        addOrMerge(previous, prefix, edge.value);
      }
      previous = prefix;
    }
    // previous is now the full topic string (the last prefix) -> endpoint.
    addOrMerge(previous!, edge.target, edge.value);
  }

  return [...merged.values()];
}

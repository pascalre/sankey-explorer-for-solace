import type { SankeyEdge } from "./toSankeyEdges.js";
import { subscriptionCovers } from "./subscriptionCovers.js";

function hasWildcard(topic: string): boolean {
  return topic.includes("*") || topic.includes(">");
}

function edgeKey(source: string, target: string): string {
  return JSON.stringify([source, target]);
}

/**
 * Solace wildcard subscriptions mean a broader subscription silently also
 * receives everything a narrower, more specific subscription on a
 * DIFFERENT endpoint would receive - e.g. a queue subscribed to
 * "acme/sales/>" also gets every message that reaches a topic-endpoint
 * subscribed to the completely separate string "acme/sales/orders".
 *
 * Exact copy of frontend/src/lib/addWildcardCoverageEdges.ts - see that
 * file's doc comment. Kept here too so /api/sankey-edges (the flat feed
 * used by Grafana - see README "Grafana path") reports the same picture
 * as the SPA's own diagram, not just the SPA.
 */
export function addWildcardCoverageEdges(edges: SankeyEdge[]): SankeyEdge[] {
  const existingKeys = new Set(edges.map((e) => edgeKey(e.source, e.target)));
  const extra = new Map<string, SankeyEdge>();

  for (const broad of edges) {
    if (!hasWildcard(broad.source)) continue;

    for (const narrow of edges) {
      if (narrow.source === broad.source || narrow.target === broad.target) continue;
      if (!subscriptionCovers(broad.source, narrow.source)) continue;

      const key = edgeKey(narrow.source, broad.target);
      if (existingKeys.has(key) || extra.has(key)) continue;

      extra.set(key, { source: narrow.source, target: broad.target, value: narrow.value });
    }
  }

  return extra.size > 0 ? [...edges, ...extra.values()] : edges;
}

import type { SankeyEdge } from "./toSankeyEdges";
import { subscriptionCovers } from "./subscriptionCovers";

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
 * Without this, clicking the "acme/sales/orders" leaf node in the diagram
 * only shows whichever endpoint(s) subscribed to that EXACT string,
 * silently omitting any endpoint that also reaches it via a broader
 * wildcard on a different subscription.
 *
 * Adds one extra edge per (narrower topic -> broader endpoint) pair found,
 * so the base diagram and filterToRelevantSubgraph both pick it up for
 * free, without either needing to know anything about wildcards
 * themselves. Call this BEFORE explodeTopicHierarchy - it needs the full,
 * un-exploded subscription strings to compare.
 */
export function addWildcardCoverageEdges(edges: SankeyEdge[]): SankeyEdge[] {
  const existingKeys = new Set(edges.map((e) => edgeKey(e.source, e.target)));
  const extra = new Map<string, SankeyEdge>();

  for (const broad of edges) {
    if (!hasWildcard(broad.source)) continue;

    for (const narrow of edges) {
      // Same subscription string, or already the same endpoint - nothing
      // new to add (either not a distinct pair, or already connected).
      if (narrow.source === broad.source || narrow.target === broad.target) continue;
      if (!subscriptionCovers(broad.source, narrow.source)) continue;

      const key = edgeKey(narrow.source, broad.target);
      // Skip if this exact (topic, endpoint) pair already exists - either
      // as a real edge, or already added via a different wildcard -
      // otherwise later merging (explodeTopicHierarchy) would double-count
      // its value.
      if (existingKeys.has(key) || extra.has(key)) continue;

      extra.set(key, {
        source: narrow.source,
        target: broad.target,
        value: narrow.value,
        implied: true,
      });
    }
  }

  return extra.size > 0 ? [...edges, ...extra.values()] : edges;
}

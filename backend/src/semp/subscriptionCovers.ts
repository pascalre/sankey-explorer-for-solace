function splitSegments(topic: string): string[] {
  return topic.split("/").filter((s) => s.length > 0);
}

/**
 * True if EVERY concrete topic that matches `narrower` (a subscription
 * filter - itself possibly wildcarded) is guaranteed to also match
 * `broader`. In other words: an endpoint subscribed to `broader`
 * necessarily also receives every message that would be delivered to
 * `narrower`, even though they're different subscription strings.
 *
 * Solace wildcard rules (see docs.solace.com - Topic Matching):
 * - `*` matches exactly one topic level.
 * - `>` matches one or more remaining levels, and must be the last segment.
 *
 * Kept as an exact copy of frontend/src/lib/subscriptionCovers.ts - see
 * that file's doc comment for the "why" (this whole module mirrors the
 * frontend's addWildcardCoverageEdges.ts so the flat /api/sankey-edges
 * feed used by Grafana - see README "Grafana path" - stays consistent
 * with what the SPA's own diagram shows).
 */
export function subscriptionCovers(broader: string, narrower: string): boolean {
  const b = splitSegments(broader);
  const n = splitSegments(narrower);

  for (let i = 0; i < b.length; i++) {
    if (b[i] === ">") {
      return n.length > i;
    }
    if (i >= n.length) return false;
    if (n[i] === ">") {
      return false;
    }
    if (b[i] !== "*" && b[i] !== n[i]) return false;
  }

  return b.length === n.length;
}

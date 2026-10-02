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
 * This is the relationship the Sankey diagram is otherwise blind to: two
 * different subscription strings (e.g. "acme/sales/>" on one queue,
 * "acme/sales/orders" on another) are exploded into two completely
 * separate hierarchy chains, even though every message reaching the
 * second is - by the wildcard - also guaranteed to reach the first.
 */
export function subscriptionCovers(broader: string, narrower: string): boolean {
  const b = splitSegments(broader);
  const n = splitSegments(narrower);

  for (let i = 0; i < b.length; i++) {
    if (b[i] === ">") {
      // Matches everything from here on - but ">" itself requires at
      // least one more level, so narrower must actually reach this depth.
      return n.length > i;
    }
    if (i >= n.length) return false; // broader needs a level narrower doesn't have
    if (n[i] === ">") {
      // narrower's own tail is unbounded here - a finite (non-">")
      // broader segment at this position can't cover ALL topics narrower
      // matches (which include arbitrarily deeper ones).
      return false;
    }
    if (b[i] !== "*" && b[i] !== n[i]) return false; // literal mismatch
  }

  // broader fully consumed without a trailing ">" - only an exact-length
  // match counts (an exact filter like "acme/sales" never covers anything
  // deeper, e.g. "acme/sales/orders").
  return b.length === n.length;
}

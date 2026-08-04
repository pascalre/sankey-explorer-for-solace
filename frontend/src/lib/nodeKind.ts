/** Endpoint nodes (the rightmost column) are labeled "Queue: X" or "Topic Endpoint: X". */
export function isEndpointNode(id: string): boolean {
  return id.startsWith("Queue:") || id.startsWith("Topic Endpoint:");
}

/**
 * Human-readable endpoint type for the sub-label under an endpoint's name
 * (e.g. "Queue"). Null for non-endpoint (topic hierarchy) ids.
 *
 * Note: "direct subscriber" isn't a data source this app fetches yet (a
 * separate SEMP query against client subscriptions, deliberately deferred
 * early on) - this only covers the two types we actually query today.
 */
export function endpointTypeLabel(id: string): string | null {
  if (id.startsWith("Queue:")) return "Queue";
  if (id.startsWith("Topic Endpoint:")) return "Topic Endpoint";
  return null;
}

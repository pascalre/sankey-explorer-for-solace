/**
 * Endpoint nodes (the rightmost column) are labeled "Queue: X",
 * "Topic Endpoint: X", or "Direct Subscriber: X".
 */
export function isEndpointNode(id: string): boolean {
  return (
    id.startsWith("Queue:") ||
    id.startsWith("Topic Endpoint:") ||
    id.startsWith("Direct Subscriber:")
  );
}

/**
 * Human-readable endpoint type for the sub-label under an endpoint's name
 * (e.g. "Queue"). Null for non-endpoint (topic hierarchy) ids.
 */
export function endpointTypeLabel(id: string): string | null {
  if (id.startsWith("Queue:")) return "Queue";
  if (id.startsWith("Topic Endpoint:")) return "Topic Endpoint";
  if (id.startsWith("Direct Subscriber:")) return "Direct Subscriber";
  return null;
}

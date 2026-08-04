import type { EndpointInfo } from "../types";

export interface SankeyEdge {
  source: string;
  target: string;
  value: number;
}

/** True once 2+ distinct brokers appear in the dataset - see endpointLabel. */
export function shouldShowBrokerSuffix(endpoints: Pick<EndpointInfo, "brokerLabel">[]): boolean {
  return new Set(endpoints.map((e) => e.brokerLabel)).size > 1;
}

/**
 * Human-readable node label, unique per queue/topic-endpoint. Appends the
 * broker label (e.g. "Queue: orders-q (EU-Broker)") ONLY when multiple
 * distinct brokers are present in this dataset - with a single broker the
 * suffix would just be clutter, but with several it's required for
 * correctness: two different brokers can easily have same-named queues,
 * and without this they'd incorrectly merge into one Sankey node.
 */
export function endpointLabel(
  endpoint: Pick<EndpointInfo, "type" | "name" | "brokerLabel">,
  showBrokerSuffix: boolean,
): string {
  const typeLabel = endpoint.type === "queue" ? "Queue" : "Topic Endpoint";
  const base = `${typeLabel}: ${endpoint.name}`;
  return showBrokerSuffix ? `${base} (${endpoint.brokerLabel})` : base;
}

/**
 * One edge per (topic, endpoint) pair. If an endpoint has the same topic
 * subscription listed twice (not really expected broker-side), duplicates
 * get merged into one edge with value>1 instead of separate value-1 edges.
 */
export function toSankeyEdges(endpoints: EndpointInfo[]): SankeyEdge[] {
  const counts = new Map<string, SankeyEdge>();
  const showBrokerSuffix = shouldShowBrokerSuffix(endpoints);

  for (const endpoint of endpoints) {
    const target = endpointLabel(endpoint, showBrokerSuffix);
    for (const topic of endpoint.subscriptions) {
      const key = `${topic}\u0000${target}`;
      const existing = counts.get(key);
      if (existing) {
        existing.value += 1;
      } else {
        counts.set(key, { source: topic, target, value: 1 });
      }
    }
  }

  return [...counts.values()];
}

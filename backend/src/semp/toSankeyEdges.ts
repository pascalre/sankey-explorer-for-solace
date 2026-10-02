import type { EndpointInfo } from "./types.js";
import { addWildcardCoverageEdges } from "./addWildcardCoverageEdges.js";

export interface SankeyEdge {
  source: string;
  target: string;
  value: number;
}

const TYPE_LABELS: Record<EndpointInfo["type"], string> = {
  queue: "Queue",
  "topic-endpoint": "Topic Endpoint",
  "direct-subscriber": "Direct Subscriber",
};

/**
 * Human-readable node label, unique per queue/topic-endpoint/direct
 * subscriber. Appends the broker label (e.g. "Queue: orders-q
 * (EU-Broker)") ONLY when multiple distinct brokers are present in this
 * dataset - with a single broker the suffix would just be clutter, but
 * with several it's required for correctness: two different brokers can
 * easily have same-named queues (or clients), and without this they'd
 * incorrectly merge into one Sankey node.
 */
export function endpointLabel(
  endpoint: Pick<EndpointInfo, "type" | "name" | "brokerLabel">,
  showBrokerSuffix: boolean,
): string {
  const base = `${TYPE_LABELS[endpoint.type]}: ${endpoint.name}`;
  return showBrokerSuffix ? `${base} (${endpoint.brokerLabel})` : base;
}

/**
 * One edge per (topic, endpoint) pair. If an endpoint has the same topic
 * subscription listed twice (not really expected broker-side), duplicates
 * get merged into one edge with value>1 instead of separate value-1 edges.
 *
 * Also adds the wildcard-coverage edges addWildcardCoverageEdges()
 * computes (e.g. a queue subscribed to "acme/sales/>" implicitly also
 * receives whatever reaches a separate "acme/sales/orders" subscription
 * elsewhere) - without this, a Grafana Sankey panel built on this data
 * would silently miss that connection, same as the SPA's own diagram did
 * before that fix.
 */
export function toSankeyEdges(endpoints: EndpointInfo[]): SankeyEdge[] {
  const counts = new Map<string, SankeyEdge>();
  const showBrokerSuffix = new Set(endpoints.map((e) => e.brokerLabel)).size > 1;

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

  return addWildcardCoverageEdges([...counts.values()]);
}

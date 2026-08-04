import type { EndpointInfo } from "../types";
import { endpointLabel, shouldShowBrokerSuffix } from "./toSankeyEdges";

/**
 * The Sankey pipeline flattens everything down to {source, target, value}
 * edges keyed by plain label strings, which loses per-endpoint metadata
 * (owner, broker label, vpn/host, ...). This builds a side lookup (Sankey
 * node id -> whatever `getValue` extracts) so SankeyChart can still show
 * and sort by that metadata without threading it through the edge model
 * itself. Shared by buildEndpointOwners, buildEndpointBrokerLabels, and
 * buildEndpointVpnHost - they differ only in what they extract.
 */
export function buildEndpointLabelMap<T>(
  endpoints: EndpointInfo[],
  getValue: (endpoint: EndpointInfo) => T | undefined,
): Map<string, T> {
  const showBrokerSuffix = shouldShowBrokerSuffix(endpoints);
  const map = new Map<string, T>();

  for (const endpoint of endpoints) {
    const value = getValue(endpoint);
    if (value !== undefined) {
      map.set(endpointLabel(endpoint, showBrokerSuffix), value);
    }
  }

  return map;
}

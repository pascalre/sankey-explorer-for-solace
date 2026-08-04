import type { EndpointInfo } from "../types";
import { buildEndpointLabelMap } from "./buildEndpointLabelMap";

/**
 * Sankey node label -> which message VPN (broker connection) it came from.
 * Used for the "Message VPN" sort mode - lets topic branches that
 * ultimately feed the same message VPN cluster together, the same way
 * "Owner" sort mode clusters by owner.
 */
export function buildEndpointBrokerLabels(endpoints: EndpointInfo[]): Map<string, string> {
  return buildEndpointLabelMap(endpoints, (e) => e.brokerLabel);
}

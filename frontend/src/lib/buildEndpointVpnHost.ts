import type { EndpointInfo } from "../types";
import { buildEndpointLabelMap } from "./buildEndpointLabelMap";

/**
 * Sankey node label -> "{vpn} at {host}" (e.g. "default at localhost:8080").
 * Uses the actual VPN name (not the possibly-custom broker label) since
 * this is meant to show WHERE the endpoint physically lives, independent
 * of whatever friendly name the user gave the connection.
 */
export function buildEndpointVpnHost(endpoints: EndpointInfo[]): Map<string, string> {
  return buildEndpointLabelMap(endpoints, (e) => `${e.vpn} at ${e.brokerHost}`);
}

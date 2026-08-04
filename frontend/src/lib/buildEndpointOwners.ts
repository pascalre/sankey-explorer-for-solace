import type { EndpointInfo } from "../types";
import { buildEndpointLabelMap } from "./buildEndpointLabelMap";

/** Sankey node label -> owner, for endpoints that report one. */
export function buildEndpointOwners(endpoints: EndpointInfo[]): Map<string, string> {
  return buildEndpointLabelMap(endpoints, (e) => e.owner);
}

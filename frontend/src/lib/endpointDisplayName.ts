import { isEndpointNode } from "./nodeKind";

const TYPE_PREFIXES = ["Queue: ", "Topic Endpoint: ", "Direct Subscriber: "];

/**
 * Strips the type prefix ("Queue: "/"Topic Endpoint: ") and any trailing
 * broker-disambiguation suffix ("(EU-Broker)") from an endpoint node id,
 * leaving just the bare name for display. The full id is still what's
 * used internally for graph identity, sorting, and filtering - this is
 * display-only, the same separation nodeDisplayLabel makes for topic
 * hierarchy nodes.
 */
export function endpointDisplayName(id: string): string {
  if (!isEndpointNode(id)) return id;

  let name = id;
  for (const prefix of TYPE_PREFIXES) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length);
      break;
    }
  }

  return name.replace(/ \([^)]*\)$/, "");
}

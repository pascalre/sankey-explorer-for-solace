export type EndpointType = "queue" | "topic-endpoint" | "direct-subscriber";

export interface EndpointInfo {
  type: EndpointType;
  /**
   * The queue/topic-endpoint name, or - for type "direct-subscriber" - the
   * connected client's name. A "direct subscriber" is a client consuming
   * directly off its own topic subscriptions, with no durable queue or
   * topic-endpoint in between (SEMP v1 "show client ... subscriptions").
   */
  name: string;
  vpn: string;
  /** Topic subscriptions mapped to this endpoint. */
  subscriptions: string[];
  /**
   * The client-username SEMP reports as the endpoint's owner, if any.
   * Undefined if the broker reply has no <owner> element (unverified for
   * topic-endpoints specifically - queues reliably have this, but whether
   * topic-endpoints do too needs checking against a real broker). Not
   * applicable to direct subscribers - always undefined for those.
   */
  owner?: string;
  /**
   * Which broker connection this endpoint came from (user-provided label,
   * defaulting to the VPN name if none given). Always set - a session can
   * have multiple broker connections (e.g. a mesh of brokers), and this is
   * how the frontend disambiguates same-named endpoints across brokers and
   * colors endpoints by broker.
   */
  brokerLabel: string;
  /** Host (and port, if non-default) parsed from the broker connection's baseUrl, e.g. "localhost:8080". */
  brokerHost: string;
}

export interface SempClientOptions {
  baseUrl: string;
  username: string;
  password: string;
  /** Minimum gap between requests in ms (Solace recommends <=10 req/s). */
  minRequestIntervalMs: number;
}

/**
 * What a single broker query can produce on its own - it doesn't know
 * which broker connection it came from (that's a multi-connection concept
 * the route layer adds by stamping `brokerLabel`/`brokerHost` onto these
 * afterward).
 */
export type RawEndpointInfo = Omit<EndpointInfo, "brokerLabel" | "brokerHost">;

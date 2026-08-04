export type EndpointType = "queue" | "topic-endpoint";

export interface EndpointInfo {
  type: EndpointType;
  name: string;
  vpn: string;
  subscriptions: string[];
  owner?: string;
  /** Which broker connection this endpoint came from (see BrokerConnectionStatus.label). */
  brokerLabel: string;
  /** Host (and port, if non-default) of the broker connection, e.g. "localhost:8080". */
  brokerHost: string;
}

export interface BrokerConnectionStatus {
  id: string;
  label: string;
  vpn: string;
  baseUrl: string;
  connectedAt: number;
}

export interface SessionInfo {
  authRequired: boolean;
  authenticated: boolean;
  /** A session can have multiple broker connections at once (e.g. a mesh of brokers). */
  brokers: BrokerConnectionStatus[];
}

export interface ApiError {
  error: string;
}

import { randomUUID } from "node:crypto";
import { SempV2Client } from "./client.js";
import { config } from "../config.js";

export interface BrokerConnectionInput {
  baseUrl: string; // e.g. http://broker-host:8080 - the broker's SEMP management root
  vpn: string;
  username: string;
  password: string;
  /** User-friendly name for this broker (e.g. "EU-Broker"). Defaults to the VPN name if omitted. */
  label?: string;
}

export interface BrokerConnectionStatus {
  id: string;
  label: string;
  vpn: string;
  baseUrl: string;
  connectedAt: number;
}

interface StoredConnection extends BrokerConnectionStatus {
  client: SempV2Client;
}

/**
 * MVP: in-memory, single Node process. Sufficient for "1 instance per
 * customer/workshop". Deferred, not forgotten (promotion trigger: multiple
 * process instances behind a load balancer): swap for an external store
 * (Redis), same interface signature.
 *
 * A session can hold MULTIPLE broker connections (e.g. a customer with
 * several brokers meshed together, wanting one combined view) - keyed by a
 * generated connection id, not overwritten by subsequent connects.
 */
const connections = new Map<string, Map<string, StoredConnection>>();

function toStatus(conn: StoredConnection): BrokerConnectionStatus {
  return { id: conn.id, label: conn.label, vpn: conn.vpn, baseUrl: conn.baseUrl, connectedAt: conn.connectedAt };
}

export function addBrokerConnection(
  sessionId: string,
  input: BrokerConnectionInput,
): BrokerConnectionStatus {
  const id = randomUUID();
  const conn: StoredConnection = {
    id,
    label: input.label?.trim() || input.vpn,
    vpn: input.vpn,
    baseUrl: input.baseUrl,
    connectedAt: Date.now(),
    client: new SempV2Client({
      baseUrl: input.baseUrl,
      username: input.username,
      password: input.password,
      minRequestIntervalMs: config.sempMinRequestIntervalMs,
    }),
  };

  const sessionConnections = connections.get(sessionId) ?? new Map();
  sessionConnections.set(id, conn);
  connections.set(sessionId, sessionConnections);

  return toStatus(conn);
}

export function removeBrokerConnection(sessionId: string, connectionId: string): boolean {
  return connections.get(sessionId)?.delete(connectionId) ?? false;
}

export function clearBrokerConnections(sessionId: string): void {
  connections.delete(sessionId);
}

export function listBrokerConnections(sessionId: string): StoredConnection[] {
  return [...(connections.get(sessionId)?.values() ?? [])];
}

/** For the "connected?" indicator in the UI - NEVER returns credentials. */
export function getBrokerConnectionsStatus(sessionId: string): BrokerConnectionStatus[] {
  return listBrokerConnections(sessionId).map(toStatus);
}

/**
 * Extracts a display-friendly host (with port, if non-default) from a
 * connection's baseUrl, e.g. "http://localhost:8080" -> "localhost:8080".
 * Used for the "vpn at host" sub-label shown per endpoint when multiple
 * message VPNs are connected. Falls back to the raw baseUrl on parse
 * failure - shouldn't happen since it was already validated as a URL at
 * connect time, but this is display code, not worth throwing over.
 */
export function parseHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

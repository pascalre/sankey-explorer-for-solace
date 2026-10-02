import { SempV2Client } from "./client.js";
import { parseHost } from "./connectionStore.js";
import type { EndpointInfo, RawEndpointInfo } from "./types.js";

/**
 * SEMP v2 Monitor API shapes used here - confirmed against Solace's own
 * docs/community examples for queues and clients:
 *
 *   GET /msgVpns/{vpn}/queues                             -> { queueName, owner, ... }
 *   GET /msgVpns/{vpn}/queues/{queueName}/subscriptions    -> { subscriptionTopic }
 *   GET /msgVpns/{vpn}/clients                             -> { clientName, ... }
 *   GET /msgVpns/{vpn}/clients/{clientName}/subscriptions  -> { subscriptionTopic }
 *
 * UNVERIFIED against a real broker: topic-endpoints. Queues and clients
 * both expose their topic subscription(s) via a nested ".../subscriptions"
 * sub-resource (confirmed above) - topic-endpoints are assumed to follow
 * the exact same pattern:
 *
 *   GET /msgVpns/{vpn}/topicEndpoints                            -> { topicEndpointName, owner, ... }
 *   GET /msgVpns/{vpn}/topicEndpoints/{name}/subscriptions        -> { subscriptionTopic }
 *
 * If your broker responds differently (e.g. 404 on that sub-resource, or
 * the topic comes back as a field directly on the topic-endpoint object
 * instead), touch ONLY this file - the rest of the app only knows
 * `EndpointInfo[]` and stays unaffected.
 *
 * Note on request volume: unlike SEMP v1 (whose "show queue *" bulk reply
 * could embed a <subscriptions/> modifier directly), SEMP v2's REST model
 * has no way to embed a sub-collection into a parent list reply - so this
 * fetches the object list first, then every object's own subscriptions in
 * parallel. Fine at workshop/demo scale; a VPN with thousands of queues or
 * connected clients would want a concurrency limit added here.
 */

interface SempQueueObject {
  queueName: string;
  owner?: string;
}

interface SempTopicEndpointObject {
  topicEndpointName: string;
  owner?: string;
}

interface SempClientObject {
  clientName: string;
}

interface SempSubscriptionObject {
  subscriptionTopic: string;
}

async function fetchSubscriptionTopics(
  client: SempV2Client,
  vpn: string,
  objectCollection: "queues" | "topicEndpoints" | "clients",
  objectName: string,
): Promise<string[]> {
  const subscriptions = await client.getVpnCollection<SempSubscriptionObject>(
    vpn,
    `/${objectCollection}/${encodeURIComponent(objectName)}/subscriptions`,
  );
  return subscriptions.map((s) => s.subscriptionTopic);
}

export async function fetchQueues(
  client: SempV2Client,
  vpn: string,
): Promise<RawEndpointInfo[]> {
  const queues = await client.getVpnCollection<SempQueueObject>(vpn, "/queues");

  return Promise.all(
    queues.map(
      async (q): Promise<RawEndpointInfo> => ({
        type: "queue",
        name: q.queueName,
        vpn,
        subscriptions: await fetchSubscriptionTopics(client, vpn, "queues", q.queueName),
        owner: q.owner || undefined,
      }),
    ),
  );
}

export async function fetchTopicEndpoints(
  client: SempV2Client,
  vpn: string,
): Promise<RawEndpointInfo[]> {
  const topicEndpoints = await client.getVpnCollection<SempTopicEndpointObject>(
    vpn,
    "/topicEndpoints",
  );

  return Promise.all(
    topicEndpoints.map(
      async (te): Promise<RawEndpointInfo> => ({
        type: "topic-endpoint",
        name: te.topicEndpointName,
        vpn,
        subscriptions: await fetchSubscriptionTopics(
          client,
          vpn,
          "topicEndpoints",
          te.topicEndpointName,
        ),
        owner: te.owner || undefined,
      }),
    ),
  );
}

/**
 * "Direct subscribers": clients consuming directly off their own topic
 * subscriptions, with no durable queue or topic-endpoint in between. Only
 * clients that actually have at least one direct subscription count -
 * "GET .../clients" also returns clients with none (e.g. ones only
 * consuming via a queue), which would otherwise show up as disconnected,
 * edge-less nodes.
 */
export async function fetchDirectSubscribers(
  client: SempV2Client,
  vpn: string,
): Promise<RawEndpointInfo[]> {
  const clients = await client.getVpnCollection<SempClientObject>(vpn, "/clients");

  const withSubscriptions = await Promise.all(
    clients.map(async (c) => ({
      name: c.clientName,
      subscriptions: await fetchSubscriptionTopics(client, vpn, "clients", c.clientName),
    })),
  );

  return withSubscriptions
    .filter((c) => c.subscriptions.length > 0)
    .map(
      (c): RawEndpointInfo => ({
        type: "direct-subscriber",
        name: c.name,
        vpn,
        subscriptions: c.subscriptions,
      }),
    );
}

export async function fetchAllEndpoints(
  client: SempV2Client,
  vpn: string,
): Promise<RawEndpointInfo[]> {
  const [queues, topicEndpoints, directSubscribers] = await Promise.all([
    fetchQueues(client, vpn),
    fetchTopicEndpoints(client, vpn),
    fetchDirectSubscribers(client, vpn),
  ]);

  return [...queues, ...topicEndpoints, ...directSubscribers];
}

/**
 * What both routes/endpoints.ts and routes/sankey.ts need from a broker
 * connection to query it - a structural subset of connectionStore.ts's
 * (unexported) StoredConnection, so listBrokerConnections()'s result can be
 * passed straight in without any adapting.
 */
export interface FetchableBrokerConnection {
  client: SempV2Client;
  vpn: string;
  label: string;
  baseUrl: string;
}

/**
 * Queries every given broker connection in parallel and stamps each
 * resulting endpoint with which connection it came from (brokerLabel/
 * brokerHost) - the combined-multi-broker fetch both /api/endpoints and
 * /api/sankey-edges need, extracted here since they were doing the exact
 * same thing.
 */
export async function fetchEndpointsAcrossConnections(
  connections: FetchableBrokerConnection[],
): Promise<EndpointInfo[]> {
  const perConnection = await Promise.all(
    connections.map(async (conn): Promise<EndpointInfo[]> => {
      const endpoints = await fetchAllEndpoints(conn.client, conn.vpn);
      const host = parseHost(conn.baseUrl);
      return endpoints.map((e) => ({ ...e, brokerLabel: conn.label, brokerHost: host }));
    }),
  );
  return perConnection.flat();
}

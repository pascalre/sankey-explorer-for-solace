import { SempV2Client } from "./client.js";
import { parseHost } from "./connectionStore.js";
import { logError } from "../logger.js";
import type { EndpointInfo, RawEndpointInfo } from "./types.js";

/**
 * SEMP v2 Monitor API shapes used here:
 *
 *   GET /msgVpns/{vpn}/queues                             -> { queueName, owner, ... }
 *   GET /msgVpns/{vpn}/queues/{queueName}/subscriptions    -> { subscriptionTopic }
 *   GET /msgVpns/{vpn}/topicEndpoints                      -> { topicEndpointName, owner, destinationTopic, ... }
 *   GET /msgVpns/{vpn}/clients                             -> { clientName, ... }
 *   GET /msgVpns/{vpn}/clients/{clientName}/subscriptions  -> { subscriptionTopic }
 *
 * Topic-endpoints do NOT have a ".../subscriptions" sub-resource the way
 * queues/clients do - confirmed by inspecting a real broker's own live
 * OpenAPI spec (GET {baseUrl}/SEMP/v2/monitor/spec): there is no
 * "/msgVpns/{vpn}/topicEndpoints/{name}/subscriptions" path defined at
 * all. A topic-endpoint's single bound topic is instead exposed directly
 * as the `destinationTopic` attribute on the topicEndpoint object itself,
 * already included in the plain "GET .../topicEndpoints" list reply - no
 * second request needed. This makes sense once you think about it: unlike
 * a queue's statically-configured subscription list, a topic-endpoint's
 * bound topic is assigned dynamically by whichever client's bind request
 * first claims it, so there's only ever at most one, and it isn't really
 * a "subscriptions" sub-collection to page through.
 *
 * (This file's original assumption, before checking the spec, was that
 * topic-endpoints would generalize the queue/client ".../subscriptions"
 * pattern - a real broker returned HTTP 400 for that, which is what
 * prompted inspecting the spec in the first place.)
 *
 * Note on request volume: unlike SEMP v1 (whose "show queue *" bulk reply
 * could embed a <subscriptions/> modifier directly), SEMP v2's REST model
 * has no way to embed a sub-collection into a parent list reply for
 * queues and clients - so fetchQueues()/fetchDirectSubscribers() fetch the
 * object list first, then every object's own subscriptions in parallel.
 * Topic-endpoints skip this second round-trip entirely, since
 * destinationTopic already comes back on the list call. Fine at
 * workshop/demo scale; a VPN with thousands of queues or connected
 * clients would want a concurrency limit added to the queue/client
 * fetches.
 */

interface SempQueueObject {
  queueName: string;
  owner?: string;
}

interface SempTopicEndpointObject {
  topicEndpointName: string;
  owner?: string;
  /**
   * The single topic this topic-endpoint is currently bound to, if any
   * client has bound to it yet. Absent/empty for a provisioned-but-unused
   * topic-endpoint.
   */
  destinationTopic?: string;
}

interface SempClientObject {
  clientName: string;
}

interface SempSubscriptionObject {
  subscriptionTopic: string;
}

/**
 * Fetches one object's own subscriptions (queues/clients only - see
 * file-level comment for why topic-endpoints don't use this) - and
 * degrades to "no subscriptions" (instead of failing the whole
 * /api/endpoints request) if the broker rejects this particular
 * sub-resource for some other reason, so one bad object doesn't take down
 * the rest of the response.
 */
async function fetchSubscriptionTopics(
  client: SempV2Client,
  vpn: string,
  objectCollection: "queues" | "clients",
  objectName: string,
): Promise<string[]> {
  try {
    const subscriptions = await client.getVpnCollection<SempSubscriptionObject>(
      vpn,
      `/${objectCollection}/${encodeURIComponent(objectName)}/subscriptions`,
    );
    return subscriptions.map((s) => s.subscriptionTopic);
  } catch (err) {
    logError(
      `Could not fetch subscriptions for ${objectCollection}/${objectName} (vpn=${vpn}) - treating as none`,
      err,
    );
    return [];
  }
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

  // No second request per object here, unlike fetchQueues()/
  // fetchDirectSubscribers() - destinationTopic already comes back on
  // this list call (see file-level comment).
  return topicEndpoints.map(
    (te): RawEndpointInfo => ({
      type: "topic-endpoint",
      name: te.topicEndpointName,
      vpn,
      subscriptions: te.destinationTopic ? [te.destinationTopic] : [],
      owner: te.owner || undefined,
    }),
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

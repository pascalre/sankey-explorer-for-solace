import { SempV1Client } from "./client.js";
import { parseHost } from "./connectionStore.js";
import type { EndpointInfo, RawEndpointInfo } from "./types.js";

/**
 * UNVERIFIED against a real broker (see the comment at the top of client.ts).
 * Assumed reply shape for "show queue ... <subscriptions/>":
 *
 *   <rpc-reply>
 *     <rpc><show><queue><queues>
 *       <queue>
 *         <name>orders-q</name>
 *         <info><durable>true</durable></info>
 *         <subscriptions>
 *           <subscription><topic>orders/&gt;</topic></subscription>
 *         </subscriptions>
 *       </queue>
 *     </queues></queue></show></rpc>
 *   </rpc-reply>
 *
 * "show client ... subscriptions" (direct subscribers) is a DIFFERENT
 * shape, confirmed against Solace's own docs (a plain "show client" reply -
 * see https://docs.solace.com/Admin/SEMP/Using-Legacy-SEMP.htm - nests
 * clients under a *-virtual-router element, not a "clients" wrapper like
 * queues/topic-endpoints do):
 *
 *   <rpc-reply>
 *     <rpc><show><client>
 *       <primary-virtual-router>
 *         <client>
 *           <name>my-app-1</name>
 *           <subscriptions>
 *             <subscription><topic>orders/&gt;</topic></subscription>
 *           </subscriptions>
 *         </client>
 *       </primary-virtual-router>
 *     </client></show></rpc>
 *   </rpc-reply>
 *
 * The confirmed docs example only shows <num-subscriptions> (a count), not
 * the actual subscribed topics, for a plain "show client" - so whether the
 * per-subscription topic string is really under a <topic> element (as
 * above, matching queues/topic-endpoints) once <subscriptions/> is
 * requested, or under a differently-named element (e.g.
 * <topic-subscription>, seen elsewhere in Solace's docs for MQTT
 * subscriptions), is still unverified. parseClientPages() below therefore
 * (a) searches the whole reply recursively for client-shaped entries
 * instead of assuming one fixed container path, and (b) accepts either
 * <topic> or <topic-subscription> as the per-subscription element name -
 * so it has the best chance of working even if either detail differs from
 * what's assumed here. If direct subscribers still don't show up, capture
 * the raw XML reply (e.g. via curl - see the file-level example request
 * below) and adjust extractSubscriptionTopics()/parseClientPages()
 * accordingly - nothing else needs to change.
 *
 * If your broker responds differently: touch ONLY this file - the rest of
 * the app (routes, frontend) only knows `EndpointInfo[]` and stays unaffected.
 */

/** Prevents XML injection via user-controlled values (vpn name from the Connect screen). */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildShowQueueRequest(vpn: string, moreCookieXml: string | null): string {
  return `<show><queue><name>*</name><vpn-name>${escapeXml(
    vpn,
  )}</vpn-name><subscriptions/>${moreCookieXml ?? ""}</queue></show>`;
}

function buildShowTopicEndpointRequest(
  vpn: string,
  moreCookieXml: string | null,
): string {
  return `<show><topic-endpoint><name>*</name><vpn-name>${escapeXml(
    vpn,
  )}</vpn-name><subscriptions/>${moreCookieXml ?? ""}</topic-endpoint></show>`;
}

/**
 * "Direct subscribers": clients consuming directly off their own topic
 * subscriptions, with no durable queue or topic-endpoint in between. SEMP
 * v1's "show client ... subscriptions" reports each connected client's
 * direct topic subscriptions - same shape/assumptions as the queue and
 * topic-endpoint requests above (see the file-level comment).
 */
function buildShowClientRequest(vpn: string, moreCookieXml: string | null): string {
  return `<show><client><name>*</name><vpn-name>${escapeXml(
    vpn,
  )}</vpn-name><subscriptions/>${moreCookieXml ?? ""}</client></show>`;
}

/** Normalizes fast-xml-parser output: a child node can be an object, an array, or missing. */
function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function extractSubscriptionTopics(node: unknown): string[] {
  const subscriptionsNode = (node as Record<string, unknown>)?.[
    "subscriptions"
  ] as Record<string, unknown> | undefined;
  const subscriptionEntries = asArray(subscriptionsNode?.["subscription"]);

  return subscriptionEntries
    .map((entry) => {
      if (typeof entry === "string") return entry;
      const record = entry as Record<string, unknown> | undefined;
      // <topic> is confirmed for queues/topic-endpoints. <topic-subscription>
      // is an unverified fallback for direct subscribers - see the
      // file-level comment on why the exact element name there is unclear.
      const topic = record?.["topic"] ?? record?.["topic-subscription"];
      return typeof topic === "string" ? topic : null;
    })
    .filter((topic): topic is string => topic !== null && topic.length > 0);
}

/**
 * Recursively searches a parsed SEMP reply for any object that looks like
 * a client with direct subscriptions (has a string `name` plus a
 * `subscriptions` object) - used instead of a fixed container path for
 * parseClientPages() below, since the exact nesting (Solace's confirmed
 * plain "show client" reply nests clients under a *-virtual-router
 * element, e.g. <primary-virtual-router>, not the <clients> wrapper
 * queues/topic-endpoints use) is unverified once <subscriptions/> is
 * requested. Stops recursing into a match itself (a client entry's own
 * fields, like its subscriptions list, aren't further client entries).
 */
function findClientLikeEntries(
  node: unknown,
  seen: Set<unknown> = new Set(),
): Record<string, unknown>[] {
  if (node === null || typeof node !== "object" || seen.has(node)) return [];
  seen.add(node);

  if (Array.isArray(node)) {
    return node.flatMap((item) => findClientLikeEntries(item, seen));
  }

  const record = node as Record<string, unknown>;
  const looksLikeClient =
    typeof record["name"] === "string" &&
    typeof record["subscriptions"] === "object" &&
    record["subscriptions"] !== null;

  if (looksLikeClient) return [record];

  return Object.values(record).flatMap((value) => findClientLikeEntries(value, seen));
}

/**
 * UNVERIFIED: purely opportunistic - the request no longer asks for owner
 * via any dedicated flag (adding <owner/>/<detail/> alongside
 * <subscriptions/> broke subscription parsing entirely on a real broker,
 * so that request-side experiment was reverted). This just checks whether
 * <owner> happens to already be present in whatever the broker returns
 * for a <subscriptions/> request; many SEMP v1 "show queue" detail fields
 * come back nested under <info> rather than as direct children of
 * <queue>, so both locations are checked.
 * If your broker never includes owner in this reply at all, it needs its
 * own request modifier - see the comment at the top of this file for how
 * to find out and adjust buildShowQueueRequest.
 */
function extractOwner(node: unknown): string | undefined {
  const record = node as Record<string, unknown> | undefined;

  const direct = record?.["owner"];
  if (typeof direct === "string" && direct.length > 0) return direct;

  const info = record?.["info"] as Record<string, unknown> | undefined;
  const nested = info?.["owner"];
  if (typeof nested === "string" && nested.length > 0) return nested;

  return undefined;
}

export function parseQueuePages(
  pages: Record<string, unknown>[],
  vpn: string,
): RawEndpointInfo[] {
  const endpoints: RawEndpointInfo[] = [];

  for (const page of pages) {
    const rpc = page["rpc"] as Record<string, unknown> | undefined;
    const show = rpc?.["show"] as Record<string, unknown> | undefined;
    // show.queue is an array with 1 element (the container) because of the
    // isArray() config, not the object directly - see comment at the top of this file.
    const queueRoot = asArray(
      show?.["queue"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
    )[0];
    const queues = queueRoot?.["queues"] as Record<string, unknown> | undefined;
    const queueEntries = asArray(queues?.["queue"]);

    for (const entry of queueEntries) {
      const name = (entry as Record<string, unknown>)?.["name"];
      if (typeof name !== "string") continue;

      endpoints.push({
        type: "queue",
        name,
        vpn,
        subscriptions: extractSubscriptionTopics(entry),
        owner: extractOwner(entry),
      });
    }
  }

  return endpoints;
}

export function parseTopicEndpointPages(
  pages: Record<string, unknown>[],
  vpn: string,
): RawEndpointInfo[] {
  const endpoints: RawEndpointInfo[] = [];

  for (const page of pages) {
    const rpc = page["rpc"] as Record<string, unknown> | undefined;
    const show = rpc?.["show"] as Record<string, unknown> | undefined;
    const teRoot = asArray(
      show?.["topic-endpoint"] as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | undefined,
    )[0];
    const tes = teRoot?.["topic-endpoints"] as
      | Record<string, unknown>
      | undefined;
    const teEntries = asArray(tes?.["topic-endpoint"]);

    for (const entry of teEntries) {
      const name = (entry as Record<string, unknown>)?.["name"];
      if (typeof name !== "string") continue;

      endpoints.push({
        type: "topic-endpoint",
        name,
        vpn,
        subscriptions: extractSubscriptionTopics(entry),
        owner: extractOwner(entry),
      });
    }
  }

  return endpoints;
}

/**
 * A client only counts as a "direct subscriber" node worth showing if it
 * actually has at least one direct topic subscription - "show client *"
 * also returns clients with none (e.g. ones only consuming via a queue),
 * and those would otherwise show up as disconnected, edge-less nodes.
 */
export function parseClientPages(
  pages: Record<string, unknown>[],
  vpn: string,
): RawEndpointInfo[] {
  const endpoints: RawEndpointInfo[] = [];

  for (const page of pages) {
    const rpc = page["rpc"] as Record<string, unknown> | undefined;
    const show = rpc?.["show"] as Record<string, unknown> | undefined;
    const clientRoot = asArray(
      show?.["client"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
    )[0];
    // Deliberately not a fixed path (unlike queue/topic-endpoint above) -
    // see findClientLikeEntries()'s doc comment for why.
    const clientEntries = findClientLikeEntries(clientRoot);

    for (const entry of clientEntries) {
      const name = entry["name"];
      if (typeof name !== "string") continue;

      const subscriptions = extractSubscriptionTopics(entry);
      if (subscriptions.length === 0) continue;

      endpoints.push({ type: "direct-subscriber", name, vpn, subscriptions });
    }
  }

  return endpoints;
}

export async function fetchAllEndpoints(
  client: SempV1Client,
  vpn: string,
): Promise<RawEndpointInfo[]> {
  const [queuePages, topicEndpointPages, clientPages] = await Promise.all([
    client.sendPagedRpc((moreCookie) => buildShowQueueRequest(vpn, moreCookie)),
    client.sendPagedRpc((moreCookie) =>
      buildShowTopicEndpointRequest(vpn, moreCookie),
    ),
    client.sendPagedRpc((moreCookie) => buildShowClientRequest(vpn, moreCookie)),
  ]);

  return [
    ...parseQueuePages(queuePages, vpn),
    ...parseTopicEndpointPages(topicEndpointPages, vpn),
    ...parseClientPages(clientPages, vpn),
  ];
}

/**
 * What both routes/endpoints.ts and routes/sankey.ts need from a broker
 * connection to query it - a structural subset of connectionStore.ts's
 * (unexported) StoredConnection, so listBrokerConnections()'s result can be
 * passed straight in without any adapting.
 */
export interface FetchableBrokerConnection {
  client: SempV1Client;
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

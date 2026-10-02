import { describe, expect, it, vi } from "vitest";
import {
  fetchAllEndpoints,
  fetchDirectSubscribers,
  fetchEndpointsAcrossConnections,
  fetchQueues,
  fetchTopicEndpoints,
} from "../semp/queries.js";
import type { SempV2Client } from "../semp/client.js";
import type { FetchableBrokerConnection } from "../semp/queries.js";

/**
 * A test double for SempV2Client that resolves `getVpnCollection(vpn, path)`
 * from a lookup table keyed by `path` - lets each test describe exactly
 * what each REST call should return without needing a real broker.
 */
function fakeClient(responses: Record<string, unknown[]>): {
  client: SempV2Client;
  calls: Array<{ vpn: string; path: string }>;
} {
  const calls: Array<{ vpn: string; path: string }> = [];
  const client = {
    getVpnCollection: vi.fn((vpn: string, path: string) => {
      calls.push({ vpn, path });
      return Promise.resolve(responses[path] ?? []);
    }),
  } as unknown as SempV2Client;
  return { client, calls };
}

describe("fetchQueues", () => {
  it("fetches the queue list, then each queue's own subscriptions, and merges them", async () => {
    const { client } = fakeClient({
      "/queues": [
        { queueName: "orders-q", owner: "app-svc-orders" },
        { queueName: "empty-q" },
      ],
      "/queues/orders-q/subscriptions": [
        { subscriptionTopic: "orders/created" },
        { subscriptionTopic: "orders/cancelled" },
      ],
      "/queues/empty-q/subscriptions": [],
    });

    const result = await fetchQueues(client, "default");

    expect(result).toEqual([
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: ["orders/created", "orders/cancelled"],
        owner: "app-svc-orders",
      },
      {
        type: "queue",
        name: "empty-q",
        vpn: "default",
        subscriptions: [],
        owner: undefined,
      },
    ]);
  });

  it("URL-encodes a queue name that needs it when fetching its subscriptions", async () => {
    const { client, calls } = fakeClient({
      "/queues": [{ queueName: "a queue/weird" }],
    });

    await fetchQueues(client, "default");

    expect(calls.map((c) => c.path)).toContain("/queues/a%20queue%2Fweird/subscriptions");
  });
});

describe("fetchTopicEndpoints", () => {
  it("fetches the topic-endpoint list and uses each one's destinationTopic field directly - confirmed via a real broker's own /SEMP/v2/monitor/spec that topic-endpoints have NO '.../subscriptions' sub-resource (unlike queues/clients); the bound topic is a plain attribute on the topicEndpoint object itself, already included in the list reply", async () => {
    const { client, calls } = fakeClient({
      "/topicEndpoints": [
        { topicEndpointName: "te-orders", owner: "app-svc-orders", destinationTopic: "orders/*" },
      ],
    });

    const result = await fetchTopicEndpoints(client, "default");

    expect(result).toEqual([
      {
        type: "topic-endpoint",
        name: "te-orders",
        vpn: "default",
        subscriptions: ["orders/*"],
        owner: "app-svc-orders",
      },
    ]);
    // No extra per-object request, unlike fetchQueues()/fetchDirectSubscribers() -
    // there's no ".../subscriptions" sub-resource for topic-endpoints to fetch.
    expect(calls.map((c) => c.path)).toEqual(["/topicEndpoints"]);
  });

  it("returns an empty subscriptions list for a topic-endpoint with no bound topic yet (provisioned, but no client has bound to it)", async () => {
    const { client } = fakeClient({
      "/topicEndpoints": [{ topicEndpointName: "te-unbound" }],
    });

    const result = await fetchTopicEndpoints(client, "default");

    expect(result).toEqual([
      { type: "topic-endpoint", name: "te-unbound", vpn: "default", subscriptions: [], owner: undefined },
    ]);
  });
});

describe("fetchDirectSubscribers", () => {
  it("only returns clients with at least one direct topic subscription", async () => {
    const { client } = fakeClient({
      "/clients": [{ clientName: "my-app-1" }, { clientName: "queue-consumer-only" }],
      "/clients/my-app-1/subscriptions": [{ subscriptionTopic: "orders/created" }],
      "/clients/queue-consumer-only/subscriptions": [],
    });

    const result = await fetchDirectSubscribers(client, "default");

    expect(result).toEqual([
      {
        type: "direct-subscriber",
        name: "my-app-1",
        vpn: "default",
        subscriptions: ["orders/created"],
      },
    ]);
  });
});

describe("fetchAllEndpoints", () => {
  it("combines queues, topic-endpoints and direct subscribers into one flat list", async () => {
    const { client, calls } = fakeClient({
      "/queues": [{ queueName: "orders-q" }],
      "/queues/orders-q/subscriptions": [{ subscriptionTopic: "orders/created" }],
      "/topicEndpoints": [{ topicEndpointName: "te-orders", destinationTopic: "orders/*" }],
      "/clients": [{ clientName: "my-app-1" }],
      "/clients/my-app-1/subscriptions": [{ subscriptionTopic: "orders/>" }],
    });

    const result = await fetchAllEndpoints(client, "default");

    expect(result.map((e) => e.type)).toEqual(
      expect.arrayContaining(["queue", "topic-endpoint", "direct-subscriber"]),
    );
    expect(result).toHaveLength(3);
    expect(calls.map((c) => c.path)).toEqual(
      expect.arrayContaining(["/queues", "/topicEndpoints", "/clients"]),
    );
  });
});

describe("fetchEndpointsAcrossConnections", () => {
  function fakeConnectionReturning(
    queueName: string,
    overrides: Partial<FetchableBrokerConnection> = {},
  ): FetchableBrokerConnection {
    const { client } = fakeClient({
      "/queues": [{ queueName }],
      [`/queues/${queueName}/subscriptions`]: [],
      "/topicEndpoints": [],
      "/clients": [],
    });

    return {
      client,
      vpn: "default",
      label: "Test-Broker",
      baseUrl: "http://localhost:8080",
      ...overrides,
    };
  }

  it("stamps brokerLabel and brokerHost (parsed from baseUrl) onto every endpoint", async () => {
    const connection = fakeConnectionReturning("orders-q");

    const endpoints = await fetchEndpointsAcrossConnections([connection]);

    expect(endpoints).toEqual([
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: [],
        owner: undefined,
        brokerLabel: "Test-Broker",
        brokerHost: "localhost:8080",
      },
    ]);
  });

  it("queries multiple connections in parallel and flattens the combined, distinctly-stamped result", async () => {
    const connections = [
      fakeConnectionReturning("orders-q", { label: "A", baseUrl: "http://host-a:8080" }),
      fakeConnectionReturning("orders-q", { label: "B", baseUrl: "http://host-b:8080" }),
    ];

    const endpoints = await fetchEndpointsAcrossConnections(connections);

    expect(endpoints).toHaveLength(2);
    expect(endpoints.map((e) => e.brokerLabel)).toEqual(["A", "B"]);
    expect(endpoints.map((e) => e.brokerHost)).toEqual(["host-a:8080", "host-b:8080"]);
  });
});

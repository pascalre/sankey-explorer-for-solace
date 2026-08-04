import { describe, expect, it, vi } from "vitest";
import { parser } from "../semp/client.js";
import {
  fetchAllEndpoints,
  fetchEndpointsAcrossConnections,
  parseQueuePages,
  parseTopicEndpointPages,
} from "../semp/queries.js";
import type { SempV1Client } from "../semp/client.js";
import type { FetchableBrokerConnection } from "../semp/queries.js";

function parseReplyBody(xml: string): Record<string, unknown> {
  const fullXml = `<rpc-reply semp-version="soltr/10_8_1"><rpc>${xml}</rpc><execute-result code="ok"/></rpc-reply>`;
  const parsed = parser.parse(fullXml);
  return parsed["rpc-reply"] as Record<string, unknown>;
}

/**
 * A test double for SempV1Client that just captures the request-building
 * function fetchAllEndpoints passes to sendPagedRpc, so we can inspect the
 * actual XML it would send - including whether the vpn name gets properly
 * escaped - without needing a real broker or exporting the private request
 * builders from queries.ts.
 */
function fakeClientCapturingRequests() {
  const capturedBuilders: Array<(cookie: string | null) => string> = [];
  const client = {
    sendPagedRpc: vi.fn((builder: (cookie: string | null) => string) => {
      capturedBuilders.push(builder);
      return Promise.resolve([]);
    }),
  } as unknown as SempV1Client;
  return { client, capturedBuilders };
}

describe("parseQueuePages", () => {
  it("extracts queue name and subscribed topics", () => {
    const xml = `<show><queue><queues><queue>
      <name>orders-q</name>
      <subscriptions>
        <subscription><topic>orders/created</topic></subscription>
        <subscription><topic>orders/cancelled</topic></subscription>
      </subscriptions>
    </queue></queues></queue></show>`;

    const reply = parseReplyBody(xml) as unknown as Record<string, unknown>;
    const result = parseQueuePages([reply], "default");

    expect(result).toEqual([
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: ["orders/created", "orders/cancelled"],
      },
    ]);
  });

  it("returns an empty subscriptions array when a queue has no subscriptions", () => {
    const xml = `<show><queue><queues><queue>
      <name>empty-q</name>
    </queue></queues></queue></show>`;

    const reply = parseReplyBody(xml) as unknown as Record<string, unknown>;
    const result = parseQueuePages([reply], "default");

    expect(result).toEqual([
      { type: "queue", name: "empty-q", vpn: "default", subscriptions: [] },
    ]);
  });

  it("handles a single queue without treating it as multiple entries", () => {
    // Regression: fast-xml-parser returns an object for exactly 1 child
    // node instead of an array, unless you force it via isArray() in the parser config.
    const xml = `<show><queue><queues><queue>
      <name>only-one-q</name>
    </queue></queues></queue></show>`;

    const reply = parseReplyBody(xml) as unknown as Record<string, unknown>;
    const result = parseQueuePages([reply], "default");

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("only-one-q");
  });

  it("merges multiple pages (paging) into one flat list", () => {
    const page1 = parseReplyBody(
      `<show><queue><queues><queue><name>q1</name></queue></queues></queue></show>`,
    ) as unknown as Record<string, unknown>;
    const page2 = parseReplyBody(
      `<show><queue><queues><queue><name>q2</name></queue></queues></queue></show>`,
    ) as unknown as Record<string, unknown>;

    const result = parseQueuePages([page1, page2], "default");

    expect(result.map((e) => e.name)).toEqual(["q1", "q2"]);
  });

  it("extracts the owner when present", () => {
    const xml = `<show><queue><queues><queue>
      <name>orders-q</name>
      <owner>app-svc-orders</owner>
    </queue></queues></queue></show>`;

    const reply = parseReplyBody(xml) as unknown as Record<string, unknown>;
    const result = parseQueuePages([reply], "default");

    expect(result[0]?.owner).toBe("app-svc-orders");
  });

  it("leaves owner undefined when the broker reply has no owner element", () => {
    const xml = `<show><queue><queues><queue>
      <name>orders-q</name>
    </queue></queues></queue></show>`;

    const reply = parseReplyBody(xml) as unknown as Record<string, unknown>;
    const result = parseQueuePages([reply], "default");

    expect(result[0]?.owner).toBeUndefined();
  });

  it("also finds the owner when it's nested under <info> instead of top-level", () => {
    // Many SEMP v1 "show queue" detail fields come back nested under
    // <info> rather than as direct children of <queue> - unverified which
    // shape a given broker actually uses for <owner>, so we accept both.
    const xml = `<show><queue><queues><queue>
      <name>orders-q</name>
      <info>
        <durable>true</durable>
        <owner>app-svc-orders</owner>
      </info>
    </queue></queues></queue></show>`;

    const reply = parseReplyBody(xml) as unknown as Record<string, unknown>;
    const result = parseQueuePages([reply], "default");

    expect(result[0]?.owner).toBe("app-svc-orders");
  });
});

describe("parseTopicEndpointPages", () => {
  it("extracts topic-endpoint name and subscribed topics", () => {
    const xml = `<show><topic-endpoint><topic-endpoints><topic-endpoint>
      <name>te-orders</name>
      <subscriptions>
        <subscription><topic>orders/*</topic></subscription>
      </subscriptions>
    </topic-endpoint></topic-endpoints></topic-endpoint></show>`;

    const reply = parseReplyBody(xml) as unknown as Record<string, unknown>;
    const result = parseTopicEndpointPages([reply], "default");

    expect(result).toEqual([
      {
        type: "topic-endpoint",
        name: "te-orders",
        vpn: "default",
        subscriptions: ["orders/*"],
      },
    ]);
  });
});

describe("fetchAllEndpoints request building", () => {
  it("escapes XML special characters in the vpn name to prevent XML injection", async () => {
    const { client, capturedBuilders } = fakeClientCapturingRequests();

    await fetchAllEndpoints(client, `evil"vpn'<inject>&</inject>`);

    // Two sendPagedRpc calls: one for queues, one for topic-endpoints.
    expect(capturedBuilders).toHaveLength(2);
    for (const builder of capturedBuilders) {
      const xml = builder(null);
      expect(xml).not.toContain("<inject>");
      expect(xml).toContain("&lt;inject&gt;");
      expect(xml).toContain("&amp;");
      expect(xml).toContain("&quot;");
      expect(xml).toContain("&apos;");
    }
  });

  it("includes the vpn name and <subscriptions/> flag in both the queue and topic-endpoint request", async () => {
    const { client, capturedBuilders } = fakeClientCapturingRequests();

    await fetchAllEndpoints(client, "my-vpn");

    const [queueXml, topicEndpointXml] = capturedBuilders.map((b) => b(null));
    expect(queueXml).toContain("<show><queue>");
    expect(queueXml).toContain("<vpn-name>my-vpn</vpn-name>");
    expect(queueXml).toContain("<subscriptions/>");

    expect(topicEndpointXml).toContain("<show><topic-endpoint>");
    expect(topicEndpointXml).toContain("<vpn-name>my-vpn</vpn-name>");
    expect(topicEndpointXml).toContain("<subscriptions/>");
  });

  it("embeds a more-cookie into the request when paging", async () => {
    const { client, capturedBuilders } = fakeClientCapturingRequests();

    await fetchAllEndpoints(client, "default");

    const [queueBuilder] = capturedBuilders;
    const withCookie = queueBuilder!("<more-cookie>abc</more-cookie>");
    expect(withCookie).toContain("<more-cookie>abc</more-cookie>");

    const withoutCookie = queueBuilder!(null);
    expect(withoutCookie).not.toContain("more-cookie");
  });
});

describe("fetchEndpointsAcrossConnections", () => {
  function fakeConnectionReturning(
    queueName: string,
    overrides: Partial<FetchableBrokerConnection> = {},
  ): FetchableBrokerConnection {
    const queuePage = {
      rpc: { show: { queue: [{ queues: { queue: [{ name: queueName }] } }] } },
    };
    const emptyTopicEndpointPage = {
      rpc: { show: { "topic-endpoint": [{ "topic-endpoints": {} }] } },
    };

    const client = {
      sendPagedRpc: vi
        .fn()
        .mockResolvedValueOnce([queuePage])
        .mockResolvedValueOnce([emptyTopicEndpointPage]),
    } as unknown as SempV1Client;

    return {
      client,
      vpn: "default",
      label: "Test-Broker",
      baseUrl: "http://localhost:8080/SEMP",
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
        brokerLabel: "Test-Broker",
        brokerHost: "localhost:8080",
      },
    ]);
  });

  it("queries multiple connections in parallel and flattens the combined, distinctly-stamped result", async () => {
    const connections = [
      fakeConnectionReturning("orders-q", { label: "A", baseUrl: "http://host-a:8080/SEMP" }),
      fakeConnectionReturning("orders-q", { label: "B", baseUrl: "http://host-b:8080/SEMP" }),
    ];

    const endpoints = await fetchEndpointsAcrossConnections(connections);

    expect(endpoints).toHaveLength(2);
    expect(endpoints.map((e) => e.brokerLabel)).toEqual(["A", "B"]);
    expect(endpoints.map((e) => e.brokerHost)).toEqual(["host-a:8080", "host-b:8080"]);
  });
});

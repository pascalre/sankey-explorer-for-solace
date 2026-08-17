import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createServer } from "../server.js";

function xmlResponse(body: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

const OK_VERSION_REPLY = `<rpc-reply><rpc><show><version><version>10.8.1</version></version></show></rpc><execute-result code="ok"/></rpc-reply>`;

/** A fetch mock that behaves like a small real broker: version/queue/topic-endpoint/client. */
function mockBrokerFetch() {
  return vi.fn((_url: string, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    if (body.includes("<version/>")) return Promise.resolve(xmlResponse(OK_VERSION_REPLY));
    if (body.includes("<queue>")) {
      return Promise.resolve(
        xmlResponse(
          `<rpc-reply><rpc><show><queue><queues><queue>
            <name>orders-q</name>
            <subscriptions><subscription><topic>orders/created</topic></subscription></subscriptions>
          </queue></queues></queue></show></rpc><execute-result code="ok"/></rpc-reply>`,
        ),
      );
    }
    if (body.includes("<topic-endpoint>")) {
      return Promise.resolve(
        xmlResponse(
          `<rpc-reply><rpc><show><topic-endpoint><topic-endpoints></topic-endpoints></topic-endpoint></show></rpc><execute-result code="ok"/></rpc-reply>`,
        ),
      );
    }
    if (body.includes("<client>")) {
      return Promise.resolve(
        xmlResponse(
          `<rpc-reply><rpc><show><client><primary-virtual-router><client>
            <name>my-app-1</name>
            <subscriptions><subscription><topic>orders/&gt;</topic></subscription></subscriptions>
          </client></primary-virtual-router></client></show></rpc><execute-result code="ok"/></rpc-reply>`,
        ),
      );
    }
    return Promise.resolve(xmlResponse("", false, 400));
  });
}

const app = createServer();

beforeEach(() => {
  vi.stubGlobal("fetch", mockBrokerFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /healthz", () => {
  it("responds 200 ok without needing auth or a session", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
  });
});

describe("GET /api/session", () => {
  it("reports no login required and no brokers connected by default (workshop mode)", async () => {
    const res = await request(app).get("/api/session");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authRequired: false, authenticated: true, brokers: [] });
  });
});

describe("POST /api/login (workshop mode)", () => {
  it("succeeds trivially since no login is configured", async () => {
    const res = await request(app).post("/api/login").send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authenticated: true });
  });
});

describe("connection + endpoints + sankey-edges (full flow on one session)", () => {
  it("400s on /api/endpoints before any broker is connected", async () => {
    const agent = request.agent(app);
    const res = await agent.get("/api/endpoints");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Not connected to a broker" });
  });

  it("validates required fields on connect", async () => {
    const agent = request.agent(app);
    const res = await agent.post("/api/connection").send({ baseUrl: "http://x/SEMP" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/);
  });

  it("rejects an unparseable baseUrl", async () => {
    const agent = request.agent(app);
    const res = await agent
      .post("/api/connection")
      .send({ baseUrl: "not a url", vpn: "default", username: "ro", password: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid URL/);
  });

  it("rejects a non-http(s) baseUrl protocol", async () => {
    const agent = request.agent(app);
    const res = await agent
      .post("/api/connection")
      .send({ baseUrl: "ftp://host/SEMP", vpn: "default", username: "ro", password: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/http or https/);
  });

  it("400s when the broker ping fails (unreachable/bad credentials)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))),
    );
    const agent = request.agent(app);
    const res = await agent
      .post("/api/connection")
      .send({ baseUrl: "http://localhost:8080/SEMP", vpn: "default", username: "ro", password: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Could not connect/);
  });

  it("includes the underlying SEMP/network failure reason in the error response, to help debug a real broker that won't connect", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))),
    );
    const agent = request.agent(app);
    const res = await agent.post("/api/connection").send({
      baseUrl: "http://customer-broker.example:8080/SEMP",
      vpn: "default",
      username: "ro",
      password: "x",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      "Could not connect: SEMP request failed (network): http://customer-broker.example:8080/SEMP",
    );
  });

  it("logs a failed connection attempt server-side, with the broker URL/vpn/username but NEVER the password", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))),
    );
    const agent = request.agent(app);
    await agent.post("/api/connection").send({
      baseUrl: "http://customer-broker.example:8080/SEMP",
      vpn: "customer-vpn",
      username: "ro-user",
      password: "super-secret-password",
    });

    expect(errorSpy).toHaveBeenCalled();
    const loggedText = errorSpy.mock.calls.flat().join(" ");
    expect(loggedText).toContain("customer-broker.example");
    expect(loggedText).toContain("customer-vpn");
    expect(loggedText).toContain("ro-user");
    expect(loggedText).not.toContain("super-secret-password");

    errorSpy.mockRestore();
  });

  it("logs a successful connection server-side, without the password", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const agent = request.agent(app);
    await agent.post("/api/connection").send({
      baseUrl: "http://localhost:8080/SEMP",
      vpn: "default",
      username: "ro",
      password: "super-secret-password",
      label: "Test-Broker",
    });

    expect(logSpy).toHaveBeenCalled();
    const loggedText = logSpy.mock.calls.flat().join(" ");
    expect(loggedText).toContain("localhost:8080");
    expect(loggedText).toContain("Test-Broker");
    expect(loggedText).not.toContain("super-secret-password");

    logSpy.mockRestore();
  });

  it("connects, lists, queries endpoints and sankey-edges, then disconnects", async () => {
    const agent = request.agent(app);

    const connectRes = await agent.post("/api/connection").send({
      baseUrl: "http://localhost:8080/SEMP",
      vpn: "default",
      username: "ro",
      password: "x",
      label: "Test-Broker",
    });
    expect(connectRes.status).toBe(200);
    expect(connectRes.body).toHaveLength(1);
    const connectionId: string = connectRes.body[0].id;
    expect(connectRes.body[0].label).toBe("Test-Broker");

    const listRes = await agent.get("/api/connection");
    expect(listRes.body).toHaveLength(1);

    const endpointsRes = await agent.get("/api/endpoints");
    expect(endpointsRes.status).toBe(200);
    expect(endpointsRes.body).toEqual([
      {
        type: "queue",
        name: "orders-q",
        vpn: "default",
        subscriptions: ["orders/created"],
        brokerLabel: "Test-Broker",
        brokerHost: "localhost:8080",
      },
      {
        type: "direct-subscriber",
        name: "my-app-1",
        vpn: "default",
        subscriptions: ["orders/>"],
        brokerLabel: "Test-Broker",
        brokerHost: "localhost:8080",
      },
    ]);

    const sankeyRes = await agent.get("/api/sankey-edges");
    expect(sankeyRes.status).toBe(200);
    expect(sankeyRes.body).toEqual(
      expect.arrayContaining([
        { source: "orders/created", target: "Queue: orders-q", value: 1 },
        { source: "orders/>", target: "Direct Subscriber: my-app-1", value: 1 },
      ]),
    );
    expect(sankeyRes.body).toHaveLength(2);

    const removeRes = await agent.delete(`/api/connection/${connectionId}`);
    expect(removeRes.body).toEqual([]);

    const afterRemoveRes = await agent.get("/api/endpoints");
    expect(afterRemoveRes.status).toBe(400);
  });

  it("502s when the SEMP query itself fails after a successful connect", async () => {
    const agent = request.agent(app);
    await agent.post("/api/connection").send({
      baseUrl: "http://localhost:8080/SEMP",
      vpn: "default",
      username: "ro",
      password: "x",
    });

    // Now make every subsequent fetch fail (the ping already succeeded).
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("broker went away"))),
    );

    const res = await agent.get("/api/endpoints");
    expect(res.status).toBe(502);
  });

  it("DELETE /api/connection clears all connections at once", async () => {
    const agent = request.agent(app);
    await agent.post("/api/connection").send({
      baseUrl: "http://localhost:8080/SEMP",
      vpn: "default",
      username: "ro",
      password: "x",
    });

    const clearRes = await agent.delete("/api/connection");
    expect(clearRes.body).toEqual([]);

    const listRes = await agent.get("/api/connection");
    expect(listRes.body).toEqual([]);
  });
});

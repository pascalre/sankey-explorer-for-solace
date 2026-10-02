import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SempError, SempV2Client } from "../semp/client.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const client = new SempV2Client({
  baseUrl: "http://localhost:8080",
  username: "ro",
  password: "x",
  minRequestIntervalMs: 0, // no throttling delay slowing down the test suite
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SempV2Client.ping", () => {
  it("resolves without error on a healthy reply", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: { version: "10.8.1" } }));

    await expect(client.ping()).resolves.toBeUndefined();
  });

  it("sends Basic Auth and GETs the SEMP v2 monitor root", async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValue(jsonResponse({ data: { version: "10.8.1" } }));

    await client.ping();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:8080/SEMP/v2/monitor");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("ro:x").toString("base64")}`);
  });

  it("strips a trailing slash from baseUrl before building the URL", async () => {
    const trailingSlashClient = new SempV2Client({
      baseUrl: "http://localhost:8080/",
      username: "ro",
      password: "x",
      minRequestIntervalMs: 0,
    });
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValue(jsonResponse({ data: { version: "10.8.1" } }));

    await trailingSlashClient.ping();

    expect(fetchMock.mock.calls[0]![0]).toBe("http://localhost:8080/SEMP/v2/monitor");
  });

  it("throws SempError on a network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(client.ping()).rejects.toBeInstanceOf(SempError);
  });

  it("throws SempError on a non-ok HTTP status", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false, 401));

    await expect(client.ping()).rejects.toThrow(/HTTP 401/);
  });

  it("throws SempError when the reply isn't valid JSON", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.reject(new Error("Unexpected token")),
    } as unknown as Response);

    await expect(client.ping()).rejects.toThrow(/not valid JSON/);
  });
});

describe("SempV2Client.getVpnCollection", () => {
  it("builds the expected URL, with the vpn and path segments encoded", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: [] }));

    await client.getVpnCollection("my vpn", "/queues");

    expect(fetchMock.mock.calls[0]![0]).toBe(
      "http://localhost:8080/SEMP/v2/monitor/msgVpns/my%20vpn/queues?count=100",
    );
  });

  it("returns the combined data from a single page", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: [{ queueName: "q1" }] }));

    const result = await client.getVpnCollection("default", "/queues");

    expect(result).toEqual([{ queueName: "q1" }]);
  });

  it("follows meta.paging.nextPageUri across pages until it's no longer present", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ queueName: "q1" }],
          meta: { paging: { nextPageUri: "http://localhost:8080/SEMP/v2/monitor/page2" } },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ queueName: "q2" }] }));

    const result = await client.getVpnCollection("default", "/queues");

    expect(result).toEqual([{ queueName: "q1" }, { queueName: "q2" }]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toBe("http://localhost:8080/SEMP/v2/monitor/page2");
  });

  it("propagates SempError when a page request fails", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false, 403));

    await expect(client.getVpnCollection("default", "/queues")).rejects.toBeInstanceOf(SempError);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiRequestError } from "./client";

function jsonResponse(body: unknown, ok = true, statusText = "OK"): Response {
  return {
    ok,
    statusText,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api.getSession", () => {
  it("GETs /api/session with credentials included", async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValue(jsonResponse({ authRequired: false, authenticated: true, brokers: [] }));

    const session = await api.getSession();

    expect(session.brokers).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/session");
    expect(init?.credentials).toBe("include");
  });

  it("throws ApiRequestError with the server's error message on failure", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: "boom" }, false, "Internal Server Error"),
    );

    await expect(api.getSession()).rejects.toThrow(ApiRequestError);
    await expect(api.getSession()).rejects.toThrow("boom");
  });

  it("falls back to the HTTP status text when the error body isn't JSON", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      statusText: "Service Unavailable",
      json: () => Promise.reject(new Error("not json")),
    } as unknown as Response);

    await expect(api.getSession()).rejects.toThrow("Service Unavailable");
  });
});

describe("api.login", () => {
  it("POSTs username and password as JSON", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(jsonResponse({ authenticated: true }));

    await api.login("admin", "secret");

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      username: "admin",
      password: "secret",
    });
  });
});

describe("api.connect", () => {
  it("POSTs to /api/connection and returns the updated broker list", async () => {
    const brokers = [{ id: "1", label: "default", vpn: "default", baseUrl: "x", connectedAt: 0 }];
    vi.mocked(fetch).mockResolvedValue(jsonResponse(brokers));

    const result = await api.connect({
      baseUrl: "http://localhost:8080/SEMP",
      vpn: "default",
      username: "ro",
      password: "x",
    });

    expect(result).toEqual(brokers);
  });
});

describe("api.disconnectOne", () => {
  it("DELETEs /api/connection/:id with the id URL-encoded", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(jsonResponse([]));

    await api.disconnectOne("some id/with-slash");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/connection/some%20id%2Fwith-slash");
    expect(init?.method).toBe("DELETE");
  });
});

describe("api.disconnectAll", () => {
  it("DELETEs /api/connection", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(jsonResponse([]));

    await api.disconnectAll();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/connection");
    expect(init?.method).toBe("DELETE");
  });
});

describe("api.getEndpoints", () => {
  it("GETs /api/endpoints and returns the parsed body", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([{ name: "orders-q" }]));

    const endpoints = await api.getEndpoints();

    expect(endpoints).toEqual([{ name: "orders-q" }]);
  });
});

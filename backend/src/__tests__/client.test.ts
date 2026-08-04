import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SempError, SempV1Client, extractRawMoreCookie } from "../semp/client.js";

function xmlResponse(body: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

function okReply(innerRpc: string): string {
  return `<rpc-reply semp-version="soltr/10_8_1"><rpc>${innerRpc}</rpc><execute-result code="ok"/></rpc-reply>`;
}

const client = new SempV1Client({
  baseUrl: "http://localhost:8080/SEMP",
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

describe("SempV1Client.ping", () => {
  it("resolves without error on a healthy 'ok' reply", async () => {
    vi.mocked(fetch).mockResolvedValue(
      xmlResponse(okReply("<show><version><version>10.8.1</version></version></show>")),
    );

    await expect(client.ping()).resolves.toBeUndefined();
  });

  it("sends Basic Auth and the SEMP v1 XML body", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(
      xmlResponse(okReply("<show><version/></show>")),
    );

    await client.ping();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:8080/SEMP");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("ro:x").toString("base64")}`);
    expect(init?.body).toContain("<show><version/></show>");
  });

  it("throws SempError on a network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(client.ping()).rejects.toBeInstanceOf(SempError);
  });

  it("throws SempError on a non-ok HTTP status", async () => {
    vi.mocked(fetch).mockResolvedValue(xmlResponse("", false, 401));

    await expect(client.ping()).rejects.toThrow(/HTTP 401/);
  });

  it("throws SempError when the reply has no <rpc-reply>", async () => {
    vi.mocked(fetch).mockResolvedValue(xmlResponse("<not-a-semp-reply/>"));

    await expect(client.ping()).rejects.toThrow(/Malformed SEMP reply/);
  });

  it("throws SempError when execute-result code is not 'ok'", async () => {
    vi.mocked(fetch).mockResolvedValue(
      xmlResponse(
        `<rpc-reply><rpc><show/></rpc><execute-result code="fail" reason="bad vpn"/></rpc-reply>`,
      ),
    );

    await expect(client.ping()).rejects.toThrow(/non-ok result/);
  });
});

describe("SempV1Client.sendPagedRpc", () => {
  it("returns a single page when there is no more-cookie", async () => {
    vi.mocked(fetch).mockResolvedValue(
      xmlResponse(okReply("<show><queue><queues><queue><name>q1</name></queue></queues></queue></show>")),
    );

    const pages = await client.sendPagedRpc(() => "<show><queue/></show>");

    expect(pages).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("follows more-cookie across pages until it disappears", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        xmlResponse(
          okReply(
            "<show><queue><queues><queue><name>q1</name></queue></queues><more-cookie>abc</more-cookie></queue></show>",
          ),
        ),
      )
      .mockResolvedValueOnce(
        xmlResponse(okReply("<show><queue><queues><queue><name>q2</name></queue></queues></queue></show>")),
      );

    const pages = await client.sendPagedRpc((cookie) => `<show><queue>${cookie ?? ""}</queue></show>`);

    expect(pages).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    // Second request must carry the more-cookie the first reply returned.
    const secondBody = fetchMock.mock.calls[1]![1]?.body as string;
    expect(secondBody).toContain("<more-cookie>abc</more-cookie>");
  });

  it("stops at maxPages even if more-cookie keeps coming back", async () => {
    vi.mocked(fetch).mockResolvedValue(
      xmlResponse(
        okReply(
          "<show><queue><queues><queue><name>q</name></queue></queues><more-cookie>again</more-cookie></queue></show>",
        ),
      ),
    );

    const pages = await client.sendPagedRpc(() => "<show><queue/></show>", 3);

    expect(pages).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe("extractRawMoreCookie", () => {
  it("extracts the more-cookie element verbatim", () => {
    const xml = "<rpc-reply><more-cookie>opaque-token</more-cookie></rpc-reply>";
    expect(extractRawMoreCookie(xml)).toBe("<more-cookie>opaque-token</more-cookie>");
  });

  it("returns null when there is no more-cookie", () => {
    expect(extractRawMoreCookie("<rpc-reply></rpc-reply>")).toBeNull();
  });
});

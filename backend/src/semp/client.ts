import type { SempClientOptions } from "./types.js";

/**
 * SEMP v2 (RESTful JSON) - https://docs.solace.com/SEMP/SEMP-Home.htm
 * Monitor API base path: {baseUrl}/SEMP/v2/monitor
 *
 * Much simpler than SEMP v1 (Legacy SEMP, XML/RPC) was: plain HTTP GET +
 * Basic Auth + JSON, no XML parsing, no custom "more-cookie" pagination -
 * SEMP v2 collection replies carry their own absolute "next page" URL in
 * `meta.paging.nextPageUri`, so following it is just "fetch that URL next".
 */

export class SempError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "SempError";
  }
}

/** Shape of every SEMP v2 collection (list) reply - only the fields this app uses. */
export interface SempV2Page<T> {
  data: T[];
  meta?: {
    paging?: {
      /** Absolute URL for the next page, present only while there is one. */
      nextPageUri?: string;
    };
  };
}

export class SempV2Client {
  private lastRequestAt = 0;

  constructor(private readonly options: SempClientOptions) {}

  private authHeader(): string {
    const { username, password } = this.options;
    return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }

  /** The broker's SEMP v2 Monitor API root, with any trailing slash trimmed. */
  private monitorBase(): string {
    return `${this.options.baseUrl.replace(/\/+$/, "")}/SEMP/v2/monitor`;
  }

  private async getJson<T>(url: string): Promise<T> {
    await this.throttle();

    let response: Response;
    try {
      response = await fetch(url, { headers: { Authorization: this.authHeader() } });
    } catch (err) {
      throw new SempError(`SEMP request failed (network): ${url}`, err);
    }

    if (!response.ok) {
      throw new SempError(
        `SEMP request failed: HTTP ${response.status} ${response.statusText} (${url})`,
      );
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      throw new SempError(`Malformed SEMP reply (not valid JSON): ${url}`, err);
    }
  }

  /**
   * Fetches every page of a SEMP v2 collection endpoint (following
   * `meta.paging.nextPageUri` until it's no longer present) and returns the
   * combined `data` from every page.
   */
  private async getCollection<T>(url: string): Promise<T[]> {
    const items: T[] = [];
    let nextUrl: string | undefined = url;

    while (nextUrl) {
      const page: SempV2Page<T> = await this.getJson<SempV2Page<T>>(nextUrl);
      items.push(...page.data);
      nextUrl = page.meta?.paging?.nextPageUri;
    }

    return items;
  }

  /**
   * Fetches a full (all pages) collection under a given message VPN, e.g.
   * `getVpnCollection(vpn, "/queues")` or
   * `getVpnCollection(vpn, "/queues/my-queue/subscriptions")`. `path` must
   * already have its own segments URL-encoded (object names can contain
   * characters that need escaping - see encodeURIComponent calls in
   * queries.ts).
   */
  async getVpnCollection<T>(vpn: string, path: string): Promise<T[]> {
    const url = `${this.monitorBase()}/msgVpns/${encodeURIComponent(vpn)}${path}?count=100`;
    return this.getCollection<T>(url);
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    const wait = this.options.minRequestIntervalMs - elapsed;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    this.lastRequestAt = Date.now();
  }

  /**
   * Lightweight connection test for the Connect screen: fails with
   * SempError on wrong credentials/URL/network error, otherwise no error.
   * Plain `GET {baseUrl}/SEMP/v2/monitor` is deliberately chosen - it
   * returns broker-wide info (including the SolOS version, under
   * `data.version`) without needing any message-VPN-level permissions, the
   * same role SEMP v1's "show version" played here before.
   */
  async ping(): Promise<void> {
    await this.getJson(this.monitorBase());
  }
}

import { XMLParser } from "fast-xml-parser";
import type { SempClientOptions } from "./types.js";

/**
 * SEMP v1 (Legacy SEMP) is XML-RPC over HTTP with Basic Auth.
 * Reference: https://docs.solace.com/Admin/SEMP/Using-Legacy-SEMP.htm
 *
 * IMPORTANT (unverified against your specific SolOS version):
 * The exact structure of the paging mechanism ("more-cookie") can vary
 * slightly between broker versions. This implementation follows the
 * documented general principle: replies with >100 objects contain a
 * <more-cookie> element; it gets embedded verbatim into the next request
 * to fetch the next page. Please verify against a real broker (e.g. a
 * queue VPN with >100 queues) and adjust this file if needed - the rest
 * of the app is unaffected, since only this file touches raw XML.
 */

export class SempError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "SempError";
  }
}

export const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) =>
    // These elements typically appear as a list in SEMP v1 replies, even
    // when only 1 element comes back -> always treat as an array.
    ["queue", "topic-endpoint", "subscription"].includes(name),
});

export class SempV1Client {
  private lastRequestAt = 0;

  constructor(private readonly options: SempClientOptions) {}

  /**
   * Sends a SEMP v1 RPC request and returns the parsed rpc-reply object.
   * `bodyXml` is the content INSIDE <rpc>...</rpc> (without the rpc tag).
   */
  private async sendRpc(
    bodyXml: string,
  ): Promise<{ reply: Record<string, unknown>; rawXml: string }> {
    await this.throttle();

    const requestBody = `<rpc semp-version="soltr/1_0">${bodyXml}</rpc>`;
    const auth = Buffer.from(
      `${this.options.username}:${this.options.password}`,
    ).toString("base64");

    let response: Response;
    try {
      response = await fetch(this.options.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/xml",
          Authorization: `Basic ${auth}`,
        },
        body: requestBody,
      });
    } catch (err) {
      throw new SempError(
        `SEMP request failed (network): ${this.options.baseUrl}`,
        err,
      );
    }

    if (!response.ok) {
      throw new SempError(
        `SEMP request failed: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const xml = await response.text();
    const parsed = parser.parse(xml);
    const reply = parsed["rpc-reply"];
    if (!reply) {
      throw new SempError("Malformed SEMP reply: missing <rpc-reply>");
    }

    const execResult = reply["execute-result"];
    const resultCode = execResult?.["@_code"];
    if (resultCode && resultCode !== "ok") {
      throw new SempError(
        `SEMP command returned non-ok result: ${JSON.stringify(execResult)}`,
      );
    }

    return { reply, rawXml: xml };
  }

  /**
   * Fully executes a paginated "show" request (follows more-cookie until
   * no further page comes back) and returns all rpc-reply objects from the
   * individual pages for the caller to merge.
   *
   * The more-cookie is deliberately passed through as a RAW XML string
   * (not via the parsed JS object), so it gets sent back to the broker
   * exactly as it was received - regardless of how fast-xml-parser
   * structures it internally.
   */
  async sendPagedRpc(
    bodyXmlBuilder: (moreCookieXml: string | null) => string,
    maxPages = 50,
  ): Promise<Record<string, unknown>[]> {
    const pages: Record<string, unknown>[] = [];
    let moreCookieXml: string | null = null;

    for (let page = 0; page < maxPages; page++) {
      const { reply, rawXml } = await this.sendRpc(
        bodyXmlBuilder(moreCookieXml),
      );
      pages.push(reply);

      moreCookieXml = extractRawMoreCookie(rawXml);
      if (!moreCookieXml) break;
    }

    return pages;
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
   * "show version" is deliberately chosen because it exists on virtually
   * every SolOS version and doesn't need VPN-level permissions.
   */
  async ping(): Promise<void> {
    await this.sendRpc("<show><version/></show>");
  }
}

/** Extracts <more-cookie>...</more-cookie> unchanged from the raw reply XML. */
export function extractRawMoreCookie(rawXml: string): string | null {
  const match = rawXml.match(/<more-cookie>[\s\S]*?<\/more-cookie>/);
  return match ? match[0] : null;
}

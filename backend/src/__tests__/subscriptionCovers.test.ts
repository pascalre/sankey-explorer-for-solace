import { describe, expect, it } from "vitest";
import { subscriptionCovers } from "../semp/subscriptionCovers.js";

describe("subscriptionCovers", () => {
  it("a multi-level wildcard covers a more specific literal subscription", () => {
    expect(subscriptionCovers("acme/sales/>", "acme/sales/orders")).toBe(true);
  });

  it("is not symmetric: the literal does not cover the wildcard", () => {
    expect(subscriptionCovers("acme/sales/orders", "acme/sales/>")).toBe(false);
  });

  it("does not cover a sibling branch outside the wildcarded prefix", () => {
    expect(subscriptionCovers("acme/sales/>", "acme/support/tickets")).toBe(false);
  });

  it("a single-level wildcard covers a matching literal at that position", () => {
    expect(subscriptionCovers("acme/*/orders", "acme/sales/orders")).toBe(true);
  });

  it("an exact (non-wildcarded) filter only covers itself, not anything deeper", () => {
    expect(subscriptionCovers("acme/sales", "acme/sales/orders")).toBe(false);
  });

  it("two wildcards can nest (a broader '>' covers a narrower '>')", () => {
    expect(subscriptionCovers("acme/>", "acme/sales/>")).toBe(true);
  });
});

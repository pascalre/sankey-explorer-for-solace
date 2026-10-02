import { describe, expect, it } from "vitest";
import { subscriptionCovers } from "./subscriptionCovers";

describe("subscriptionCovers", () => {
  it("a multi-level wildcard covers a more specific literal subscription (the reported bug)", () => {
    expect(subscriptionCovers("acme/sales/>", "acme/sales/orders")).toBe(true);
  });

  it("covers arbitrarily deep literal topics under the wildcard", () => {
    expect(subscriptionCovers("acme/>", "acme/sales/orders/created")).toBe(true);
  });

  it("does not cover the wildcard's own exact prefix (\">\" requires >=1 more level)", () => {
    expect(subscriptionCovers("acme/sales/>", "acme/sales")).toBe(false);
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

  it("a single-level wildcard does not cover a different length topic", () => {
    expect(subscriptionCovers("acme/*/orders", "acme/sales/orders/created")).toBe(false);
  });

  it("a single-level wildcard does not cover a mismatched trailing segment", () => {
    expect(subscriptionCovers("acme/*/orders", "acme/sales/cancellations")).toBe(false);
  });

  it("an exact (non-wildcarded) filter only covers itself, not anything deeper", () => {
    expect(subscriptionCovers("acme/sales", "acme/sales/orders")).toBe(false);
  });

  it("an exact filter covers the identical topic", () => {
    expect(subscriptionCovers("acme/sales/orders", "acme/sales/orders")).toBe(true);
  });

  it("two different wildcards can nest (broader '>' covers a narrower '>')", () => {
    expect(subscriptionCovers("acme/>", "acme/sales/>")).toBe(true);
  });

  it("a narrower '>' is not covered by a same-depth non-'>' broader segment", () => {
    expect(subscriptionCovers("acme/sales/orders", "acme/sales/>")).toBe(false);
  });

  it("completely unrelated topics don't cover each other", () => {
    expect(subscriptionCovers("acme/sales/orders", "other/topic")).toBe(false);
  });
});

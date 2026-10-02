import { describe, expect, it } from "vitest";
import { assertValidConfig, buildConfig } from "../config.js";

function envWith(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return { SESSION_SECRET: "test-secret", ...overrides };
}

describe("buildConfig", () => {
  it("uses the given SESSION_SECRET when set", () => {
    const cfg = buildConfig(envWith({}));
    expect(cfg.app.sessionSecret).toBe("test-secret");
  });

  it("generates a random SESSION_SECRET when unset, instead of throwing - sessions are in-memory only anyway (see connectionStore.ts), so there's nothing to gain from requiring one up front", () => {
    const cfg = buildConfig({});
    expect(cfg.app.sessionSecret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates a DIFFERENT random secret on each call when unset", () => {
    expect(buildConfig({}).app.sessionSecret).not.toBe(buildConfig({}).app.sessionSecret);
  });

  it("also generates one when SESSION_SECRET is set but blank", () => {
    const cfg = buildConfig({ SESSION_SECRET: "   " });
    expect(cfg.app.sessionSecret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("defaults port and throttle interval when not set", () => {
    const cfg = buildConfig(envWith({}));
    expect(cfg.port).toBe(4000);
    expect(cfg.sempMinRequestIntervalMs).toBe(200);
  });

  it("uses PORT and SEMP_MIN_REQUEST_INTERVAL_MS when provided", () => {
    const cfg = buildConfig(envWith({ PORT: "8080", SEMP_MIN_REQUEST_INTERVAL_MS: "500" }));
    expect(cfg.port).toBe(8080);
    expect(cfg.sempMinRequestIntervalMs).toBe(500);
  });

  it("loginRequired is false when APP_USERNAME/APP_PASSWORD_HASH are both unset (workshop mode)", () => {
    const cfg = buildConfig(envWith({}));
    expect(cfg.loginRequired).toBe(false);
    expect(cfg.app.username).toBeNull();
    expect(cfg.app.passwordHash).toBeNull();
  });

  it("loginRequired is true when both APP_USERNAME and APP_PASSWORD_HASH are set", () => {
    const cfg = buildConfig(
      envWith({ APP_USERNAME: "admin", APP_PASSWORD_HASH: "$2b$12$abc" }),
    );
    expect(cfg.loginRequired).toBe(true);
  });

  it("isProduction reflects NODE_ENV", () => {
    expect(buildConfig(envWith({ NODE_ENV: "production" })).isProduction).toBe(true);
    expect(buildConfig(envWith({ NODE_ENV: "development" })).isProduction).toBe(false);
    expect(buildConfig(envWith({})).isProduction).toBe(false);
  });
});

describe("assertValidConfig", () => {
  it("does not throw when login is fully configured", () => {
    const cfg = buildConfig(
      envWith({ APP_USERNAME: "admin", APP_PASSWORD_HASH: "$2b$12$abc" }),
    );
    expect(() => assertValidConfig(cfg)).not.toThrow();
  });

  it("does not throw in workshop mode (both unset)", () => {
    const cfg = buildConfig(envWith({}));
    expect(() => assertValidConfig(cfg)).not.toThrow();
  });

  it("throws when only APP_USERNAME is set", () => {
    const cfg = buildConfig(envWith({ APP_USERNAME: "admin" }));
    expect(() => assertValidConfig(cfg)).toThrow(/must both be set/);
  });

  it("throws when only APP_PASSWORD_HASH is set", () => {
    const cfg = buildConfig(envWith({ APP_PASSWORD_HASH: "$2b$12$abc" }));
    expect(() => assertValidConfig(cfg)).toThrow(/must both be set/);
  });
});

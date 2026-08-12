import { describe, expect, it } from "vitest";
import { parseBrokerConfig, serializeBrokerConfig } from "./brokerConfig";
import type { BrokerConfigEntry } from "./brokerConfig";

const entry: BrokerConfigEntry = {
  baseUrl: "http://broker-host:8080/SEMP",
  vpn: "default",
  username: "ro-user",
  password: "s3cret",
  label: "EU-Broker",
};

describe("serializeBrokerConfig / parseBrokerConfig", () => {
  it("round-trips a single entry", () => {
    const yamlText = serializeBrokerConfig([entry]);
    expect(parseBrokerConfig(yamlText)).toEqual([entry]);
  });

  it("round-trips multiple entries", () => {
    const other: BrokerConfigEntry = {
      baseUrl: "http://other-host:8080/SEMP",
      vpn: "other-vpn",
      username: "u2",
      password: "p2",
    };
    const yamlText = serializeBrokerConfig([entry, other]);
    expect(parseBrokerConfig(yamlText)).toEqual([entry, other]);
  });

  it("round-trips values with special YAML characters (colons, quotes, unicode)", () => {
    const tricky: BrokerConfigEntry = {
      baseUrl: "http://broker-host:8080/SEMP",
      vpn: "default",
      username: "ro-user",
      password: `p@ss: "w0rd" # not-a-comment 'quote' üäö`,
      label: "EU-Broker: primary",
    };
    const yamlText = serializeBrokerConfig([tricky]);
    expect(parseBrokerConfig(yamlText)).toEqual([tricky]);
  });

  it("omits label when not set and parses it back as undefined", () => {
    const noLabel: BrokerConfigEntry = {
      baseUrl: entry.baseUrl,
      vpn: entry.vpn,
      username: entry.username,
      password: entry.password,
    };
    const yamlText = serializeBrokerConfig([noLabel]);
    expect(parseBrokerConfig(yamlText)).toEqual([noLabel]);
  });

  it("rejects invalid YAML", () => {
    expect(() => parseBrokerConfig("brokers: [this is not: valid: yaml")).toThrow(
      "Not a valid YAML file",
    );
  });

  it("rejects a document without a top-level 'brokers' list", () => {
    expect(() => parseBrokerConfig("foo: bar")).toThrow(
      "YAML must have a top-level 'brokers' list",
    );
  });

  it("rejects an empty brokers list", () => {
    expect(() => parseBrokerConfig("brokers: []")).toThrow(
      "'brokers' must be a non-empty list",
    );
  });

  it("rejects an entry missing a required field", () => {
    const yamlText = "brokers:\n  - baseUrl: http://x\n    vpn: v\n    username: u\n";
    expect(() => parseBrokerConfig(yamlText)).toThrow("brokers[0].password must be a non-empty string");
  });

  it("rejects an entry with a non-string label", () => {
    const yamlText =
      "brokers:\n  - baseUrl: http://x\n    vpn: v\n    username: u\n    password: p\n    label: 42\n";
    expect(() => parseBrokerConfig(yamlText)).toThrow("brokers[0].label must be a string");
  });
});

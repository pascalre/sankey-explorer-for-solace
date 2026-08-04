import { describe, expect, it } from "vitest";
import {
  addBrokerConnection,
  clearBrokerConnections,
  getBrokerConnectionsStatus,
  listBrokerConnections,
  parseHost,
  removeBrokerConnection,
} from "../semp/connectionStore.js";

// Each test uses its own random session id so tests can't leak state into
// each other via the shared module-level store.
function freshSessionId(): string {
  return `test-session-${Math.random().toString(36).slice(2)}`;
}

const validInput = {
  baseUrl: "http://localhost:8080/SEMP",
  vpn: "default",
  username: "ro",
  password: "x",
};

describe("addBrokerConnection / listBrokerConnections", () => {
  it("adding a connection makes it show up in the list", () => {
    const sessionId = freshSessionId();
    const status = addBrokerConnection(sessionId, validInput);

    expect(status.vpn).toBe("default");
    expect(status.baseUrl).toBe(validInput.baseUrl);
    expect(listBrokerConnections(sessionId)).toHaveLength(1);
  });

  it("defaults the label to the VPN name when none is given", () => {
    const sessionId = freshSessionId();
    const status = addBrokerConnection(sessionId, validInput);
    expect(status.label).toBe("default");
  });

  it("uses a custom label when provided, trimmed", () => {
    const sessionId = freshSessionId();
    const status = addBrokerConnection(sessionId, { ...validInput, label: "  EU-Broker  " });
    expect(status.label).toBe("EU-Broker");
  });

  it("adding a second connection does not overwrite the first (multi-broker)", () => {
    const sessionId = freshSessionId();
    addBrokerConnection(sessionId, { ...validInput, label: "A" });
    addBrokerConnection(sessionId, { ...validInput, label: "B" });

    const labels = listBrokerConnections(sessionId).map((c) => c.label);
    expect(labels).toEqual(["A", "B"]);
  });

  it("does not leak connections between different sessions", () => {
    const sessionA = freshSessionId();
    const sessionB = freshSessionId();
    addBrokerConnection(sessionA, validInput);

    expect(listBrokerConnections(sessionA)).toHaveLength(1);
    expect(listBrokerConnections(sessionB)).toHaveLength(0);
  });

  it("returns an empty array for a session with no connections", () => {
    expect(listBrokerConnections(freshSessionId())).toEqual([]);
  });
});

describe("getBrokerConnectionsStatus", () => {
  it("never includes credentials", () => {
    const sessionId = freshSessionId();
    addBrokerConnection(sessionId, validInput);

    const status = getBrokerConnectionsStatus(sessionId);
    const serialized = JSON.stringify(status);

    expect(serialized).not.toContain(validInput.username);
    expect(serialized).not.toContain(validInput.password);
  });
});

describe("removeBrokerConnection", () => {
  it("removes one connection, keeping the others", () => {
    const sessionId = freshSessionId();
    const a = addBrokerConnection(sessionId, { ...validInput, label: "A" });
    addBrokerConnection(sessionId, { ...validInput, label: "B" });

    const removed = removeBrokerConnection(sessionId, a.id);

    expect(removed).toBe(true);
    expect(listBrokerConnections(sessionId).map((c) => c.label)).toEqual(["B"]);
  });

  it("returns false for an id that does not exist", () => {
    const sessionId = freshSessionId();
    addBrokerConnection(sessionId, validInput);
    expect(removeBrokerConnection(sessionId, "does-not-exist")).toBe(false);
  });

  it("returns false for a session with no connections at all", () => {
    expect(removeBrokerConnection(freshSessionId(), "anything")).toBe(false);
  });
});

describe("clearBrokerConnections", () => {
  it("removes every connection for a session", () => {
    const sessionId = freshSessionId();
    addBrokerConnection(sessionId, { ...validInput, label: "A" });
    addBrokerConnection(sessionId, { ...validInput, label: "B" });

    clearBrokerConnections(sessionId);

    expect(listBrokerConnections(sessionId)).toEqual([]);
  });
});

describe("parseHost", () => {
  it("extracts host and port from a valid URL", () => {
    expect(parseHost("http://localhost:8080/SEMP")).toBe("localhost:8080");
  });

  it("extracts just the host when there is no explicit port", () => {
    expect(parseHost("https://broker.example.com/SEMP")).toBe("broker.example.com");
  });

  it("falls back to the raw string for an unparseable URL", () => {
    expect(parseHost("not a url")).toBe("not a url");
  });
});

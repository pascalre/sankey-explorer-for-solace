import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { requireAuth, requireBrokerConnection } from "../auth/middleware.js";
import { addBrokerConnection, clearBrokerConnections } from "../semp/connectionStore.js";

function fakeReqRes(overrides: { authenticated?: boolean; sessionID?: string } = {}) {
  const req = {
    session: { authenticated: overrides.authenticated },
    sessionID: overrides.sessionID ?? "fake-session",
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn();

  return { req, res, next };
}

describe("requireAuth", () => {
  it("calls next() without checking session when login is not required", () => {
    const { req, res, next } = fakeReqRes({ authenticated: false });

    requireAuth(req, res, next, { loginRequired: false });

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("calls next() when login is required and the session is authenticated", () => {
    const { req, res, next } = fakeReqRes({ authenticated: true });

    requireAuth(req, res, next, { loginRequired: true });

    expect(next).toHaveBeenCalledOnce();
  });

  it("responds 401 when login is required but the session is not authenticated", () => {
    const { req, res, next } = fakeReqRes({ authenticated: false });

    requireAuth(req, res, next, { loginRequired: true });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authenticated" });
  });
});

describe("requireBrokerConnection", () => {
  it("responds 400 when no broker is connected for this session", () => {
    const sessionId = `mw-test-${Math.random()}`;
    const { req, res, next } = fakeReqRes({ sessionID: sessionId });

    requireBrokerConnection(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Not connected to a broker" });
  });

  it("calls next() when at least one broker is connected for this session", () => {
    const sessionId = `mw-test-${Math.random()}`;
    addBrokerConnection(sessionId, {
      baseUrl: "http://localhost:8080/SEMP",
      vpn: "default",
      username: "ro",
      password: "x",
    });
    const { req, res, next } = fakeReqRes({ sessionID: sessionId });

    requireBrokerConnection(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();

    clearBrokerConnections(sessionId);
  });
});

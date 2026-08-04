import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

const TEST_PASSWORD = "correct-horse-battery-staple";

async function createLoginRequiredApp() {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4); // low cost factor - just for test speed
  vi.resetModules();
  process.env.APP_USERNAME = "admin";
  process.env.APP_PASSWORD_HASH = passwordHash;
  const { createServer } = await import("../server.js");
  return createServer();
}

afterEach(() => {
  delete process.env.APP_USERNAME;
  delete process.env.APP_PASSWORD_HASH;
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("login-required mode", () => {
  it("GET /api/session reports authRequired: true, authenticated: false before logging in", async () => {
    const app = await createLoginRequiredApp();
    const res = await request(app).get("/api/session");
    expect(res.body).toEqual({ authRequired: true, authenticated: false, brokers: [] });
  });

  it("rejects protected routes before login", async () => {
    const app = await createLoginRequiredApp();
    const res = await request.agent(app).get("/api/endpoints");
    expect(res.status).toBe(401);
  });

  it("rejects login with the wrong password", async () => {
    const app = await createLoginRequiredApp();
    const res = await request(app)
      .post("/api/login")
      .send({ username: "admin", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("rejects login with the wrong username", async () => {
    const app = await createLoginRequiredApp();
    const res = await request(app)
      .post("/api/login")
      .send({ username: "not-admin", password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it("rejects login with a missing username or password", async () => {
    const app = await createLoginRequiredApp();
    const res = await request(app).post("/api/login").send({ username: "admin" });
    expect(res.status).toBe(400);
  });

  it("accepts correct credentials and unlocks protected routes for that session", async () => {
    const app = await createLoginRequiredApp();
    const agent = request.agent(app);

    const loginRes = await agent
      .post("/api/login")
      .send({ username: "admin", password: TEST_PASSWORD });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toEqual({ authenticated: true });

    const sessionRes = await agent.get("/api/session");
    expect(sessionRes.body.authenticated).toBe(true);

    // Now connected + authenticated, /api/endpoints should get past the auth
    // gate (still 400 for "not connected to a broker", not 401 - proves the
    // auth check passed and it's a different, later gate that's firing).
    const endpointsRes = await agent.get("/api/endpoints");
    expect(endpointsRes.status).toBe(400);
    expect(endpointsRes.body.error).toBe("Not connected to a broker");
  });

  it("logging out clears the session, protected routes require login again", async () => {
    const app = await createLoginRequiredApp();
    const agent = request.agent(app);
    await agent.post("/api/login").send({ username: "admin", password: TEST_PASSWORD });

    await agent.post("/api/logout");

    const res = await agent.get("/api/endpoints");
    expect(res.status).toBe(401);
  });
});

import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { config } from "../config.js";
import { clearBrokerConnections, getBrokerConnectionsStatus } from "../semp/connectionStore.js";

export const authRouter = Router();

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20, // per IP - makes brute-forcing a shared password harder, not impossible
  standardHeaders: true,
  legacyHeaders: false,
});

/** Frontend checks this on startup: does it need a login screen, and which brokers are already connected? */
authRouter.get("/session", (req, res) => {
  res.json({
    authRequired: config.loginRequired,
    authenticated: config.loginRequired ? Boolean(req.session.authenticated) : true,
    brokers: getBrokerConnectionsStatus(req.sessionID),
  });
});

authRouter.post("/login", loginRateLimit, async (req, res) => {
  if (!config.loginRequired) {
    res.status(200).json({ authenticated: true });
    return;
  }

  const { username, password } = req.body as { username?: unknown; password?: unknown };
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  const usernameMatches = username === config.app.username;
  // Run bcrypt.compare even for a wrong username (constant time - no timing
  // oracle revealing whether the username exists).
  const passwordMatches = await bcrypt.compare(
    password,
    config.app.passwordHash ?? "",
  );

  if (!usernameMatches || !passwordMatches) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.authenticated = true;
  res.json({ authenticated: true });
});

authRouter.post("/logout", (req, res) => {
  clearBrokerConnections(req.sessionID);
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to log out" });
      return;
    }
    res.json({ authenticated: false });
  });
});

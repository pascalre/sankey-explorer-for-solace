import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../auth/middleware.js";
import { SempV1Client, SempError } from "../semp/client.js";
import {
  addBrokerConnection,
  clearBrokerConnections,
  getBrokerConnectionsStatus,
  removeBrokerConnection,
} from "../semp/connectionStore.js";
import { config } from "../config.js";

export const connectionRouter = Router();
connectionRouter.use(requireAuth);

const connectRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

interface ConnectBody {
  baseUrl?: unknown;
  vpn?: unknown;
  username?: unknown;
  password?: unknown;
  label?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** List of all broker connections in this session (a session can hold several). */
connectionRouter.get("/connection", (req, res) => {
  res.json(getBrokerConnectionsStatus(req.sessionID));
});

/** Adds a new broker connection - does NOT replace existing ones. */
connectionRouter.post("/connection", connectRateLimit, async (req, res) => {
  const { baseUrl, vpn, username, password, label } = req.body as ConnectBody;

  if (
    !isNonEmptyString(baseUrl) ||
    !isNonEmptyString(vpn) ||
    !isNonEmptyString(username) ||
    !isNonEmptyString(password)
  ) {
    res
      .status(400)
      .json({ error: "baseUrl, vpn, username and password are required" });
    return;
  }
  if (label !== undefined && typeof label !== "string") {
    res.status(400).json({ error: "label must be a string" });
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    res.status(400).json({ error: "baseUrl must be a valid URL" });
    return;
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    res.status(400).json({ error: "baseUrl must use http or https" });
    return;
  }

  const client = new SempV1Client({
    baseUrl,
    username,
    password,
    minRequestIntervalMs: config.sempMinRequestIntervalMs,
  });

  try {
    await client.ping();
  } catch (err) {
    const message =
      err instanceof SempError
        ? "Could not connect - check URL, VPN and credentials"
        : "Unexpected error while connecting";
    res.status(400).json({ error: message });
    return;
  }

  addBrokerConnection(req.sessionID, { baseUrl, vpn, username, password, label });
  res.json(getBrokerConnectionsStatus(req.sessionID));
});

/** Removes ONE broker connection by id, keeping the others. */
connectionRouter.delete("/connection/:id", (req, res) => {
  removeBrokerConnection(req.sessionID, req.params.id);
  res.json(getBrokerConnectionsStatus(req.sessionID));
});

/** Removes ALL broker connections in this session. */
connectionRouter.delete("/connection", (req, res) => {
  clearBrokerConnections(req.sessionID);
  res.json([]);
});

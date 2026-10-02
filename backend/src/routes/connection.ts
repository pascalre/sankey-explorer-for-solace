import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../auth/middleware.js";
import { SempV2Client, SempError } from "../semp/client.js";
import {
  addBrokerConnection,
  clearBrokerConnections,
  getBrokerConnectionsStatus,
  removeBrokerConnection,
} from "../semp/connectionStore.js";
import { config } from "../config.js";
import { logError, logInfo } from "../logger.js";

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

  const client = new SempV2Client({
    baseUrl,
    username,
    password,
    minRequestIntervalMs: config.sempMinRequestIntervalMs,
  });

  // Never include `password` in a log line below - see logger.ts.
  const connectionDesc = `${baseUrl} (vpn=${vpn}, username=${username}${label ? `, label=${label}` : ""})`;

  try {
    await client.ping();
  } catch (err) {
    // The message returned to the Connect screen deliberately includes the
    // actual SEMP/network failure reason (HTTP status, DNS/connection
    // refused, etc.) rather than a generic string - whoever is entering
    // credentials for a customer's broker needs that detail to debug a
    // failed connection, and it's the same detail /api/endpoints and
    // /api/sankey-edges already surface for query failures further down
    // the line. It's also always logged server-side (see logger.ts doc
    // comment on why that matters for this deployment model).
    const message = err instanceof SempError ? `Could not connect: ${err.message}` : "Unexpected error while connecting";
    logError(`Connection attempt failed for ${connectionDesc}`, err);
    res.status(400).json({ error: message });
    return;
  }

  addBrokerConnection(req.sessionID, { baseUrl, vpn, username, password, label });
  logInfo(`Connected to ${connectionDesc}`);
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

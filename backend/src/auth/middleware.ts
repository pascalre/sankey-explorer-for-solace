import type { NextFunction, Request, Response } from "express";
import { config, type AppConfig } from "../config.js";
import { listBrokerConnections } from "../semp/connectionStore.js";

declare module "express-session" {
  interface SessionData {
    authenticated?: boolean;
  }
}

/**
 * Only kicks in when APP_USERNAME/APP_PASSWORD_HASH are set (see config.ts).
 * In "workshop mode" (both empty) this middleware always lets requests
 * through - the customer's network boundary is then the only access control.
 *
 * The 4th parameter exists purely for testability: Express always calls
 * middleware with exactly 3 arguments, so in production this is always the
 * real singleton config - but a test can call requireAuth(req, res, next,
 * fakeConfig) directly to exercise both branches without mutating shared
 * module state.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
  cfg: Pick<AppConfig, "loginRequired"> = config,
): void {
  if (!cfg.loginRequired) {
    next();
    return;
  }
  if (req.session.authenticated) {
    next();
    return;
  }
  res.status(401).json({ error: "Not authenticated" });
}

/**
 * Gate for every route that needs at least one active broker connection
 * (endpoints query, sankey export). 400, not 401 - login and broker
 * connection are independent states. A session can have several broker
 * connections at once (see connectionStore.ts), so this just checks the
 * list isn't empty.
 */
export function requireBrokerConnection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (listBrokerConnections(req.sessionID).length === 0) {
    res.status(400).json({ error: "Not connected to a broker" });
    return;
  }
  next();
}

import { Router } from "express";
import { requireAuth, requireBrokerConnection } from "../auth/middleware.js";
import { listBrokerConnections } from "../semp/connectionStore.js";
import { fetchEndpointsAcrossConnections } from "../semp/queries.js";
import { SempError } from "../semp/client.js";

export const endpointsRouter = Router();

endpointsRouter.get(
  "/endpoints",
  requireAuth,
  requireBrokerConnection,
  async (req, res) => {
    // requireBrokerConnection has already verified at least one exists.
    const connections = listBrokerConnections(req.sessionID);

    try {
      // Fail-fast: if any one broker's query fails, the whole request fails
      // (502). A future improvement could degrade gracefully (return the
      // brokers that succeeded, flag the ones that didn't), but that needs
      // its own response shape - not worth the complexity yet.
      const endpoints = await fetchEndpointsAcrossConnections(connections);
      res.json(endpoints);
    } catch (err) {
      const message = err instanceof SempError ? err.message : "Unexpected error";
      res.status(502).json({ error: message });
    }
  },
);

import { Router } from "express";
import { requireAuth, requireBrokerConnection } from "../auth/middleware.js";
import { listBrokerConnections } from "../semp/connectionStore.js";
import { fetchEndpointsAcrossConnections } from "../semp/queries.js";
import { toSankeyEdges } from "../semp/toSankeyEdges.js";
import { SempError } from "../semp/client.js";

export const sankeyRouter = Router();

sankeyRouter.get(
  "/sankey-edges",
  requireAuth,
  requireBrokerConnection,
  async (req, res) => {
    const connections = listBrokerConnections(req.sessionID);

    try {
      const endpoints = await fetchEndpointsAcrossConnections(connections);
      res.json(toSankeyEdges(endpoints));
    } catch (err) {
      const message = err instanceof SempError ? err.message : "Unexpected error";
      res.status(502).json({ error: message });
    }
  },
);

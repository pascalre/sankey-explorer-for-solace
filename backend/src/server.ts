import express from "express";
import session from "express-session";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { connectionRouter } from "./routes/connection.js";
import { endpointsRouter } from "./routes/endpoints.js";
import { sankeyRouter } from "./routes/sankey.js";
import { logError } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In the built image, the frontend dist sits next to the backend's dist -
// see Dockerfile. Path is deliberately relative to this file, not cwd.
const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");

export function createServer() {
  const app = express();

  // Usually runs behind a reverse proxy/Cloud Run - needed so secure
  // cookies and rate limiting see the real client IP/protocol.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));

  app.use(
    session({
      name: "sankey.sid",
      secret: config.app.sessionSecret,
      resave: false,
      // true: creates a session for every visitor (needed so the broker
      // connection can be reliably associated even before any login).
      // Switch to a MemoryStore TTL/Redis if needed (memory growth in
      // workshop mode without login) - see TODO in connectionStore.ts.
      saveUninitialized: true,
      cookie: {
        httpOnly: true,
        // "auto": Secure is set based on the ACTUAL request (req.secure,
        // which honors "trust proxy" + X-Forwarded-Proto above) - not just
        // NODE_ENV. This app is meant to also just work with a plain
        // `docker run -p 4000:4000 ...` and no reverse proxy/TLS at all
        // (see README "Quickest way to run it") - a hardcoded `secure:
        // true` there would make the browser silently drop the session
        // cookie on every non-HTTPS, non-"localhost" origin, so the broker
        // connection would "work" (POST succeeds) but immediately vanish
        // ("Not connected to a broker" on the very next request). "auto"
        // still sets Secure correctly when a real reverse proxy/Cloud Run
        // terminates TLS in front of this.
        secure: "auto",
        sameSite: "lax",
        maxAge: 8 * 60 * 60 * 1000, // 8h - one workshop/work session
      },
    }),
  );

  app.get("/healthz", (_req, res) => res.status(200).send("ok"));

  app.use("/api", authRouter);
  app.use("/api", connectionRouter);
  app.use("/api", endpointsRouter);
  app.use("/api", sankeyRouter);

  if (config.isProduction) {
    app.use(express.static(FRONTEND_DIST));
    // SPA fallback for client-side routing - everything except /api/* serves index.html
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(FRONTEND_DIST, "index.html"));
    });
  }

  // Central error handler: never leak stack traces/internals to the client.
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction,
    ) => {
      logError("Unhandled error", err);
      res.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}

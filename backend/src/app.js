import express from "express";
import authRouter from "./routes/auth.js";
import serversRouter from "./routes/servers.js";
import reportsRouter from "./routes/reports.js";

// Separated from index.js so tests can exercise the app without binding a
// port or going through the real startup sequence.
export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  // All three routers share this /api/v1 prefix, so Express tries them in
  // this order for every request. Because of that, none of them may use a
  // path-unfiltered router.use(someAuthMiddleware) — that would intercept
  // requests meant for a sibling router before Express gets a chance to
  // check whether a route actually matches (this bit us once with
  // serversRouter and POST /reports; see the comment in routes/servers.js).
  // Auth middleware belongs on each route individually.
  app.use("/api/v1", authRouter);
  app.use("/api/v1", serversRouter);
  app.use("/api/v1", reportsRouter);

  // Keeps error responses JSON instead of Express's default HTML error page.
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}

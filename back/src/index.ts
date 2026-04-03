import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { loadConfig } from "./config.js";
import { sendErr } from "./lib/apiEnvelope.js";
import { apiV1Router } from "./routes/apiV1.js";
import { startPoller } from "./services/poller.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const c = loadConfig();

app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(express.json({ limit: "64kb" }));
app.use(
  cors({
    origin: c.FRONTEND_URL === "*" ? "*" : c.FRONTEND_URL.split(",").map((s) => s.trim()),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  })
);
app.use(
  morgan(c.NODE_ENV === "production" ? "combined" : "dev", {
    skip: () => c.NODE_ENV === "test"
  })
);
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: c.RATE_LIMIT_PER_MIN,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get("/ping", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

if (c.NODE_ENV !== "production") {
  app.get("/", (_req, res) => {
    res.status(200).json({
      service: "mc-monitor-server",
      message: "Use GET /api/v1/status",
      endpoints: ["/ping", "/api/v1/health", "/api/v1/status", "/api/v1/meta"]
    });
  });
  app.head("/", (_req, res) => {
    res.status(200).end();
  });
}

app.use("/api/v1", apiV1Router);

const webDist = path.join(__dirname, "../../front/dist");
if (c.NODE_ENV === "production") {
  app.use(express.static(webDist, { index: false }));
  app.get(/^(?!\/api).*/, (req, res, next) => {
    if (req.path.includes(".")) return next();
    res.sendFile(path.join(webDist, "index.html"), (err) => {
      if (err) next(err);
    });
  });
}

app.use((_req, res) => {
  sendErr(res, 404, "NOT_FOUND", "Route not found");
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  sendErr(
    res,
    500,
    "INTERNAL_ERROR",
    "Unexpected server error",
    err instanceof Error ? err.message : String(err)
  );
});

const PORT = c.PORT;
app.listen(PORT, () => {
  console.log(JSON.stringify({ level: "info", msg: "Server running", port: PORT, env: c.NODE_ENV }));
  startPoller();
});

import express from "express";
import cors from "cors";
import path from "path";
import routes from "./routes";
import { env } from "./config/env";
import { errorHandler, notFound } from "./middlewares/errorMiddleware";
import { requestLogger, rateLimit } from "./middlewares/securityMiddleware";

const app = express();

const configuredOrigins = env.CLIENT_URL
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  ...configuredOrigins,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "https://labmanagementpbn.netlify.app"
]);

const isAllowedOrigin = (origin?: string) => {
  if (!origin) return true;
  if (env.NODE_ENV === "development") return true;
  if (allowedOrigins.has(origin)) return true;

  try {
    const parsed = new URL(origin);
    const isVercelHost = parsed.hostname.endsWith(".vercel.app");
    const isNetlifyHost = parsed.hostname.endsWith(".netlify.app") || parsed.hostname.endsWith(".netlify.com");
    if (isVercelHost || isNetlifyHost) {
      return true;
    }

    const isLocalHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const port = Number(parsed.port);
    if (isLocalHost && Number.isFinite(port) && port >= 5173 && port <= 5199) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS not allowed"));
    }
  })
);
app.use(requestLogger);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.resolve("uploads")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", rateLimit({ windowMs: 60_000, max: 300, keyPrefix: "api" }), routes);
app.use("/api/v1", rateLimit({ windowMs: 60_000, max: 300, keyPrefix: "api-v1" }), routes);
app.use(notFound);
app.use(errorHandler);

export default app;

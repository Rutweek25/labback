import http from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import app from "./app";
import { env } from "./config/env";
import { setSocketServer } from "./config/socket";

const server = http.createServer(app);

const configuredOrigins = env.CLIENT_URL
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const netlifyOriginPattern = /(?:^|\.)netlify\.(?:app|com)$/i;

const isAllowedOrigin = (origin?: string) => {
  if (!origin) {
    return true;
  }

  if (configuredOrigins.includes(origin)) {
    return true;
  }

  if (localhostOriginPattern.test(origin)) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    return netlifyOriginPattern.test(parsed.hostname);
  } catch {
    return false;
  }
};

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Socket CORS blocked for origin: ${origin || "unknown"}`));
    },
    credentials: true
  },
  transports: ["websocket", "polling"],
  allowEIO3: true
});

io.on("connection", (socket) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as { id: string; role: string };
      socket.join(`role:${decoded.role}`);
      socket.join(`user:${decoded.id}`);
    } catch (_error) {
      // invalid token: keep anonymous socket for public health only
    }
  }

  socket.on("disconnect", () => {
    // no-op
  });
});

import { prisma } from "./config/prisma";

setSocketServer(io);

prisma
  .$connect()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log("Database connected successfully");
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Database initial connection error:", err);
  });

server.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${env.PORT}`);
});

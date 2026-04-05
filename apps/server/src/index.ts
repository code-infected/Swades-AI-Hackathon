import { serve } from "@hono/node-server";
import { env } from "@my-better-t-app/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { recordingsRouter } from "./routes/recordings";
import { chunksRouter } from "./routes/chunks";
import { transcribeRouter } from "./routes/transcribe";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);

// Health check
app.get("/", (c) => {
  return c.json({ status: "ok", service: "transcription-api" });
});

// API routes
app.route("/api/recordings", recordingsRouter);
app.route("/api/chunks", chunksRouter);
app.route("/api/transcribe", transcribeRouter);

const port = Number(process.env.PORT) || 3000;

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running on port ${port}`);

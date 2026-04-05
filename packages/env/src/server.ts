import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    
    // Deepgram API for transcription
    DEEPGRAM_API_KEY: z.string().min(1),
    
    // Storage path for audio chunks (local filesystem)
    STORAGE_PATH: z.string().default("./storage"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

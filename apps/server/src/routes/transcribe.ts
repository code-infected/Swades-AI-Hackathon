import { Hono } from "hono";
import { db } from "@my-better-t-app/db";
import { recordings } from "@my-better-t-app/db/schema";
import { eq } from "drizzle-orm";
import { transcribeRecording } from "../services/transcription";

const transcribeRouter = new Hono();

// Trigger transcription for a recording
transcribeRouter.post("/:recordingId", async (c) => {
  const recordingId = c.req.param("recordingId");

  // Verify recording exists and is ready
  const recording = await db.query.recordings.findFirst({
    where: eq(recordings.id, recordingId),
  });

  if (!recording) {
    return c.json({ success: false, error: "Recording not found" }, 404);
  }

  if (recording.status === "transcribing") {
    return c.json({ success: false, error: "Transcription already in progress" }, 400);
  }

  if (recording.status === "completed") {
    return c.json({ success: false, error: "Recording already transcribed" }, 400);
  }

  // Start transcription (run in background, return immediately)
  const transcriptionPromise = transcribeRecording(recordingId);

  // For batch mode, we wait for completion
  const result = await transcriptionPromise;

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 500);
  }

  return c.json({
    success: true,
    message: "Transcription completed",
    totalSegments: result.totalSegments,
    totalDurationMs: result.totalDurationMs,
  });
});

// Get transcription status
transcribeRouter.get("/:recordingId/status", async (c) => {
  const recordingId = c.req.param("recordingId");

  const recording = await db.query.recordings.findFirst({
    where: eq(recordings.id, recordingId),
  });

  if (!recording) {
    return c.json({ success: false, error: "Recording not found" }, 404);
  }

  return c.json({
    success: true,
    status: recording.status,
    errorMessage: recording.errorMessage,
  });
});

export { transcribeRouter };

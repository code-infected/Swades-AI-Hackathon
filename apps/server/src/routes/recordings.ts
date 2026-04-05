import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@my-better-t-app/db";
import { recordings, audioChunks, transcripts, speakers } from "@my-better-t-app/db/schema";
import { eq, asc } from "drizzle-orm";

const recordingsRouter = new Hono();

// Create a new recording session
recordingsRouter.post(
  "/",
  zValidator(
    "json",
    z.object({
      name: z.string().optional(),
    })
  ),
  async (c) => {
    const { name } = c.req.valid("json");

    const [recording] = await db
      .insert(recordings)
      .values({
        name: name ?? `Recording ${new Date().toISOString()}`,
        status: "recording",
      })
      .returning();

    return c.json({ success: true, recording });
  }
);

// Get recording by ID
recordingsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");

  const recording = await db.query.recordings.findFirst({
    where: eq(recordings.id, id),
  });

  if (!recording) {
    return c.json({ success: false, error: "Recording not found" }, 404);
  }

  // Get chunks count
  const chunks = await db.query.audioChunks.findMany({
    where: eq(audioChunks.recordingId, id),
  });

  const uploadedChunks = chunks.filter((chunk) => chunk.uploadConfirmed).length;
  const transcribedChunks = chunks.filter((chunk) => chunk.transcribed).length;

  return c.json({
    success: true,
    recording: {
      ...recording,
      chunksTotal: chunks.length,
      chunksUploaded: uploadedChunks,
      chunksTranscribed: transcribedChunks,
    },
  });
});

// List all recordings
recordingsRouter.get("/", async (c) => {
  const allRecordings = await db.query.recordings.findMany({
    orderBy: (recs, { desc }) => [desc(recs.createdAt)],
  });

  return c.json({ success: true, recordings: allRecordings });
});

// Update recording status (e.g., mark as uploading, completed)
recordingsRouter.patch(
  "/:id",
  zValidator(
    "json",
    z.object({
      status: z.enum(["recording", "uploading", "transcribing", "completed", "failed"]).optional(),
      name: z.string().optional(),
      totalDurationMs: z.number().optional(),
      totalChunks: z.number().optional(),
      errorMessage: z.string().optional(),
    })
  ),
  async (c) => {
    const id = c.req.param("id");
    const updates = c.req.valid("json");

    const [updated] = await db
      .update(recordings)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(recordings.id, id))
      .returning();

    if (!updated) {
      return c.json({ success: false, error: "Recording not found" }, 404);
    }

    return c.json({ success: true, recording: updated });
  }
);

// Delete recording
recordingsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const [deleted] = await db
    .delete(recordings)
    .where(eq(recordings.id, id))
    .returning();

  if (!deleted) {
    return c.json({ success: false, error: "Recording not found" }, 404);
  }

  return c.json({ success: true });
});

// Get transcript for a recording
recordingsRouter.get("/:id/transcript", async (c) => {
  const id = c.req.param("id");

  const recording = await db.query.recordings.findFirst({
    where: eq(recordings.id, id),
  });

  if (!recording) {
    return c.json({ success: false, error: "Recording not found" }, 404);
  }

  // Get all transcript segments ordered by time
  const segments = await db.query.transcripts.findMany({
    where: eq(transcripts.recordingId, id),
    orderBy: [asc(transcripts.startTimeMs)],
  });

  // Get speakers
  const recordingSpeakers = await db.query.speakers.findMany({
    where: eq(speakers.recordingId, id),
  });

  // Create speaker map for display names
  const speakerMap = new Map(
    recordingSpeakers.map((s) => [
      `speaker_${s.speakerIndex}`,
      s.displayName ?? `Speaker ${s.speakerIndex + 1}`,
    ])
  );

  // Format transcript with speaker names
  const formattedSegments = segments.map((seg) => ({
    ...seg,
    speakerName: seg.speakerId ? speakerMap.get(seg.speakerId) ?? seg.speakerId : null,
  }));

  return c.json({
    success: true,
    recording,
    transcript: formattedSegments,
    speakers: recordingSpeakers,
  });
});

export { recordingsRouter };

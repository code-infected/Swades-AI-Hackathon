import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@my-better-t-app/db";
import { audioChunks, recordings } from "@my-better-t-app/db/schema";
import { eq } from "drizzle-orm";
import { env } from "@my-better-t-app/env/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const chunksRouter = new Hono();

// Upload a chunk for a recording
chunksRouter.post(
  "/:recordingId",
  zValidator(
    "form",
    z.object({
      sequenceNumber: z.string().transform(Number),
      durationMs: z.string().transform(Number),
    })
  ),
  async (c) => {
    const recordingId = c.req.param("recordingId");
    const { sequenceNumber, durationMs } = c.req.valid("form");

    // Verify recording exists
    const recording = await db.query.recordings.findFirst({
      where: eq(recordings.id, recordingId),
    });

    if (!recording) {
      return c.json({ success: false, error: "Recording not found" }, 404);
    }

    // Get the audio file from form data
    const formData = await c.req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return c.json({ success: false, error: "No audio file provided" }, 400);
    }

    // Create storage directory if it doesn't exist
    const storagePath = env.STORAGE_PATH;
    const recordingDir = join(storagePath, recordingId);
    await mkdir(recordingDir, { recursive: true });

    // Save file to disk
    const fileName = `chunk_${String(sequenceNumber).padStart(5, "0")}.wav`;
    const filePath = join(recordingDir, fileName);
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await writeFile(filePath, buffer);

    // Insert chunk record with confirmation
    const [chunk] = await db
      .insert(audioChunks)
      .values({
        recordingId,
        sequenceNumber,
        durationMs,
        filePath,
        fileSize: buffer.length,
        uploadConfirmed: true,
      })
      .returning();

    // Update recording's total chunks count
    await db
      .update(recordings)
      .set({
        totalChunks: (recording.totalChunks ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(recordings.id, recordingId));

    return c.json({
      success: true,
      chunk: {
        id: chunk.id,
        sequenceNumber: chunk.sequenceNumber,
        uploadConfirmed: chunk.uploadConfirmed,
      },
    });
  }
);

// Get all chunks for a recording
chunksRouter.get("/:recordingId", async (c) => {
  const recordingId = c.req.param("recordingId");

  const chunks = await db.query.audioChunks.findMany({
    where: eq(audioChunks.recordingId, recordingId),
    orderBy: (chunks, { asc }) => [asc(chunks.sequenceNumber)],
  });

  return c.json({
    success: true,
    chunks: chunks.map((chunk) => ({
      id: chunk.id,
      sequenceNumber: chunk.sequenceNumber,
      durationMs: chunk.durationMs,
      uploadConfirmed: chunk.uploadConfirmed,
      transcribed: chunk.transcribed,
    })),
  });
});

// Verify chunk upload (for reconciliation)
chunksRouter.get("/:recordingId/:chunkId/verify", async (c) => {
  const { recordingId, chunkId } = c.req.param();

  const chunk = await db.query.audioChunks.findFirst({
    where: eq(audioChunks.id, chunkId),
  });

  if (!chunk || chunk.recordingId !== recordingId) {
    return c.json({ success: false, exists: false });
  }

  // Check if file exists on disk
  let fileExists = false;
  if (chunk.filePath) {
    try {
      const file = Bun.file(chunk.filePath);
      fileExists = await file.exists();
    } catch {
      fileExists = false;
    }
  }

  return c.json({
    success: true,
    exists: true,
    uploadConfirmed: chunk.uploadConfirmed,
    fileExists,
    needsReupload: chunk.uploadConfirmed && !fileExists,
  });
});

export { chunksRouter };

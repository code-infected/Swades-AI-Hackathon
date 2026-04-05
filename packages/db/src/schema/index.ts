import { pgTable, text, integer, boolean, timestamp, real, uuid } from "drizzle-orm/pg-core";

// Recording sessions
export const recordings = pgTable("recordings", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  status: text("status").notNull().default("recording"), // recording, uploading, transcribing, completed, failed
  totalDurationMs: integer("total_duration_ms"),
  totalChunks: integer("total_chunks").default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Audio chunks with acknowledgment tracking
export const audioChunks = pgTable("audio_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordingId: uuid("recording_id").notNull().references(() => recordings.id, { onDelete: "cascade" }),
  sequenceNumber: integer("sequence_number").notNull(),
  durationMs: integer("duration_ms").notNull(),
  filePath: text("file_path"), // Local storage path
  fileSize: integer("file_size"), // Bytes
  uploadConfirmed: boolean("upload_confirmed").notNull().default(false),
  transcribed: boolean("transcribed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Transcription results - word-level for accuracy
export const transcripts = pgTable("transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordingId: uuid("recording_id").notNull().references(() => recordings.id, { onDelete: "cascade" }),
  chunkId: uuid("chunk_id").references(() => audioChunks.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  confidence: real("confidence"), // 0-1 confidence score
  startTimeMs: integer("start_time_ms"),
  endTimeMs: integer("end_time_ms"),
  speakerId: text("speaker_id"), // "speaker_0", "speaker_1", etc.
  wordCount: integer("word_count"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Identified speakers for renaming
export const speakers = pgTable("speakers", {
  id: text("id").primaryKey(), // "recording_uuid:speaker_0"
  recordingId: uuid("recording_id").notNull().references(() => recordings.id, { onDelete: "cascade" }),
  speakerIndex: integer("speaker_index").notNull(), // 0, 1, 2...
  displayName: text("display_name"), // User can rename: "John", "Sarah"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Types for use in application
export type Recording = typeof recordings.$inferSelect;
export type NewRecording = typeof recordings.$inferInsert;
export type AudioChunk = typeof audioChunks.$inferSelect;
export type NewAudioChunk = typeof audioChunks.$inferInsert;
export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
export type Speaker = typeof speakers.$inferSelect;
export type NewSpeaker = typeof speakers.$inferInsert;

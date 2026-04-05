import { createClient } from "@deepgram/sdk";
import { env } from "@my-better-t-app/env/server";
import { db } from "@my-better-t-app/db";
import { audioChunks, recordings, transcripts, speakers } from "@my-better-t-app/db/schema";
import { eq, asc } from "drizzle-orm";
import { readFile } from "node:fs/promises";

// Initialize Deepgram client
const deepgram = createClient(env.DEEPGRAM_API_KEY);

interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
}

interface TranscriptionResult {
  success: boolean;
  words: TranscriptionWord[];
  speakers: number[];
  duration: number;
  error?: string;
}

// Transcribe a single audio file
async function transcribeAudioFile(filePath: string): Promise<TranscriptionResult> {
  try {
    const audioBuffer = await readFile(filePath);

    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: "nova-2", // Best accuracy model
        language: "en",
        smart_format: true,
        punctuate: true,
        diarize: true, // Speaker diarization
        utterances: true,
        paragraphs: true,
      }
    );

    if (error) {
      return {
        success: false,
        words: [],
        speakers: [],
        duration: 0,
        error: error.message,
      };
    }

    const channel = result.results?.channels[0];
    const alternative = channel?.alternatives[0];

    if (!alternative) {
      return {
        success: false,
        words: [],
        speakers: [],
        duration: 0,
        error: "No transcription results",
      };
    }

    const words: TranscriptionWord[] = alternative.words?.map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: w.confidence,
      speaker: w.speaker,
    })) ?? [];

    // Extract unique speakers
    const speakerSet = new Set<number>();
    for (const word of words) {
      if (word.speaker !== undefined) {
        speakerSet.add(word.speaker);
      }
    }

    return {
      success: true,
      words,
      speakers: [...speakerSet].sort((a, b) => a - b),
      duration: result.metadata?.duration ?? 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown transcription error";
    return {
      success: false,
      words: [],
      speakers: [],
      duration: 0,
      error: message,
    };
  }
}

// Group words into segments by speaker and time gaps
function groupWordsIntoSegments(
  words: TranscriptionWord[],
  chunkOffsetMs: number
): Array<{
  content: string;
  speakerId: string | null;
  startTimeMs: number;
  endTimeMs: number;
  confidence: number;
  wordCount: number;
}> {
  if (words.length === 0) return [];

  const segments: Array<{
    content: string;
    speakerId: string | null;
    startTimeMs: number;
    endTimeMs: number;
    confidence: number;
    wordCount: number;
  }> = [];

  let currentSegment: {
    words: string[];
    speaker: number | undefined;
    startTime: number;
    endTime: number;
    confidences: number[];
  } | null = null;

  const MAX_GAP_SECONDS = 1.5; // Start new segment after 1.5s gap

  for (const word of words) {
    const shouldStartNew =
      !currentSegment ||
      word.speaker !== currentSegment.speaker ||
      word.start - currentSegment.endTime > MAX_GAP_SECONDS;

    if (shouldStartNew) {
      // Save previous segment
      if (currentSegment && currentSegment.words.length > 0) {
        const avgConfidence =
          currentSegment.confidences.reduce((a, b) => a + b, 0) /
          currentSegment.confidences.length;

        segments.push({
          content: currentSegment.words.join(" "),
          speakerId: currentSegment.speaker !== undefined ? `speaker_${currentSegment.speaker}` : null,
          startTimeMs: Math.round(currentSegment.startTime * 1000) + chunkOffsetMs,
          endTimeMs: Math.round(currentSegment.endTime * 1000) + chunkOffsetMs,
          confidence: avgConfidence,
          wordCount: currentSegment.words.length,
        });
      }

      // Start new segment
      currentSegment = {
        words: [word.word],
        speaker: word.speaker,
        startTime: word.start,
        endTime: word.end,
        confidences: [word.confidence],
      };
    } else if (currentSegment) {
      // Continue current segment
      currentSegment.words.push(word.word);
      currentSegment.endTime = word.end;
      currentSegment.confidences.push(word.confidence);
    }
  }

  // Don't forget the last segment
  if (currentSegment && currentSegment.words.length > 0) {
    const avgConfidence =
      currentSegment.confidences.reduce((a, b) => a + b, 0) /
      currentSegment.confidences.length;

    segments.push({
      content: currentSegment.words.join(" "),
      speakerId: currentSegment.speaker !== undefined ? `speaker_${currentSegment.speaker}` : null,
      startTimeMs: Math.round(currentSegment.startTime * 1000) + chunkOffsetMs,
      endTimeMs: Math.round(currentSegment.endTime * 1000) + chunkOffsetMs,
      confidence: avgConfidence,
      wordCount: currentSegment.words.length,
    });
  }

  return segments;
}

// Transcribe all chunks for a recording
export async function transcribeRecording(recordingId: string): Promise<{
  success: boolean;
  error?: string;
  totalSegments: number;
  totalDurationMs: number;
}> {
  // Update recording status
  await db
    .update(recordings)
    .set({ status: "transcribing", updatedAt: new Date() })
    .where(eq(recordings.id, recordingId));

  try {
    // Get all chunks ordered by sequence
    const chunks = await db.query.audioChunks.findMany({
      where: eq(audioChunks.recordingId, recordingId),
      orderBy: [asc(audioChunks.sequenceNumber)],
    });

    if (chunks.length === 0) {
      await db
        .update(recordings)
        .set({ status: "failed", errorMessage: "No chunks found", updatedAt: new Date() })
        .where(eq(recordings.id, recordingId));

      return { success: false, error: "No chunks found", totalSegments: 0, totalDurationMs: 0 };
    }

    let cumulativeOffsetMs = 0;
    let totalSegments = 0;
    const allSpeakers = new Set<number>();

    // Process each chunk
    for (const chunk of chunks) {
      if (!chunk.filePath) {
        continue;
      }

      const result = await transcribeAudioFile(chunk.filePath);

      if (!result.success) {
        // Log error but continue with other chunks
        continue;
      }

      // Track speakers
      for (const speaker of result.speakers) {
        allSpeakers.add(speaker);
      }

      // Group words into segments
      const segments = groupWordsIntoSegments(result.words, cumulativeOffsetMs);

      // Insert transcript segments
      if (segments.length > 0) {
        await db.insert(transcripts).values(
          segments.map((seg) => ({
            recordingId,
            chunkId: chunk.id,
            content: seg.content,
            confidence: seg.confidence,
            startTimeMs: seg.startTimeMs,
            endTimeMs: seg.endTimeMs,
            speakerId: seg.speakerId,
            wordCount: seg.wordCount,
          }))
        );
        totalSegments += segments.length;
      }

      // Mark chunk as transcribed
      await db
        .update(audioChunks)
        .set({ transcribed: true })
        .where(eq(audioChunks.id, chunk.id));

      // Update offset for next chunk
      cumulativeOffsetMs += chunk.durationMs;
    }

    // Create speaker records
    for (const speakerIndex of allSpeakers) {
      await db
        .insert(speakers)
        .values({
          id: `${recordingId}:speaker_${speakerIndex}`,
          recordingId,
          speakerIndex,
          displayName: `Speaker ${speakerIndex + 1}`,
        })
        .onConflictDoNothing();
    }

    // Update recording as completed
    await db
      .update(recordings)
      .set({
        status: "completed",
        totalDurationMs: cumulativeOffsetMs,
        updatedAt: new Date(),
      })
      .where(eq(recordings.id, recordingId));

    return {
      success: true,
      totalSegments,
      totalDurationMs: cumulativeOffsetMs,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    await db
      .update(recordings)
      .set({ status: "failed", errorMessage, updatedAt: new Date() })
      .where(eq(recordings.id, recordingId));

    return { success: false, error: errorMessage, totalSegments: 0, totalDurationMs: 0 };
  }
}

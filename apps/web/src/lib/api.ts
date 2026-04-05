import { env } from "@my-better-t-app/env/web";

const API_BASE = env.NEXT_PUBLIC_SERVER_URL;

// Types
export interface Recording {
  id: string;
  name: string | null;
  status: "recording" | "uploading" | "transcribing" | "completed" | "failed";
  totalDurationMs: number | null;
  totalChunks: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  chunksTotal?: number;
  chunksUploaded?: number;
  chunksTranscribed?: number;
}

export interface TranscriptSegment {
  id: string;
  recordingId: string;
  chunkId: string | null;
  content: string;
  confidence: number | null;
  startTimeMs: number | null;
  endTimeMs: number | null;
  speakerId: string | null;
  speakerName: string | null;
  wordCount: number | null;
  createdAt: string;
}

export interface Speaker {
  id: string;
  recordingId: string;
  speakerIndex: number;
  displayName: string | null;
  createdAt: string;
}

// API functions
export async function createRecording(name?: string): Promise<Recording> {
  const res = await fetch(`${API_BASE}/api/recordings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.recording;
}

export async function getRecording(id: string): Promise<Recording> {
  const res = await fetch(`${API_BASE}/api/recordings/${id}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.recording;
}

export async function updateRecording(
  id: string,
  updates: Partial<Pick<Recording, "status" | "name" | "totalDurationMs" | "totalChunks" | "errorMessage">>
): Promise<Recording> {
  const res = await fetch(`${API_BASE}/api/recordings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.recording;
}

export async function uploadChunk(
  recordingId: string,
  chunk: {
    sequenceNumber: number;
    durationMs: number;
    blob: Blob;
  }
): Promise<{ id: string; sequenceNumber: number; uploadConfirmed: boolean }> {
  const formData = new FormData();
  formData.append("sequenceNumber", String(chunk.sequenceNumber));
  formData.append("durationMs", String(chunk.durationMs));
  formData.append("audio", chunk.blob, `chunk_${chunk.sequenceNumber}.wav`);

  const res = await fetch(`${API_BASE}/api/chunks/${recordingId}`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.chunk;
}

export async function triggerTranscription(recordingId: string): Promise<{
  totalSegments: number;
  totalDurationMs: number;
}> {
  const res = await fetch(`${API_BASE}/api/transcribe/${recordingId}`, {
    method: "POST",
  });

  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return {
    totalSegments: data.totalSegments,
    totalDurationMs: data.totalDurationMs,
  };
}

export async function getTranscript(recordingId: string): Promise<{
  recording: Recording;
  transcript: TranscriptSegment[];
  speakers: Speaker[];
}> {
  const res = await fetch(`${API_BASE}/api/recordings/${recordingId}/transcript`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return {
    recording: data.recording,
    transcript: data.transcript,
    speakers: data.speakers,
  };
}

export async function listRecordings(): Promise<Recording[]> {
  const res = await fetch(`${API_BASE}/api/recordings`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.recordings;
}

"use client";

import Link from "next/link";
import { Mic, FileAudio, Users } from "lucide-react";

export default function Home() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-3xl font-bold">Reliable Transcription</h1>
        <p className="text-muted-foreground">
          Accurate speech-to-text with multi-speaker detection
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/transcription"
          className="group flex flex-col gap-3 rounded-lg border border-border/50 bg-card p-6 transition-colors hover:border-primary/50 hover:bg-muted/50"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <Mic className="size-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">Transcription</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Record live audio or upload files. Supports 1+ hour recordings with
            speaker diarization.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-muted px-2 py-0.5">Live Recording</span>
            <span className="rounded bg-muted px-2 py-0.5">File Upload</span>
            <span className="rounded bg-muted px-2 py-0.5">Multi-Speaker</span>
          </div>
        </Link>

        <Link
          href="/recorder"
          className="group flex flex-col gap-3 rounded-lg border border-border/50 bg-card p-6 transition-colors hover:border-primary/50 hover:bg-muted/50"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-secondary/10 p-2">
              <FileAudio className="size-5 text-secondary-foreground" />
            </div>
            <h2 className="text-lg font-semibold">Simple Recorder</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Basic audio recording with chunk preview. Download individual 5-second
            WAV chunks.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-muted px-2 py-0.5">16kHz WAV</span>
            <span className="rounded bg-muted px-2 py-0.5">5s Chunks</span>
            <span className="rounded bg-muted px-2 py-0.5">Preview</span>
          </div>
        </Link>
      </div>

      <div className="mt-8 rounded-lg border border-border/50 bg-muted/20 p-6">
        <h3 className="mb-3 flex items-center gap-2 font-medium">
          <Users className="size-4" />
          Features
        </h3>
        <ul className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
          <li>✓ No chunk loss — OPFS + DB acknowledgment</li>
          <li>✓ No hallucination — Deepgram Nova-2 model</li>
          <li>✓ 5+ speakers — Built-in diarization</li>
          <li>✓ 1+ hour audio — Chunked processing</li>
          <li>✓ Timestamps — Word-level accuracy</li>
          <li>✓ Copy & Download — Export transcripts</li>
        </ul>
      </div>
    </div>
  );
}

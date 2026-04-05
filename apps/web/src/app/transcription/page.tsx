"use client"

import { useCallback, useRef, useState } from "react"
import {
  Download,
  FileAudio,
  Loader2,
  Mic,
  Pause,
  Play,
  Square,
  Upload,
  Copy,
  Check,
} from "lucide-react"

import { Button } from "@my-better-t-app/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card"
import { LiveWaveform } from "@/components/ui/live-waveform"
import { useRecorder, type WavChunk } from "@/hooks/use-recorder"
import {
  createRecording,
  uploadChunk,
  updateRecording,
  triggerTranscription,
  getTranscript,
  type Recording,
  type TranscriptSegment,
  type Speaker,
} from "@/lib/api"

type AppStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "paused"
  | "uploading"
  | "transcribing"
  | "completed"
  | "error"

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`
}

function formatTimestamp(ms: number | null) {
  if (ms === null) return ""
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function getSpeakerColor(speakerId: string | null): string {
  if (!speakerId) return "text-muted-foreground"

  const colors = [
    "text-blue-500",
    "text-green-500",
    "text-purple-500",
    "text-orange-500",
    "text-pink-500",
    "text-cyan-500",
    "text-yellow-500",
    "text-red-500",
  ]

  const index = Number.parseInt(speakerId.replace("speaker_", ""), 10) || 0
  return colors[index % colors.length]
}

interface TranscriptViewerProps {
  segments: TranscriptSegment[]
  speakers: Speaker[]
}

function TranscriptViewer({ segments, speakers }: TranscriptViewerProps) {
  const [copied, setCopied] = useState(false)

  const fullText = segments
    .map((seg) => {
      const speaker = seg.speakerName ?? seg.speakerId ?? ""
      const time = formatTimestamp(seg.startTimeMs)
      return `[${time}] ${speaker}: ${seg.content}`
    })
    .join("\n\n")

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([fullText], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "transcript.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  if (segments.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No transcript available yet.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied!" : "Copy"}
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5">
          <Download className="size-3" />
          Download
        </Button>
      </div>

      <div className="max-h-[400px] space-y-3 overflow-y-auto rounded border border-border/50 bg-muted/10 p-4">
        {segments.map((segment) => (
          <div key={segment.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-muted-foreground">
                [{formatTimestamp(segment.startTimeMs)}]
              </span>
              <span className={`font-medium ${getSpeakerColor(segment.speakerId)}`}>
                {segment.speakerName ?? segment.speakerId ?? "Unknown"}
              </span>
              {segment.confidence !== null && (
                <span className="text-muted-foreground">
                  ({Math.round(segment.confidence * 100)}%)
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed">{segment.content}</p>
          </div>
        ))}
      </div>

      {speakers.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground">Speakers:</span>
          {speakers.map((speaker) => (
            <span
              key={speaker.id}
              className={`font-medium ${getSpeakerColor(`speaker_${speaker.speakerIndex}`)}`}
            >
              {speaker.displayName ?? `Speaker ${speaker.speakerIndex + 1}`}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

interface ProgressBarProps {
  current: number
  total: number
  label: string
}

function ProgressBar({ current, total, label }: ProgressBarProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>
          {current}/{total} ({percent}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

export default function TranscriptionPage() {
  const [appStatus, setAppStatus] = useState<AppStatus>("idle")
  const [recording, setRecording] = useState<Recording | null>(null)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const pendingChunksRef = useRef<WavChunk[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    status: recorderStatus,
    start: startRecorder,
    stop: stopRecorder,
    pause: pauseRecorder,
    resume: resumeRecorder,
    chunks,
    elapsed,
    stream,
    clearChunks,
  } = useRecorder({ chunkDuration: 5 })

  const isRecording = appStatus === "recording"
  const isPaused = appStatus === "paused"
  const isActive = isRecording || isPaused
  const isProcessing = appStatus === "uploading" || appStatus === "transcribing"

  // Upload all chunks and transcribe
  const processRecording = useCallback(async (chunksToUpload: WavChunk[]) => {
    if (chunksToUpload.length === 0) {
      setErrorMessage("No audio recorded")
      setAppStatus("error")
      return
    }

    try {
      // Create recording session
      const rec = await createRecording()
      setRecording(rec)

      // Upload chunks
      setAppStatus("uploading")
      setUploadProgress({ current: 0, total: chunksToUpload.length })

      for (let i = 0; i < chunksToUpload.length; i++) {
        const chunk = chunksToUpload[i]
        await uploadChunk(rec.id, {
          sequenceNumber: i,
          durationMs: Math.round(chunk.duration * 1000),
          blob: chunk.blob,
        })
        setUploadProgress({ current: i + 1, total: chunksToUpload.length })
      }

      // Mark as ready for transcription
      await updateRecording(rec.id, { status: "uploading" })

      // Trigger transcription
      setAppStatus("transcribing")
      await triggerTranscription(rec.id)

      // Fetch transcript
      const result = await getTranscript(rec.id)
      setTranscript(result.transcript)
      setSpeakers(result.speakers)
      setRecording(result.recording)
      setAppStatus("completed")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      setErrorMessage(message)
      setAppStatus("error")
    }
  }, [])

  // Handle start recording
  const handleStart = useCallback(async () => {
    setErrorMessage(null)
    setTranscript([])
    setSpeakers([])
    clearChunks()
    pendingChunksRef.current = []
    setAppStatus("requesting")

    try {
      await startRecorder()
      setAppStatus("recording")
    } catch {
      setAppStatus("idle")
    }
  }, [startRecorder, clearChunks])

  // Handle stop recording
  const handleStop = useCallback(() => {
    stopRecorder()
    // Store chunks for upload
    pendingChunksRef.current = [...chunks]
    // Small delay to ensure last chunk is captured
    setTimeout(() => {
      processRecording(pendingChunksRef.current)
    }, 100)
  }, [stopRecorder, chunks, processRecording])

  // Handle pause/resume
  const handlePauseResume = useCallback(() => {
    if (isPaused) {
      resumeRecorder()
      setAppStatus("recording")
    } else {
      pauseRecorder()
      setAppStatus("paused")
    }
  }, [isPaused, resumeRecorder, pauseRecorder])

  // Handle file upload
  const handleFileUpload = useCallback(
    async (file: File) => {
      setErrorMessage(null)
      setTranscript([])
      setSpeakers([])

      // Validate file type
      const validTypes = ["audio/wav", "audio/mp3", "audio/mpeg", "audio/m4a", "audio/webm", "audio/ogg"]
      if (!validTypes.includes(file.type) && !file.name.match(/\.(wav|mp3|m4a|webm|ogg)$/i)) {
        setErrorMessage("Invalid file type. Please upload WAV, MP3, M4A, WebM, or OGG.")
        setAppStatus("error")
        return
      }

      try {
        setAppStatus("uploading")

        // Create recording session
        const rec = await createRecording(file.name)
        setRecording(rec)

        // For simplicity, upload as single chunk (server will handle large files)
        // In production, you'd chunk the file client-side
        const arrayBuffer = await file.arrayBuffer()
        const blob = new Blob([arrayBuffer], { type: "audio/wav" })

        setUploadProgress({ current: 0, total: 1 })

        // Get duration (approximate from file size for now)
        const audioDurationMs = 5000 // Placeholder - server will calculate actual duration

        await uploadChunk(rec.id, {
          sequenceNumber: 0,
          durationMs: audioDurationMs,
          blob,
        })

        setUploadProgress({ current: 1, total: 1 })

        // Trigger transcription
        setAppStatus("transcribing")
        await triggerTranscription(rec.id)

        // Fetch transcript
        const result = await getTranscript(rec.id)
        setTranscript(result.transcript)
        setSpeakers(result.speakers)
        setRecording(result.recording)
        setAppStatus("completed")
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        setErrorMessage(message)
        setAppStatus("error")
      }
    },
    []
  )

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        handleFileUpload(file)
      }
    },
    [handleFileUpload]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) {
        handleFileUpload(file)
      }
    },
    [handleFileUpload]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  return (
    <div className="container mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Transcription</CardTitle>
          <CardDescription>
            Record audio or upload a file to transcribe with speaker detection
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {/* Mode Selection */}
          {appStatus === "idle" && (
            <div className="flex flex-col gap-4">
              <div className="flex gap-3">
                <Button
                  size="lg"
                  className="flex-1 gap-2"
                  onClick={handleStart}
                >
                  <Mic className="size-4" />
                  Record Live
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-4" />
                  Upload File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </div>

              {/* Drop zone */}
              <div
                className="flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-border/50 bg-muted/10 p-4 text-muted-foreground transition-colors hover:border-border hover:bg-muted/20"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
              >
                <FileAudio className="size-8" />
                <span className="text-sm">Drop audio file here or click to browse</span>
                <span className="text-xs">WAV, MP3, M4A, WebM, OGG supported</span>
              </div>
            </div>
          )}

          {/* Recording UI */}
          {isActive && (
            <>
              <div className="overflow-hidden rounded-sm border border-border/50 bg-muted/20">
                <LiveWaveform
                  active={isRecording}
                  processing={isPaused}
                  stream={stream}
                  height={80}
                  barWidth={3}
                  barGap={1}
                  barRadius={2}
                  sensitivity={1.8}
                  smoothingTimeConstant={0.85}
                  fadeEdges
                  fadeWidth={32}
                  mode="static"
                />
              </div>

              <div className="text-center font-mono text-3xl tabular-nums tracking-tight">
                {formatTime(elapsed)}
              </div>

              <div className="text-center text-sm text-muted-foreground">
                {chunks.length} chunk{chunks.length !== 1 ? "s" : ""} recorded
              </div>

              <div className="flex items-center justify-center gap-3">
                <Button
                  size="lg"
                  variant="destructive"
                  className="gap-2 px-5"
                  onClick={handleStop}
                >
                  <Square className="size-4" />
                  Stop & Transcribe
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2"
                  onClick={handlePauseResume}
                >
                  {isPaused ? (
                    <>
                      <Play className="size-4" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="size-4" />
                      Pause
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {/* Processing UI */}
          {isProcessing && (
            <div className="flex flex-col items-center gap-4 py-4">
              <Loader2 className="size-8 animate-spin text-primary" />
              <span className="text-lg font-medium">
                {appStatus === "uploading" ? "Uploading audio..." : "Transcribing..."}
              </span>

              {appStatus === "uploading" && uploadProgress.total > 0 && (
                <div className="w-full max-w-sm">
                  <ProgressBar
                    current={uploadProgress.current}
                    total={uploadProgress.total}
                    label="Upload Progress"
                  />
                </div>
              )}

              {appStatus === "transcribing" && (
                <p className="text-center text-sm text-muted-foreground">
                  This may take a few minutes for long recordings.
                  <br />
                  Speaker detection is being performed.
                </p>
              )}
            </div>
          )}

          {/* Error State */}
          {appStatus === "error" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="rounded bg-destructive/10 p-4 text-center text-destructive">
                <p className="font-medium">Error</p>
                <p className="text-sm">{errorMessage}</p>
              </div>
              <Button variant="outline" onClick={() => setAppStatus("idle")}>
                Try Again
              </Button>
            </div>
          )}

          {/* Completed - Show Transcript */}
          {appStatus === "completed" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-green-600">
                  ✓ Transcription Complete
                </span>
                <Button variant="ghost" size="sm" onClick={() => setAppStatus("idle")}>
                  New Recording
                </Button>
              </div>

              {recording && (
                <div className="text-xs text-muted-foreground">
                  Duration: {formatTimestamp(recording.totalDurationMs)} |{" "}
                  {transcript.length} segment{transcript.length !== 1 ? "s" : ""} |{" "}
                  {speakers.length} speaker{speakers.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transcript Card */}
      {appStatus === "completed" && transcript.length > 0 && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Transcript</CardTitle>
            <CardDescription>
              {speakers.length > 0 ? `${speakers.length} speakers detected` : "Transcription results"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TranscriptViewer segments={transcript} speakers={speakers} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

import { uploadChunk as apiUploadChunk } from "./api";
import { saveChunkToOPFS, loadChunkFromOPFS, clearOPFSRecording, isOPFSSupported } from "./opfs";

interface ChunkUploadOptions {
  recordingId: string;
  sequenceNumber: number;
  durationMs: number;
  blob: Blob;
  maxRetries?: number;
  retryDelayMs?: number;
}

interface UploadResult {
  success: boolean;
  chunkId?: string;
  error?: string;
  retriesUsed: number;
}

// Exponential backoff delay
function getRetryDelay(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * 2 ** attempt + Math.random() * 100;
}

// Sleep helper
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload a chunk with OPFS persistence and retry logic.
 * 
 * Flow:
 * 1. Save to OPFS first (durable local storage)
 * 2. Attempt upload with retries
 * 3. On success, optionally clear OPFS entry
 */
export async function uploadChunkWithRetry({
  recordingId,
  sequenceNumber,
  durationMs,
  blob,
  maxRetries = 3,
  retryDelayMs = 1000,
}: ChunkUploadOptions): Promise<UploadResult> {
  // Step 1: Persist to OPFS first (if supported)
  if (isOPFSSupported()) {
    await saveChunkToOPFS(recordingId, sequenceNumber, blob);
  }

  // Step 2: Attempt upload with retries
  let lastError: string | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await apiUploadChunk(recordingId, {
        sequenceNumber,
        durationMs,
        blob,
      });

      // Success! Return immediately
      return {
        success: true,
        chunkId: result.id,
        retriesUsed: attempt,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Upload failed";
      
      // Don't retry on the last attempt
      if (attempt < maxRetries) {
        const delay = getRetryDelay(attempt, retryDelayMs);
        await sleep(delay);
        
        // On retry, try loading from OPFS in case blob was lost
        if (isOPFSSupported()) {
          const savedBlob = await loadChunkFromOPFS(recordingId, sequenceNumber);
          if (savedBlob) {
            blob = savedBlob;
          }
        }
      }
    }
  }

  return {
    success: false,
    error: lastError,
    retriesUsed: maxRetries,
  };
}

/**
 * Upload multiple chunks in parallel with progress tracking
 */
export async function uploadChunksWithProgress(
  recordingId: string,
  chunks: Array<{ blob: Blob; durationMs: number }>,
  onProgress: (completed: number, total: number, errors: number) => void,
  concurrency = 3
): Promise<{ successful: number; failed: number; errors: string[] }> {
  const total = chunks.length;
  let completed = 0;
  let failed = 0;
  const errors: string[] = [];

  // Process in batches for controlled concurrency
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    
    const results = await Promise.all(
      batch.map((chunk, batchIndex) =>
        uploadChunkWithRetry({
          recordingId,
          sequenceNumber: i + batchIndex,
          durationMs: chunk.durationMs,
          blob: chunk.blob,
        })
      )
    );

    for (const result of results) {
      if (result.success) {
        completed++;
      } else {
        failed++;
        if (result.error) {
          errors.push(result.error);
        }
      }
    }

    onProgress(completed, total, failed);
  }

  // Clear OPFS after successful upload
  if (failed === 0 && isOPFSSupported()) {
    await clearOPFSRecording(recordingId);
  }

  return { successful: completed, failed, errors };
}

/**
 * Reconcile OPFS with server — re-upload any chunks that exist locally
 * but failed to upload previously
 */
export async function reconcileChunks(
  recordingId: string,
  serverConfirmedChunks: number[],
  totalChunks: number,
  durationMsPerChunk: number
): Promise<{ reuploadedCount: number; errors: string[] }> {
  if (!isOPFSSupported()) {
    return { reuploadedCount: 0, errors: [] };
  }

  const confirmedSet = new Set(serverConfirmedChunks);
  const errors: string[] = [];
  let reuploadedCount = 0;

  for (let i = 0; i < totalChunks; i++) {
    // Skip if server already has this chunk
    if (confirmedSet.has(i)) {
      continue;
    }

    // Try to load from OPFS
    const blob = await loadChunkFromOPFS(recordingId, i);
    if (!blob) {
      errors.push(`Chunk ${i} missing from both server and OPFS`);
      continue;
    }

    // Re-upload
    const result = await uploadChunkWithRetry({
      recordingId,
      sequenceNumber: i,
      durationMs: durationMsPerChunk,
      blob,
    });

    if (result.success) {
      reuploadedCount++;
    } else if (result.error) {
      errors.push(`Chunk ${i}: ${result.error}`);
    }
  }

  return { reuploadedCount, errors };
}

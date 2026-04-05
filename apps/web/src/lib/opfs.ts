// OPFS (Origin Private File System) helpers for durable chunk storage

const OPFS_DIR_NAME = "transcription-chunks";

async function getOPFSRoot(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (!navigator.storage?.getDirectory) {
      return null;
    }
    return await navigator.storage.getDirectory();
  } catch {
    return null;
  }
}

async function getChunksDir(): Promise<FileSystemDirectoryHandle | null> {
  const root = await getOPFSRoot();
  if (!root) return null;
  
  try {
    return await root.getDirectoryHandle(OPFS_DIR_NAME, { create: true });
  } catch {
    return null;
  }
}

export async function saveChunkToOPFS(
  recordingId: string,
  chunkIndex: number,
  blob: Blob
): Promise<boolean> {
  const dir = await getChunksDir();
  if (!dir) return false;

  try {
    // Create recording subdirectory
    const recordingDir = await dir.getDirectoryHandle(recordingId, { create: true });
    
    // Save chunk file
    const fileName = `chunk_${String(chunkIndex).padStart(5, "0")}.wav`;
    const fileHandle = await recordingDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    
    return true;
  } catch {
    return false;
  }
}

export async function loadChunkFromOPFS(
  recordingId: string,
  chunkIndex: number
): Promise<Blob | null> {
  const dir = await getChunksDir();
  if (!dir) return null;

  try {
    const recordingDir = await dir.getDirectoryHandle(recordingId);
    const fileName = `chunk_${String(chunkIndex).padStart(5, "0")}.wav`;
    const fileHandle = await recordingDir.getFileHandle(fileName);
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

export async function listOPFSChunks(recordingId: string): Promise<number[]> {
  const dir = await getChunksDir();
  if (!dir) return [];

  try {
    const recordingDir = await dir.getDirectoryHandle(recordingId);
    const chunks: number[] = [];
    
    for await (const entry of recordingDir.values()) {
      if (entry.kind === "file" && entry.name.startsWith("chunk_")) {
        const match = entry.name.match(/chunk_(\d+)\.wav/);
        if (match) {
          chunks.push(Number.parseInt(match[1], 10));
        }
      }
    }
    
    return chunks.sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export async function clearOPFSRecording(recordingId: string): Promise<boolean> {
  const dir = await getChunksDir();
  if (!dir) return false;

  try {
    await dir.removeEntry(recordingId, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export async function clearAllOPFS(): Promise<boolean> {
  const root = await getOPFSRoot();
  if (!root) return false;

  try {
    await root.removeEntry(OPFS_DIR_NAME, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export function isOPFSSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.storage?.getDirectory;
}

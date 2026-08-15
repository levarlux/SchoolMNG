/**
 * File utilities for cost optimization:
 * - compressBeforeUpload: Compress text-based files before upload (30-70% savings)
 * - hashFile: SHA-256 content hashing for deduplication
 * - shouldCompress: Determines if a file should be compressed
 */
import { compress } from "fflate";

// ── Compression ─────────────────────────────────────────────────

/**
 * File types that benefit from compression (text-based).
 * Images are already compressed, so we skip them.
 */
const COMPRESSIBLE_TYPES = [
  "text/",
  "application/json",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/csv",
  "application/vnd.ms-excel",
];

/**
 * Minimum file size to bother compressing (100KB).
 * Smaller files don't benefit enough to justify the CPU time.
 */
const MIN_COMPRESS_SIZE = 100_000;

/**
 * Determines if a file should be compressed before upload.
 */
export function shouldCompress(file: File): boolean {
  // Skip small files
  if (file.size < MIN_COMPRESS_SIZE) return false;

  // Skip already compressed formats
  if (file.name.endsWith(".gz") || file.name.endsWith(".zip")) return false;

  // Compress text-based files
  return COMPRESSIBLE_TYPES.some((type) => file.type.startsWith(type));
}

/**
 * Compress a file before upload using gzip (level 6 = good balance).
 * Returns the original file if compression isn't beneficial.
 *
 * @example
 * ```tsx
 * const file = await compressBeforeUpload(selectedFile);
 * const uploadUrl = await generateUploadUrl();
 * await fetch(uploadUrl, { method: "POST", body: file });
 * ```
 */
export async function compressBeforeUpload(file: File): Promise<File> {
  if (!shouldCompress(file)) return file;

  try {
    const buffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(buffer);

    // Compress with gzip (level 6 = fast with good compression)
    const compressed = await new Promise<Uint8Array>((resolve, reject) => {
      compress(uint8, { level: 6 }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    // Only use compressed version if it's actually smaller
    if (compressed.length >= file.size) return file;

    const savings = Math.round((1 - compressed.length / file.size) * 100);
    console.log(
      `[file-utils] Compressed ${file.name}: ${formatBytes(file.size)} → ${formatBytes(compressed.length)} (${savings}% savings)`,
    );

    return new File([compressed.buffer as ArrayBuffer], file.name + ".gz", {
      type: "application/gzip",
      lastModified: file.lastModified,
    });
  } catch (err) {
    console.warn("[file-utils] Compression failed, uploading original:", err);
    return file;
  }
}

// ── Content Hashing ─────────────────────────────────────────────

/**
 * Generate SHA-256 hash of file content for deduplication.
 * Two files with identical content will produce the same hash.
 *
 * @example
 * ```tsx
 * const hash = await hashFile(file);
 * const existing = await ctx.runQuery(internal.files.findByHash, { hash });
 * if (existing) return existing.storageId; // Reuse existing
 * ```
 */
export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate SHA-256 hash of a Uint8Array (for already-read data).
 */
export async function hashBytes(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Upload with Dedup ───────────────────────────────────────────

/**
 * Upload a file with deduplication:
 * 1. Hash the file content
 * 2. Check if a file with the same hash already exists
 * 3. If yes, return the existing storage ID
 * 4. If no, compress and upload the new file
 *
 * @returns The storage ID (either existing or newly uploaded)
 */
export async function uploadWithDedup(
  file: File,
  generateUploadUrl: () => Promise<string>,
  findExisting?: (hash: string) => Promise<{ storageId: string } | null>,
): Promise<{ storageId: string; isNew: boolean }> {
  // Step 1: Hash the file
  const hash = await hashFile(file);

  // Step 2: Check for existing file
  if (findExisting) {
    const existing = await findExisting(hash);
    if (existing) {
      console.log(
        `[file-utils] Dedup hit: ${file.name} already exists (${hash.slice(0, 12)}...)`,
      );
      return { storageId: existing.storageId, isNew: false };
    }
  }

  // Step 3: Compress and upload
  const compressed = await compressBeforeUpload(file);
  const uploadUrl = await generateUploadUrl();
  const result = await fetch(uploadUrl, {
    method: "POST",
    body: compressed,
    headers: { "Content-Type": compressed.type },
  });

  const storageId = result.headers.get("Convex-Path") ?? "";

  return { storageId, isNew: true };
}

// ── Helpers ─────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

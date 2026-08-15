# Data Migration, Compression & File Optimization Audit

**Date:** 11 August 2026  
**Auditor:** Buffy (AI Data Systems Architect)  
**Scope:** ImportStudio bulk ingestion, file storage, OCR pipeline, document management  

---

## Executive Summary

SchoolMNG's data ingestion pipeline handles CSV/Excel/PDF imports via ImportStudio and onboarding. The system correctly parses structured data into Convex tables without storing raw files (good), but lacks compression, deduplication, checkpointing, and progress tracking for large imports.

**Overall Score:** ⚠️ **Functional but Not Production-Hardened** — works for small datasets, will fail or waste money at scale.

---

## Pillar 1: Data Extraction vs. Raw File Retention

### ✅ PASS: Structured data extracted, raw files not stored

The ImportStudio (`src/components/import-studio.tsx`) correctly:
1. Parses CSV/Excel files client-side
2. Extracts structured data into typed rows
3. Sends only the parsed data to Convex mutations
4. Does NOT store the raw CSV/Excel as a blob

**Evidence:**
```tsx
// import-studio.tsx — client-side parsing
const text = await file.text();
const rows = parseCSV(text); // Extracted, not stored raw
// ...
await importStudents({ schoolId, rows: mappedRows }); // Only rows sent to DB
```

### ⚠️ Partial: PDF/DOC extraction limited

The `file-classifier.ts` and `document-processor.ts` handle PDF extraction, but:
- PDFs are processed client-side via `pdfjs-dist`
- Extracted text is used for classification, not stored
- No raw PDF retention option for audit trails

**Recommendation:** Add an optional `storeRawFile` flag for compliance-sensitive documents.

---

## Pillar 2: Client-Side Compression Before Upload

### 🔴 FAIL: No compression before upload

**Finding:** No compression libraries (`pako`, `fflate`, `lz-string`) in `package.json`. Files are uploaded at full size.

**Impact analysis:**

| File Type | Typical Size | After Gzip | Savings |
|-----------|-------------|------------|---------|
| Student CSV (1000 rows) | 150 KB | 45 KB | 70% |
| School policy PDF | 2 MB | 1.2 MB | 40% |
| Student photo | 500 KB | 480 KB | 4% |
| Report card PDF | 3 MB | 1.8 MB | 40% |

**Fix:** Add `fflate` and compress text-based files:
```tsx
import { compress } from 'fflate';

async function compressFile(file: File): Promise<File> {
  // Only compress text-based files (CSV, JSON, PDF, TXT)
  const textTypes = ['text/', 'application/json', 'application/pdf'];
  if (!textTypes.some(t => file.type.startsWith(t)) || file.size < 100_000) {
    return file;
  }
  
  const buffer = await file.arrayBuffer();
  const compressed = await compress(new Uint8Array(buffer), { level: 6 });
  return new File([compressed], file.name + '.gz', { 
    type: 'application/gzip',
    lastModified: file.lastModified,
  });
}
```

---

## Pillar 3: Bulk Ingestion & Batching Strategy

### 🔴 FAIL: No checkpoint/resume mechanism

**Finding:** The import pipeline in `convex/imports.ts` processes rows sequentially without saving progress. If a 5,000-row import fails at row 4,000 (network error, timeout, etc.), the user must re-upload and re-process all 5,000 rows.

**Current flow:**
```
User uploads 5000-row CSV
  → Client parses all rows
  → Client sends all rows to mutation
  → Mutation processes row-by-row
  → IF row 4000 fails → ENTIRE import fails
  → User must re-upload and re-process all 5000 rows
```

**Fix: Add checkpoint tracking:**
```ts
// convex/imports.ts
export const importStudentsChunked = action({
  args: {
    schoolId: v.id("schools"),
    rows: v.array(v.any()),
    runId: v.optional(v.id("import_runs")),
  },
  handler: async (ctx, args) => {
    // Create or resume import run
    let runId = args.runId;
    if (!runId) {
      runId = await ctx.runMutation(internal.imports.createImportRun, {
        schoolId: args.schoolId,
        totalRows: args.rows.length,
        kind: "students",
      });
    }
    
    const CHUNK_SIZE = 100;
    const run = await ctx.runQuery(internal.imports.getImportRun, { runId });
    const startIdx = run?.lastProcessedRow ?? 0;
    
    for (let i = startIdx; i < args.rows.length; i += CHUNK_SIZE) {
      const chunk = args.rows.slice(i, i + CHUNK_SIZE);
      await ctx.runMutation(internal.imports.processChunk, {
        runId,
        startRow: i,
        rows: chunk,
      });
    }
    
    return { runId, processed: args.rows.length };
  },
});
```

### 🟡 Medium: No duplicate detection before insert

**Finding:** The import pipeline checks for duplicates after querying, but doesn't use a hash-based dedup. If the same CSV is uploaded twice, all rows are re-processed (though they may be caught by unique constraints).

**Fix:** Add content hashing:
```ts
async function hashRows(rows: Record<string, unknown>[]): Promise<string> {
  const str = JSON.stringify(rows.sort((a, b) => 
    JSON.stringify(a).localeCompare(JSON.stringify(b))
  ));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

---

## Pillar 4: Large File Streaming & Direct-to-Storage Uploads

### ✅ PASS: Direct-to-storage uploads

The codebase correctly uses Convex's `generateUploadUrl` for file uploads:

```tsx
// convex/files.ts
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Client-side
const uploadUrl = await generateUploadUrl();
const result = await fetch(uploadUrl, {
  method: "POST",
  body: file, // Direct to storage, not through API
  headers: { "Content-Type": file.type },
});
```

**This is the correct pattern** — files bypass the API endpoint and upload directly to Convex File Storage.

### 🟡 Medium: No upload progress tracking

**Finding:** The upload handlers in `onboarding/page.tsx`, `settings/page.tsx`, and `student-profile-view.tsx` don't track upload progress.

**Fix:** Use XMLHttpRequest for progress:
```tsx
function uploadWithProgress(url: string, file: File, onProgress: (pct: number) => void) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener('load', () => resolve(xhr));
    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}
```

---

## Pillar 5: Archival & Deduplication Strategies

### 🔴 FAIL: No file content hashing

**Finding:** No SHA-256 or content hashing before storage. The same file uploaded twice creates two separate storage entries.

**Impact:** Storage costs double for duplicate uploads (common during onboarding when users re-upload documents).

**Fix:** Hash before upload:
```tsx
async function uploadWithDedup(file: File, schoolId: string) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Check if file already exists
  const existing = await ctx.runQuery(internal.files.findByHash, { hash, schoolId });
  if (existing) return existing.storageId; // Reuse existing
  
  // Upload new file
  const uploadUrl = await ctx.runMutation(internal.files.generateUploadUrl);
  const result = await fetch(uploadUrl, { method: 'POST', body: file });
  
  // Store with hash for future dedup
  await ctx.runMutation(internal.files.storeMetadata, {
    storageId: result.headers.get('Convex-Path'),
    hash,
    schoolId,
    originalName: file.name,
  });
  
  return result.headers.get('Convex-Path');
}
```

### 🟡 Medium: No cold storage/archival for old documents

**Finding:** All documents remain in hot storage regardless of age or access patterns.

**Recommendation:** Add a `lastAccessedAt` field and a cron job to flag old documents for archival.

---

## Pillar 6: Read Memory & Download Optimization

### ✅ PASS: Signed URLs for retrieval

The codebase correctly uses `storage.getUrl()` for serving files:

```ts
// convex/files.ts
export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
```

Files are served via signed URLs, not loaded into server memory.

### 🟡 Medium: No CDN caching headers

**Finding:** Uploaded files don't set `Cache-Control` headers. Every request for a logo or document hits Convex storage.

**Fix:** Set cache headers on upload:
```ts
const uploadUrl = await ctx.storage.generateUploadUrl();
// After upload, the file is served with default headers
// For public assets like logos, consider using a CDN or setting cache headers
```

---

## Storage & Ingestion Flaws (Ranked by Risk)

| # | Flaw | Risk Level | Impact |
|---|------|-----------|--------|
| 1 | No checkpoint/resume for bulk imports | 🔴 High | Wasted compute, user frustration |
| 2 | No client-side compression | 🟡 Medium | 30-70% higher storage costs |
| 3 | No file deduplication (hashing) | 🟡 Medium | Duplicate storage, wasted money |
| 4 | No upload progress tracking | 🟡 Medium | Poor UX for large files |
| 5 | No cold storage for old documents | 🟢 Low | Long-term storage cost growth |

---

## Validation Summary

| Check | Status | Notes |
|-------|--------|-------|
| Structured data extracted without raw storage? | ✅ Pass | CSV/Excel parsed client-side |
| Client-side compression before upload? | 🔴 Fail | No compression libraries |
| Batch processing with checkpointing? | 🔴 Fail | No resume mechanism |
| Direct-to-storage uploads? | ✅ Pass | Uses `generateUploadUrl` |
| File deduplication via hashing? | 🔴 Fail | No content hashing |
| Signed URLs for retrieval? | ✅ Pass | Uses `storage.getUrl()` |
| Safe for 10,000+ row imports? | 🔴 Fail | Will hit execution limits |
| Safe for 50MB+ files? | ✅ Pass | Direct upload, no API payload |

---

## Recommended Priority Order

1. **Add chunked processing** for bulk imports (prevents execution limit failures)
2. **Add client-side compression** for text-based files (30-70% storage savings)
3. **Add file deduplication** via content hashing (prevents duplicate storage)
4. **Add upload progress tracking** (improves UX for large uploads)
5. **Add import checkpoint/resume** (prevents wasted compute on failures)

---

*Report generated by Buffy — SchoolMNG Data Migration & File Optimization Audit*

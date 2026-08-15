"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Camera, Upload, ScanLine, CheckCircle2, XCircle, AlertTriangle,
  ArrowLeft, ArrowRight, FileImage, Eye, RotateCcw,
} from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { toast } from "sonner";
import Fuse from "fuse.js";

// ── Document Types ──────────────────────────────────────────────────

const DOCUMENT_TYPES = [
  { value: "admission_form", label: "Admission Form", bucket: "learner" as const },
  { value: "exam_paper", label: "Exam Paper", bucket: "learner" as const },
  { value: "id_certificate", label: "ID / Certificate", bucket: "learner" as const },
  { value: "fee_slip", label: "Fee Slip", bucket: "learner" as const },
  { value: "medical_record", label: "Medical Record", bucket: "learner" as const },
  { value: "staff_contract", label: "Staff Contract", bucket: "teaching_staff" as const },
];

// ── OCR Processing ──────────────────────────────────────────────────

/**
 * Preprocess image for better OCR accuracy.
 * Applies contrast enhancement and grayscale conversion.
 */
async function preprocessImage(imageData: ImageData): Promise<ImageData> {
  const data = new Uint8ClampedArray(imageData.data);
  
  // Convert to grayscale and enhance contrast
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    // Simple contrast enhancement
    const enhanced = Math.min(255, Math.max(0, (gray - 128) * 1.5 + 128));
    data[i] = enhanced;
    data[i + 1] = enhanced;
    data[i + 2] = enhanced;
    data[i + 3] = 255;
  }
  
  return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Run Tesseract.js OCR on an image.
 * Returns extracted text with confidence score.
 */
async function runOcr(imageSource: string | File): Promise<{
  text: string;
  confidence: number;
  words: Array<{ text: string; confidence: number }>;
}> {
  // Dynamic import to avoid SSR issues
  const Tesseract = await import("tesseract.js");
  
  const result = await Tesseract.recognize(imageSource, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text") {
        // Could update progress state here
      }
    },
  });
  
  // Access words if available (type varies by Tesseract version)
  const data = result.data as any;
  const words = data.words?.map((w: any) => ({
    text: w.text,
    confidence: w.confidence,
  })) ?? [];
  
  return {
    text: result.data.text,
    confidence: result.data.confidence,
    words,
  };
}

/**
 * Match extracted text against field aliases using Fuse.js.
 */
function matchExtractedText(
  extractedText: string,
  fields: Array<{ fieldId: string; name: string; aliases: string[] }>
): Array<{
  fieldId: string;
  fieldName: string;
  value: string;
  confidence: number;
  originalText: string;
}> {
  // Split text into lines and try to match each line to a field
  const lines = extractedText.split("\n").filter((l) => l.trim());
  const results: Array<{
    fieldId: string;
    fieldName: string;
    value: string;
    confidence: number;
    originalText: string;
  }> = [];
  
  // Create Fuse instance for fuzzy matching
  const fuse = new Fuse(fields, {
    keys: ["name", "aliases"],
    threshold: 0.4,
    includeScore: true,
  });
  
  // Also create a reverse mapping: alias -> field
  const aliasMap = new Map<string, typeof fields[0]>();
  for (const field of fields) {
    aliasMap.set(field.name.toLowerCase(), field);
    for (const alias of field.aliases) {
      aliasMap.set(alias.toLowerCase(), field);
    }
  }
  
  for (const line of lines) {
    // Try to split "Label: Value" or "Label Value" patterns
    const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
    const tabMatch = line.match(/^([^\t]+)\t+(.+)$/);
    const spaceMatch = line.match(/^(\S+(?:\s+\S+)?)\s{2,}(.+)$/);
    
    const match = colonMatch || tabMatch || spaceMatch;
    if (!match) continue;
    
    const [, label, value] = match;
    const normalizedLabel = label.toLowerCase().trim();
    const normalizedValue = value.trim();
    
    if (!normalizedValue) continue;
    
    // Try exact alias match first
    const exactField = aliasMap.get(normalizedLabel);
    if (exactField) {
      results.push({
        fieldId: exactField.fieldId,
        fieldName: exactField.name,
        value: normalizedValue,
        confidence: 0.9,
        originalText: line,
      });
      continue;
    }
    
    // Try fuzzy match
    const fuseResults = fuse.search(label);
    if (fuseResults.length > 0 && fuseResults[0].score && fuseResults[0].score < 0.5) {
      const field = fuseResults[0].item;
      results.push({
        fieldId: field.fieldId,
        fieldName: field.name,
        value: normalizedValue,
        confidence: 1 - fuseResults[0].score,
        originalText: line,
      });
    }
  }
  
  return results;
}

// ── Component ───────────────────────────────────────────────────────

type Step = "capture" | "processing" | "confirm" | "done";

interface ExtractionResult {
  fieldId: string;
  fieldName: string;
  value: string;
  confidence: number;
  originalText: string;
}

export function DocumentScanner({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const school = useSchool();
  const saveOcrExtraction = useMutation(api.ocr.saveOcrExtraction);
  const getFieldsForBucket = useQuery(
    api.ocr.getFieldsForBucket,
    school ? { schoolId: school._id, bucket: "learner" } : "skip"
  );
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [step, setStep] = useState<Step>("capture");
  const [documentType, setDocumentType] = useState("admission_form");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [extractedText, setExtractedText] = useState("");
  const [extractions, setExtractions] = useState<ExtractionResult[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string>("");
  const [isUsingCamera, setIsUsingCamera] = useState(false);
  
  // Get students for record selection
  const students = useQuery(
    api.students.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  // Phase 2.2 — match the extracted text against existing students and
  // flag documents that are already applied to them.
  const docMatch = useQuery(
    api.ocr.matchDocumentToStudent,
    school && extractedText.trim()
      ? { schoolId: school._id, text: extractedText, documentType }
      : "skip"
  );
  
  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Phase 2.2 — auto-select a confident document match.
  useEffect(() => {
    const top = docMatch?.candidates[0];
    if (top && top.score >= 0.7 && !selectedRecordId) {
      setSelectedRecordId(top.studentId);
    }
  }, [docMatch, selectedRecordId]);
  
  const reset = useCallback(() => {
    setStep("capture");
    setImageUrl(null);
    setExtractedText("");
    setExtractions([]);
    setSelectedRecordId("");
    setProcessingProgress(0);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsUsingCamera(false);
  }, []);
  
  function handleClose() {
    reset();
    onClose();
  }
  
  // ── Camera Controls ─────────────────────────────────────────────
  
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsUsingCamera(true);
    } catch (err) {
      toast.error("Could not access camera. Please upload a file instead.");
    }
  }
  
  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setImageUrl(dataUrl);
    
    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsUsingCamera(false);
  }
  
  function handleFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }
  
  // ── OCR Processing ──────────────────────────────────────────────
  
  async function processImage() {
    if (!imageUrl || !getFieldsForBucket) return;
    
    setStep("processing");
    setProcessingProgress(0);
    
    try {
      // Run OCR
      setProcessingProgress(30);
      const ocrResult = await runOcr(imageUrl);
      setExtractedText(ocrResult.text);
      setProcessingProgress(70);
      
      // Flatten all fields for matching
      const allFields = getFieldsForBucket.flatMap((mod) =>
        mod.sections.flatMap((sec) =>
          sec.fields.map((f) => ({
            fieldId: f.fieldId,
            name: f.name,
            aliases: f.aliases,
          }))
        )
      );
      
      // Match extracted text to fields
      const matched = matchExtractedText(ocrResult.text, allFields);
      setExtractions(matched);
      setProcessingProgress(100);
      
      setStep("confirm");
    } catch (err) {
      toast.error("OCR processing failed. Please try again.");
      setStep("capture");
    }
  }
  
  // ── Save ────────────────────────────────────────────────────────
  
  async function handleSave() {
    if (!school || !selectedRecordId || extractions.length === 0) return;
    
    try {
      await saveOcrExtraction({
        schoolId: school._id,
        recordId: selectedRecordId as any,
        fieldValues: extractions.map((e) => ({
          fieldId: e.fieldId as any,
          value: e.value,
        })),
        documentType,
      });
      
      setStep("done");
      toast.success(`Saved ${extractions.length} field values`);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }
  
  // ── Steps ───────────────────────────────────────────────────────
  
  const steps: { key: Step; label: string }[] = [
    { key: "capture", label: "Capture" },
    { key: "processing", label: "Processing" },
    { key: "confirm", label: "Confirm" },
    { key: "done", label: "Done" },
  ];
  
  return (
    <Modal open={open} onClose={handleClose} title="Scan Document" size="lg">
      <div className="space-y-5">
        {/* Stepper */}
        <div className="flex items-center gap-1">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1">
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                  step === s.key
                    ? "bg-primary text-primary-foreground"
                    : step === "done" || steps.findIndex((x) => x.key === step) > i
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {s.label}
              </div>
              {i < steps.length - 1 && <div className="w-4 h-px bg-border" />}
            </div>
          ))}
        </div>
        
        {/* ── Step 1: Capture ──────────────────────────────── */}
        {step === "capture" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Document Type</label>
              <Select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="h-9"
              >
                {DOCUMENT_TYPES.map((dt) => (
                  <option key={dt.value} value={dt.value}>
                    {dt.label}
                  </option>
                ))}
              </Select>
            </div>
            
            {!isUsingCamera && !imageUrl && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={startCamera}
                  className="flex flex-col items-center gap-3 border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                  <Camera className="h-10 w-10 text-primary/60" />
                  <div className="text-center">
                    <p className="font-medium">Take Photo</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Use your camera to scan
                    </p>
                  </div>
                </button>
                
                <label className="flex flex-col items-center gap-3 border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                  <FileImage className="h-10 w-10 text-primary/60" />
                  <div className="text-center">
                    <p className="font-medium">Upload Image</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      JPG, PNG, or PDF
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            )}
            
            {isUsingCamera && (
              <div className="space-y-3">
                <div className="relative rounded-lg overflow-hidden bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full max-h-80 object-contain"
                  />
                  <div className="absolute inset-0 pointer-events-none border-2 border-primary/30 rounded-lg" />
                </div>
                <div className="flex justify-center gap-3">
                  <Button variant="outline" onClick={() => {
                    if (streamRef.current) {
                      streamRef.current.getTracks().forEach((t) => t.stop());
                      streamRef.current = null;
                    }
                    setIsUsingCamera(false);
                  }}>
                    Cancel
                  </Button>
                  <Button onClick={capturePhoto}>
                    <Camera className="h-4 w-4 mr-2" /> Capture
                  </Button>
                </div>
              </div>
            )}
            
            {imageUrl && !isUsingCamera && (
              <div className="space-y-3">
                <div className="relative rounded-lg overflow-hidden bg-muted">
                  <img
                    src={imageUrl}
                    alt="Captured document"
                    className="w-full max-h-80 object-contain"
                  />
                </div>
                <div className="flex justify-center gap-3">
                  <Button variant="outline" onClick={() => setImageUrl(null)}>
                    <RotateCcw className="h-4 w-4 mr-2" /> Retake
                  </Button>
                  <Button onClick={processImage}>
                    <ScanLine className="h-4 w-4 mr-2" /> Scan & Extract
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* ── Step 2: Processing ───────────────────────────── */}
        {step === "processing" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4 py-8">
              <BrandLoader variant="book" size="md" />
              <p className="font-medium">Processing document...</p>
              <p className="text-sm text-muted-foreground">
                {processingProgress < 30 && "Preparing image..."}
                {processingProgress >= 30 && processingProgress < 70 && "Extracting text with OCR..."}
                {processingProgress >= 70 && "Matching fields..."}
              </p>
              <div className="w-48 bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-500"
                  style={{ width: `${processingProgress}%` }}
                />
              </div>
            </div>
          </div>
        )}
        
        {/* ── Step 3: Confirm ──────────────────────────────── */}
        {step === "confirm" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Extracted text */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Extracted Text</p>
                <div className="rounded-lg border border-border bg-muted/50 p-3 max-h-60 overflow-y-auto">
                  <pre className="text-xs whitespace-pre-wrap font-mono">
                    {extractedText || "(No text extracted)"}
                  </pre>
                </div>
              </div>
              
              {/* Matched fields */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Matched Fields</p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {extractions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No fields could be automatically matched. Try adjusting the document.
                    </p>
                  ) : (
                    extractions.map((ext, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2 rounded-lg border border-border bg-background"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{ext.fieldName}</p>
                          <Input
                            value={ext.value}
                            onChange={(e) => {
                              const newExtractions = [...extractions];
                              newExtractions[i].value = e.target.value;
                              setExtractions(newExtractions);
                            }}
                            className="h-7 text-xs mt-1"
                          />
                        </div>
                        <Badge
                          variant={ext.confidence > 0.7 ? "success" : ext.confidence > 0.4 ? "warning" : "danger"}
                          className="text-[10px] shrink-0"
                        >
                          {Math.round(ext.confidence * 100)}%
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            
            {/* Phase 2.2 — matched student records */}
            {docMatch && docMatch.candidates.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Matched student records</p>
                <div className="space-y-1.5">
                  {docMatch.candidates.map((c) => (
                    <button
                      key={c.studentId}
                      onClick={() => setSelectedRecordId(c.studentId)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left cursor-pointer transition-colors ${
                        selectedRecordId === c.studentId
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40 hover:bg-primary/[0.03]"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {c.name}{" "}
                          <span className="text-muted-foreground font-mono text-xs">
                            ({c.admNo})
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {Math.round(c.score * 100)}% name match
                          {c.existingCategories.length > 0 &&
                            ` · already has: ${c.existingCategories.join(", ")}`}
                        </p>
                      </div>
                      {c.alreadyApplied ? (
                        <Badge variant="warning">Already applied</Badge>
                      ) : selectedRecordId === c.studentId ? (
                        <Badge variant="success">Selected</Badge>
                      ) : (
                        <Badge variant="secondary">Use this record</Badge>
                      )}
                    </button>
                  ))}
                </div>
                {docMatch.candidates.some((c) => c.alreadyApplied) && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    A{" "}
                    {DOCUMENT_TYPES.find((d) => d.value === documentType)?.label ??
                      "document"}{" "}
                    of this type is already applied to a matched student — saving will update their
                    field values.
                  </p>
                )}
              </div>
            )}

            {/* Record selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Student Record</label>
              <Select
                value={selectedRecordId}
                onChange={(e) => setSelectedRecordId(e.target.value)}
                className="h-9"
              >
                <option value="">— Select student —</option>
                {(students ?? []).map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.firstName} {s.lastName} ({s.admNo})
                  </option>
                ))}
              </Select>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("capture")}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <Button
                onClick={handleSave}
                disabled={!selectedRecordId || extractions.length === 0}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" /> Save {extractions.length} Fields
              </Button>
            </div>
          </div>
        )}
        
        {/* ── Step 4: Done ─────────────────────────────────── */}
        {step === "done" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl border border-green-200 bg-green-50">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-green-800">Extraction saved</p>
                <p className="text-xs text-green-700 mt-1">
                  {extractions.length} field values were written to the student record.
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>Close</Button>
              <Button onClick={reset}>Scan Another Document</Button>
            </div>
          </div>
        )}
        
        {/* Hidden canvas for photo capture */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </Modal>
  );
}

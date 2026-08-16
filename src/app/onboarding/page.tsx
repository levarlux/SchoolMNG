"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { useOrganization, useClerk } from "@clerk/clerk-react";
import { api } from "../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { ImportStudio } from "@/components/import-studio";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import Papa from "papaparse";
import { readSheet, type SheetData } from "read-excel-file/browser";
import { processDocument, detectFileType, type FileType } from "@/lib/document-processor";
import { classifyDocumentFile, KIND_GUIDES, type DocKind } from "@/lib/file-classifier";
import { ArrowRight, ArrowLeft, Check, School, Users, GraduationCap, BookOpen, Shield, Bell, Upload, Sparkles, CheckCircle2, Heart, Briefcase, Stethoscope, Bus, Wrench, MessageSquare, ClipboardList, Workflow, UserPlus, ImagePlus, UploadCloud, Trash2, XCircle, Home, FlaskConical, Monitor, Trophy, FileSpreadsheet, FileDown, Download } from "lucide-react";
import { OnboardingLayout } from "@/components/onboarding-layout";
import { WelcomeTour } from "@/components/welcome-tour";

const STORAGE_KEY = "schoolmng_onboarding_progress";

// ── Document parsing helpers ────────────────────────────────────────
// Lightweight column auto-detection for onboarding documents.
// Returns extracted data that can pre-fill onboarding fields.

interface ParsedDocument {
  fileName: string;
  fileType: FileType;
  rowCount: number;
  headers: string[];
  // Smart classification (same tool the importer uses) so a teacher list,
  // fee schedule, or attendance register is never mixed into Students.
  detectedKind: DocKind;
  detectedConfidence: "high" | "medium" | "low";
  detectedSignals: string[];
  // Extracted insights
  schoolName?: string;
  studentCount?: number;
  classNames: string[];
  teacherNames: string[];
  feeAmounts: string[];
  // Raw first few rows for preview
  sampleRows: Record<string, string>[];
  // For PDFs and images
  isScanned?: boolean;
  confidence?: number;
  text?: string;
}

type DocQueueItem = {
  id: string;
  fileName: string;
  status: "pending" | "parsing" | "ready" | "error";
  error?: string;
  doc?: ParsedDocument;
};

function normalizeCol(h: string) {
  return h.toLowerCase().trim().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function detectColumnType(header: string): string | null {
  const h = normalizeCol(header);
  if (["student name", "name", "learner name", "pupil name", "full name", "student"].some(a => h.includes(a))) return "studentName";
  if (["class", "grade", "form", "class name"].some(a => h.includes(a))) return "className";
  if (["teacher", "staff name", "full name", "employee"].some(a => h.includes(a))) return "teacherName";
  if (["fee", "amount", "cost", "tuition", "school fees"].some(a => h.includes(a))) return "feeAmount";
  if (["stream", "arm", "section"].some(a => h.includes(a))) return "streamName";
  if (["phone", "mobile", "tel", "contact"].some(a => h.includes(a))) return "phone";
  if (["gender", "sex"].some(a => h.includes(a))) return "gender";
  if (["admission", "adm no", "reg no", "student no"].some(a => h.includes(a))) return "admNo";
  if (["subject", "course"].some(a => h.includes(a))) return "subject";
  return null;
}

async function parseDocument(file: File): Promise<ParsedDocument> {
  // Use the new document processor for all file types
  const processed = await processDocument(file);

  // Run the SAME smart classifier the importer uses so each document is
  // labeled with what it actually is (students/staff/fees/attendance/school
  // info) instead of being sniffed column-by-column and mixed into the
  // wrong section.
  const cls = classifyDocumentFile(
    processed.allHeaders,
    processed.sampleRows as Record<string, unknown>[],
    file.name,
    // PDF/DOCX/image prose (policy, reports, profile) has no tabular rows —
    // pass the extracted text so it is recognized instead of coming back
    // empty/unknown.
    processed.extractedData[0]?.text
  );

  return {
    fileName: processed.fileName,
    fileType: processed.fileType,
    rowCount: processed.totalRows,
    headers: processed.allHeaders,
    detectedKind: cls.kind,
    detectedConfidence: cls.confidence,
    detectedSignals: cls.signals,
    schoolName: processed.schoolName,
    studentCount: processed.studentCount,
    classNames: processed.classNames,
    teacherNames: processed.teacherNames,
    feeAmounts: processed.feeAmounts,
    sampleRows: processed.sampleRows,
    isScanned: processed.extractedData[0]?.isScanned,
    confidence: processed.extractedData[0]?.confidence,
    text: processed.extractedData[0]?.text,
  };
}

interface OnboardingData {
  // Step 1: School basics
  schoolName: string;
  schoolType: string;
  leadershipTitle: string; // "Principal", "Headteacher", "Director", etc.
  customLeadershipTitle: string;
  isBoarding: boolean;
  logoPreview?: string;
  termsPerYear: number;
  currentTermName: string;
  currentTermYear: number;
  // Step 2: School context
  feePerStudent: string;
  feePerTerm: Record<number, string>; // per-term fees: {1: "1000", 2: "1200", ...} 
  feeSameForAllTerms: boolean;
  feeFrequency: string;
  facilities: Record<string, boolean>;
  customFacilities: string[];
  headcountLearners: string;
  headcountStaff: string;
  campuses: string;
  establishedYear: string;
  recordsManagement: string;
  // Step 3: Setup route
  setupRoute: "guided" | "upload";
  // Steps 4-7: Module toggles
  enabledModules: Record<string, boolean>;
  bucketLabel: string;
  classTeacherAssignment: boolean;
  nonTeachingRoles: Record<string, boolean>;
  customRoles: string[];
  // Step 8: Guardians
  enableParentPortal: boolean;
  guardianModules: Record<string, boolean>;
  // Step 9: Notifications
  enabledNotifications: Record<string, boolean>;
  notificationRecipients: Record<string, string>;
}

const STEPS = [
  { id: 1, title: "School Basics", icon: School, description: "Name, type, terms, logo" },
  { id: 2, title: "School Context", icon: ClipboardList, description: "Fees, facilities, headcount" },
  { id: 3, title: "Setup Route", icon: Workflow, description: "Guided vs upload documents" },
  { id: 4, title: "Learners", icon: Users, description: "Student management modules" },
  { id: 5, title: "Teaching Staff", icon: GraduationCap, description: "Teacher and academic modules" },
  { id: 6, title: "Non-Teaching Staff", icon: Briefcase, description: "Support staff roles" },
  { id: 7, title: "Administration", icon: BookOpen, description: "Finance and admin modules" },
  { id: 8, title: "Guardians", icon: Heart, description: "Parent/guardian portal" },
  { id: 9, title: "Notifications", icon: Bell, description: "Alert and notification rules" },
  { id: 10, title: "Review", icon: Shield, description: "Review your configuration" },
  { id: 11, title: "Staff Accounts", icon: UserPlus, description: "Add team members" },
  { id: 12, title: "Import Data", icon: Upload, description: "Import existing student data" },
  { id: 13, title: "Done", icon: CheckCircle2, description: "You're all set!" },
];

// Route B (upload) skips manual data-entry steps but includes document upload + import.
const UPLOAD_SEQUENCE = [1, 2, 3, 4, 12, 13];

const MODULE_GROUPS = {
  learners: [
    { key: "health", label: "Health Records", icon: Stethoscope, description: "Student health, clinic visits, counseling" },
    { key: "discipline", label: "Discipline", icon: Shield, description: "Incident tracking and resolution" },
    { key: "extracurricular", label: "Extracurricular", icon: Sparkles, description: "Clubs, sports, activities" },
  ],
  teaching: [
    { key: "lessonPlanning", label: "Lesson Planning", icon: BookOpen, description: "Schemes of work and lesson plans" },
    { key: "dutyRoster", label: "Duty Roster", icon: Users, description: "Staff duty assignments" },
    { key: "staffAttendance", label: "Staff Attendance", icon: GraduationCap, description: "Teacher sign-in/out" },
    { key: "hr", label: "HR & Leave", icon: Briefcase, description: "Leave requests and appraisals" },
    { key: "parentMeetings", label: "Parent Meetings", icon: MessageSquare, description: "Meeting logs" },
  ],
  nonTeaching: [
    { key: "medical", label: "Medical Supplies", icon: Stethoscope, description: "Clinic inventory and vaccinations" },
    { key: "transport", label: "Transport", icon: Bus, description: "Routes and vehicle maintenance" },
    { key: "gateLog", label: "Gate Log", icon: Shield, description: "Visitor and student gate log" },
    { key: "maintenance", label: "Maintenance", icon: Wrench, description: "Facility tasks and issues" },
    { key: "bookHolds", label: "Book Holds", icon: BookOpen, description: "Library reservations" },
  ],
  admin: [
    { key: "admissions", label: "Admissions", icon: Users, description: "Application tracking" },
    { key: "expenditures", label: "Expenditures", icon: Briefcase, description: "Expense tracking and budgets" },
    { key: "correspondence", label: "Correspondence", icon: MessageSquare, description: "School mail and letters" },
    { key: "appointments", label: "Appointments", icon: Bell, description: "Scheduling" },
  ],
};

const NOTIFICATION_TRIGGERS = [
  { key: "feeOverdue", label: "Fee Overdue", description: "Alert when student fees are past due" },
  { key: "bookOverdue", label: "Book Overdue", description: "Alert when library books are overdue" },
  { key: "leaveRequest", label: "Leave Request", description: "Notify when staff submit leave requests" },
  { key: "disciplineCase", label: "Discipline Case", description: "Alert on new discipline incidents" },
  { key: "lowInventory", label: "Low Inventory", description: "Alert when supplies run low" },
  { key: "newAdmission", label: "New Admission", description: "Notify on new application submissions" },
  { key: "appraisalDue", label: "Appraisal Due", description: "Reminder for staff appraisals" },
];

const FACILITIES = [
  { key: "boarding", label: "Boarding & hostels", icon: Home },
  { key: "transport", label: "Transport / buses", icon: Bus },
  { key: "library", label: "Library", icon: BookOpen },
  { key: "scienceLabs", label: "Science labs", icon: FlaskConical },
  { key: "clinic", label: "Clinic / sickbay", icon: Stethoscope },
  { key: "computerLab", label: "Computer lab", icon: Monitor },
  { key: "sports", label: "Sports facilities", icon: Trophy },
];

const FACILITY_SUGGESTIONS = [
  { keyword: "music", label: "Music room" },
  { keyword: "hall", label: "Multi-purpose hall" },
  { keyword: "kitchen", label: "Kitchen / dining hall" },
  { keyword: "farm", label: "Farm / garden" },
  { keyword: "art", label: "Art studio" },
  { keyword: "gym", label: "Gymnasium" },
  { keyword: "pool", label: "Swimming pool" },
  { keyword: "chapel", label: "Chapel / mosque" },
  { keyword: "field", label: "Playing field / pitch" },
  { keyword: "computer", label: "Computer lab" },
];

const RECORDS_OPTIONS = [
  { value: "paper", label: "Paper-based (registers, files)" },
  { value: "spreadsheets", label: "Spreadsheets (Excel, Google Sheets)" },
  { value: "software", label: "Another software system" },
  { value: "mixed", label: "Mixed — a bit of everything" },
];

const NON_TEACHING_ROLES = [
  { key: "librarian", label: "Librarian" },
  { key: "nurse", label: "Nurse" },
  { key: "driver", label: "Driver" },
  { key: "cook", label: "Cook" },
  { key: "watchman", label: "Watchman / security" },
  { key: "cleaner", label: "Cleaner" },
];

const DEFAULT_ROLE_OPTIONS = [
  { key: "teacher", label: "Teacher" },
  { key: "principal", label: "Principal" }, // fallback label; overridden at render time
];

const SCHOOL_TYPES = [
  "Primary School",
  "Secondary School",
  "Primary & Secondary",
  "Kindergarten",
  "Mixed (K-12)",
  "College",
  "University",
  "Other",
];

export default function OnboardingPage() {
  const router = useRouter();
  const school = useSchool();
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const clerk = useClerk();
  const createSession = useMutation(api.onboarding.createSession);
  const updateStep = useMutation(api.onboarding.updateStep);
  const completeOnboarding = useMutation(api.onboarding.completeOnboarding);
  const analyzeTier = useAction(api.tierAssignment.analyzeAndAssignTier);
  const addMessage = useMutation(api.onboarding.addMessage);
  const provisionSchool = useMutation(api.onboarding.provisionSchool);
  const updateMySchool = useMutation(api.schools.updateMySchool);
  const setLeadershipTitle = useMutation(api.roles.setLeadershipTitle);
  const chatWithAgent = useAction(api.aiAssistant.chat);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const setMyLogo = useMutation(api.files.setMyLogo);
  const existingSession = useQuery(
    api.onboarding.getSession,
    school ? { schoolId: school._id } : "skip"
  );

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [customRoleInput, setCustomRoleInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  // Document upload state (multi-file queue)
  const [docQueue, setDocQueue] = useState<DocQueueItem[]>([]);
  const [docParsing, setDocParsing] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [docConfirmed, setDocConfirmed] = useState(false);
  const [customFacilityInput, setCustomFacilityInput] = useState("");

  // Aggregate across all successfully parsed files.
  const parsedDocs = useMemo(
    () => docQueue.filter((q) => q.status === "ready" && q.doc).map((q) => q.doc!),
    [docQueue]
  );
  const totalStudents = useMemo(
    () => parsedDocs.reduce((n, d) => n + (d.studentCount ?? 0), 0),
    [parsedDocs]
  );
  const allClassNames = useMemo(
    () => [...new Set(parsedDocs.flatMap((d) => d.classNames))],
    [parsedDocs]
  );
  const allTeacherNames = useMemo(
    () => [...new Set(parsedDocs.flatMap((d) => d.teacherNames))],
    [parsedDocs]
  );
  const allFeeAmounts = useMemo(
    () => [...new Set(parsedDocs.flatMap((d) => d.feeAmounts))],
    [parsedDocs]
  );
  const totalRows = useMemo(
    () => parsedDocs.reduce((n, d) => n + d.rowCount, 0),
    [parsedDocs]
  );
  // Per-kind breakdown of parsed documents (students/staff/fees/attendance/
  // school-info) so nothing gets silently mixed into the wrong section.
  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of parsedDocs) {
      counts[d.detectedKind] = (counts[d.detectedKind] ?? 0) + 1;
    }
    return counts;
  }, [parsedDocs]);
  const kindBreakdown = useMemo(
    () =>
      Object.entries(kindCounts).map(([kind, count]) => ({
        kind: kind as DocKind,
        count,
      })),
    [kindCounts]
  );

  // Add files to the queue and parse them one at a time (in order).
  const handleDocFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setDocError(null);
    setDocConfirmed(false);
    const items: DocQueueItem[] = files.map((f) => ({
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      fileName: f.name,
      status: "pending",
    }));
    setDocQueue((q) => [...q, ...items]);

    for (const item of items) {
      const file = files.find((f) => f.name === item.fileName);
      if (!file) continue;
      setDocQueue((q) =>
        q.map((it) => (it.id === item.id ? { ...it, status: "parsing" } : it))
      );
      setDocParsing(true);
      try {
        const doc = await parseDocument(file);
        setDocQueue((q) =>
          q.map((it) => (it.id === item.id ? { ...it, status: "ready", doc } : it))
        );
      } catch (err) {
        setDocQueue((q) =>
          q.map((it) =>
            it.id === item.id
              ? { ...it, status: "error", error: err instanceof Error ? err.message : "Failed to parse file" }
              : it
          )
        );
        setDocError(err instanceof Error ? err.message : "One or more files could not be read");
      } finally {
        setDocParsing(false);
      }
    }
  }, []);

  const removeDocFile = useCallback((id: string) => {
    setDocQueue((q) => q.filter((it) => it.id !== id));
  }, []);

  const [createMissingClassesOnImport, setCreateMissingClassesOnImport] = useState(true);
  const [showImportStudio, setShowImportStudio] = useState(false);
  const [showWelcomeTour, setShowWelcomeTour] = useState(true);
  const [chatCollapsed, setChatCollapsed] = useState(false);

  function getDefaultData(): OnboardingData {
    // Enable all modules by default
    const enabledModules: Record<string, boolean> = {};
    Object.values(MODULE_GROUPS).forEach((group) => {
      group.forEach((m) => { enabledModules[m.key] = true; });
    });

    const enabledNotifications: Record<string, boolean> = {};
    const notificationRecipients: Record<string, string> = {};
    NOTIFICATION_TRIGGERS.forEach((n) => {
      enabledNotifications[n.key] = true;
      notificationRecipients[n.key] = "principal";
    });

    const nonTeachingRoles: Record<string, boolean> = {};
    NON_TEACHING_ROLES.forEach((r) => { nonTeachingRoles[r.key] = true; });

    const facilities: Record<string, boolean> = {};
    FACILITIES.forEach((f) => { facilities[f.key] = false; });

    const guardianModules: Record<string, boolean> = {};
    MODULE_GROUPS.learners.forEach((m) => { guardianModules[m.key] = true; });

    return {
      schoolName: "",
      schoolType: "Primary & Secondary",
      leadershipTitle: "Principal",
      customLeadershipTitle: "",
      isBoarding: false,
      termsPerYear: 3,
      currentTermName: "Term 1",
      currentTermYear: new Date().getFullYear(),
      feePerStudent: "",
      feePerTerm: {},
      feeSameForAllTerms: true,
      feeFrequency: "per term",
      facilities,
      customFacilities: [],
      headcountLearners: "",
      headcountStaff: "",
      campuses: "",
      establishedYear: "",
      recordsManagement: "mixed",
      setupRoute: "guided",
      enabledModules,
      bucketLabel: "Learners",
      classTeacherAssignment: true,
      nonTeachingRoles,
      customRoles: [],
      enableParentPortal: true,
      guardianModules,
      enabledNotifications,
      notificationRecipients,
    };
  }

  // Load saved progress from localStorage (merge so old saves get new defaults).
  // IMPORTANT: Always return the default (guided) on first render to avoid
  // hydration mismatch — the server has no localStorage access.
  const [data, setData] = useState<OnboardingData>(getDefaultData);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on client only
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setData((prev) => ({ ...prev, ...parsed }));
      }
    } catch {}
    setHydrated(true);
  }, []);

  // Save progress to localStorage on every change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [data]);

  // Prevent body scrolling during onboarding
  useEffect(() => {
    document.body.classList.add("no-scroll");
    return () => {
      document.body.classList.remove("no-scroll");
    };
  }, []);

  // The step sequence depends on the chosen setup route (Route B skips data entry).
  const activeSequence = useMemo(
    () => (data.setupRoute === "upload" ? UPLOAD_SEQUENCE : STEPS.map((s) => s.id)),
    [data.setupRoute]
  );
  const totalSteps = activeSequence.length;
  const currentStepId = activeSequence[Math.min(step, totalSteps - 1)];
  const currentStepDef = STEPS.find((s) => s.id === currentStepId) ?? STEPS[0];

  function updateData(partial: Partial<OnboardingData>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  const addCustomFacility = useCallback((facility: string) => {
    const trimmed = facility.trim();
    if (!trimmed) return;
    setCustomFacilityInput("");
    updateData({
      customFacilities: data.customFacilities.includes(trimmed)
        ? data.customFacilities
        : [...data.customFacilities, trimmed],
    });
  }, [data.customFacilities]);

  const removeCustomFacility = useCallback((facility: string) => {
    updateData({ customFacilities: data.customFacilities.filter((f) => f !== facility) });
  }, [data.customFacilities]);

  function toggleModule(key: string) {
    setData((prev) => ({
      ...prev,
      enabledModules: { ...prev.enabledModules, [key]: !prev.enabledModules[key] },
    }));
  }

  function toggleNotification(key: string) {
    setData((prev) => ({
      ...prev,
      enabledNotifications: { ...prev.enabledNotifications, [key]: !prev.enabledNotifications[key] },
    }));
  }

  function setNotificationRecipient(key: string, recipient: string) {
    setData((prev) => ({
      ...prev,
      notificationRecipients: { ...prev.notificationRecipients, [key]: recipient },
    }));
  }

  // Restore server-saved progress only once on mount. Re-firing on every
  // query invalidation would yank the wizard back to the persisted step
  // right after the user clicks Continue (the query re-resolves when we
  // persist progress).
  const didInitialSync = useRef(false);
  useEffect(() => {
    if (didInitialSync.current) return;
    if (existingSession && existingSession.status === "in_progress") {
      didInitialSync.current = true;
      const idx = activeSequence.indexOf(existingSession.currentStep);
      setStep(idx >= 0 ? idx : 0);
      if (existingSession.conversationHistory.length > 0) {
        setChatMessages(existingSession.conversationHistory);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSession]);

  // Clamp position when the route choice changes the step count
  useEffect(() => {
    setStep((s) => Math.min(s, totalSteps - 1));
  }, [totalSteps]);

  // If no school exists yet (the organization.created webhook may never
  // have reached Convex), provision one so onboarding always has a school.
  // Idempotent server-side, so racing the initial queries is harmless.
  useEffect(() => {
    if (school) return;
    if (!orgLoaded) return;
    if (provisioning || provisionError) return;
    // Don't try to provision if user is not authenticated
    if (!organization?.id) return;

    let cancelled = false;
    setProvisioning(true);
    provisionSchool({
      name: organization?.name ?? undefined,
      slug: organization?.slug ?? undefined,
      leadershipTitle: data.leadershipTitle !== "__custom__" ? data.leadershipTitle : undefined,
    })
      .then(() => {
        // Keep the loader up until the school query resolves; the success
        // branch below drops it the moment `school` becomes non-null.
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setProvisioning(false);
        setProvisionError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [school, orgLoaded, provisioning, provisionError, organization?.id, provisionSchool]);

  // Drop the provisioning loader as soon as the school query resolves.
  useEffect(() => {
    if (school && provisioning) setProvisioning(false);
  }, [school, provisioning]);

  async function handleCreateOrg() {
    try {
      await clerk.createOrganization({
        name: "My School",
        // createOrganization sets the new org active on the session
      });
      setProvisionError(null);
    } catch (err: unknown) {
      toast.error("Could not create your school organisation");
      console.error("[onboarding] createOrganization error:", err);
    }
  }

  // ── Required-field validation (P2 #17) ──────────────────────────
  // Returns null if valid, or an error message string if the step cannot advance.
  function validateCurrentStep(): string | null {
    switch (currentStepId) {
      case 1: // School Basics
        if (!data.schoolName.trim()) return "School name is required. Please enter your school's name.";
        if (!data.currentTermName.trim()) return "Current term name is required.";
        if (!data.currentTermYear || data.currentTermYear < 2020) return "Please enter a valid academic year.";
        return null;
      case 2: // School Context
        // Optional but validate headcount if provided
        if (data.headcountLearners && isNaN(Number(data.headcountLearners)))
          return "Learner headcount must be a number.";
        if (data.headcountStaff && isNaN(Number(data.headcountStaff)))
          return "Staff headcount must be a number.";
        return null;
      case 4: // Learners modules
      case 5: // Teaching Staff modules
      case 6: // Non-Teaching Staff modules
      case 7: // Administration modules
        // Module toggles — always valid (defaults are set)
        return null;
      case 8: // Guardians
        return null;
      case 9: // Notifications
        return null;
      case 10: // Review
        return null;
      case 11: // Staff Accounts
        return null;
      case 12: // Import Data
        return null;
      default:
        return null;
    }
  }

  const [validationError, setValidationError] = useState<string | null>(null);

  async function nextStep() {
    // Validate required fields before advancing
    const error = validateCurrentStep();
    if (error) {
      setValidationError(error);
      toast.error(error);
      return;
    }
    setValidationError(null);

    const next = Math.min(step + 1, totalSteps - 1);
    setStep(next);

    // Persist to server if school exists — save the step we're going TO so
    // the server state matches what the user sees (avoids the session sync
    // snapping the wizard back to the step we just left).
    if (school) {
      try {
        await updateStep({
          schoolId: school._id,
          step: activeSequence[next],
          answers: data,
        });
      } catch (err) {
        console.error("Failed to save onboarding progress:", err);
      }
    }
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function finishOnboarding() {
    setSaving(true);
    setLaunching(true);
    try {
      if (school) {
        // Persist the name the principal typed in Step 1 (the Clerk org may
        // still be named differently if the webhook never synced it).
        const schoolName = data.schoolName.trim();
        if (schoolName && schoolName !== school.name) {
          await updateMySchool({ name: schoolName });
        }
        // Save the leadership title (skip sentinel value)
        const title = data.leadershipTitle.trim();
        if (title && title !== "__custom__") {
          await setLeadershipTitle({ schoolId: school._id, title });
        } else if (data.customLeadershipTitle.trim()) {
          await setLeadershipTitle({ schoolId: school._id, title: data.customLeadershipTitle.trim() });
        }
         // 1. Complete the onboarding session + apply module/facility selections
        await completeOnboarding({ schoolId: school._id, answers: data });
        // 2. Trigger AI tier analysis (non-blocking — don't fail onboarding if tier analysis fails)
        analyzeTier({ schoolId: school._id }).then((result) => {
          if (result?.tierName) {
            toast.success(`AI recommendation: ${result.tierName} plan (Score: ${result.score}/100)`);
          }
        }).catch((err) => {
          console.error("[onboarding] Tier analysis failed (non-critical):", err);
        });
      }
      localStorage.removeItem(STORAGE_KEY);
      toast.success("Onboarding complete! Welcome to SchoolMNG.");
      // Hold the launch screen briefly so the handoff feels smooth, then
      // replace (not push) so the back button can't return to onboarding.
      setTimeout(() => router.replace("/dashboard"), 1400);
    } catch (err) {
      setLaunching(false);
      toast.error("Failed to save onboarding progress");
    } finally {
      setSaving(false);
    }
  }

  // Initialize session on mount if school exists
  useEffect(() => {
    if (school && !existingSession) {
      createSession({ schoolId: school._id }).catch(console.error);
    }
  }, [school, existingSession, createSession]);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!result.ok) throw new Error(`Upload failed: ${result.statusText}`);
      const { storageId } = await result.json();
      await setMyLogo({ storageId });
      setData((prev) => ({ ...prev, logoPreview: URL.createObjectURL(file) }));
      toast.success("Logo uploaded!");
    } catch (err) {
      toast.error("Failed to upload logo. You can add it later from Settings.");
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  }

  function addCustomRole() {
    const role = customRoleInput.trim();
    if (!role) return;
    setData((prev) => ({
      ...prev,
      customRoles: prev.customRoles.includes(role) ? prev.customRoles : [...prev.customRoles, role],
    }));
    setCustomRoleInput("");
  }

  function removeCustomRole(role: string) {
    setData((prev) => ({
      ...prev,
      customRoles: prev.customRoles.filter((r) => r !== role),
    }));
  }

  // Send a chat message
  const sendMessage = useCallback(async () => {
    if (!chatInput.trim() || !school || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    try {
      await addMessage({
        schoolId: school._id,
        role: "user",
        content: userMessage,
      });
    } catch (err) {
      console.error("Failed to save message:", err);
    }

    setChatLoading(true);
    try {
      const result = await chatWithAgent({
        message: userMessage,
        schoolId: school._id,
        entryPoint: "onboarding",
        moduleName: currentStepDef.title,
        onboardingAnswers: data,
        history: chatMessages,
      });
      const reply = result.response;
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      try {
        await addMessage({ schoolId: school._id, role: "assistant", content: reply });
      } catch (err) {
        console.error("Failed to save assistant message:", err);
      }
    } catch (err) {
      console.error("Failed to get assistant reply:", err);
      const fallback = "Sorry, I couldn't reach the assistant right now. Please try again.";
      setChatMessages((prev) => [...prev, { role: "assistant", content: fallback }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, school, addMessage, chatWithAgent, currentStepDef.title, data, chatMessages]);

  const enabledCount = Object.values(data.enabledModules).filter(Boolean).length;
  const notifCount = Object.values(data.enabledNotifications).filter(Boolean).length;
  const enabledFacilities = FACILITIES.filter((f) => data.facilities[f.key]).map((f) => f.label);
  const isUploadRoute = data.setupRoute === "upload";
  const logoUrl = data.logoPreview || school?.logoUrl;

  return (
    <>
      {launching && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-6 animate-in fade-in duration-500">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center">
            <School className="h-10 w-10 text-primary animate-pulse" />
          </div>
          <div className="text-center">
            <p className="text-xl font-bold">{school?.name ?? "Your school"}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your dashboard is being populated…
            </p>
          </div>
          <BrandLoader variant="book" size="md" />
        </div>
      )}

      {provisioning && (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <School className="h-8 w-8 text-primary animate-pulse" />
          </div>
          <p className="text-lg font-semibold">Setting up your school…</p>
          <p className="text-sm text-muted-foreground">
            Creating your school workspace. This only takes a moment.
          </p>
          <BrandLoader variant="book" size="md" />
        </div>
      )}

      {provisionError && (
        <div className="min-h-screen flex items-center justify-center p-6">
          <Card className="w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-3">
                  <Shield className="h-7 w-7 text-red-500" />
                </div>
                <h2 className="text-xl font-bold">We couldn&apos;t set up your school</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  {provisionError.includes("Not authenticated") 
                    ? "Your session has expired. Please sign in again to continue."
                    : provisionError}
                </p>
              </div>
              {provisionError.includes("Not authenticated") ? (
                <Button className="w-full" onClick={() => router.push("/sign-in")}>
                  Sign In Again
                </Button>
              ) : (
                <>
                  <Button className="w-full" onClick={handleCreateOrg}>
                    Create your school organisation
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setProvisionError(null)}
                  >
                    Retry
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!provisioning && !provisionError && (

      <>
      {/* Welcome Tour */}
      {showWelcomeTour && (
        <WelcomeTour
          onComplete={() => setShowWelcomeTour(false)}
          onDismiss={() => setShowWelcomeTour(false)}
        />
      )}

      <OnboardingLayout
        currentStep={Math.min(step, totalSteps - 1)}
        totalSteps={totalSteps}
        stepTitle={currentStepDef.title}
        stepDescription={currentStepDef.description}
        stepIcon={currentStepDef.icon}
        steps={activeSequence.map((sid) => STEPS.find((s) => s.id === sid)!).filter(Boolean)}
        onStepClick={(idx) => setStep(idx)}
      >
            {/* Step 1: School Basics */}
            {currentStepId === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">School Basics</h2>
                  <p className="text-sm text-muted-foreground">Tell us about your school</p>
                </div>
                <div className="space-y-4 max-w-lg">
                  <div>
                    <Label>School Name *</Label>
                    <Input
                      value={data.schoolName}
                      onChange={(e) => updateData({ schoolName: e.target.value })}
                      placeholder="e.g. Nairobi Academy"
                    />
                  </div>
                  <div>
                    <Label>School Type</Label>
                    <Select value={data.schoolType} onChange={(e) => updateData({ schoolType: e.target.value })}>
                      {SCHOOL_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Head of School Title</Label>
                    <Select value={data.leadershipTitle === "__custom__" ? "__custom__" : data.leadershipTitle} onChange={(e) => updateData({ leadershipTitle: e.target.value, customLeadershipTitle: "" })}>
                      <option value="Principal">Principal</option>
                      <option value="Headteacher">Headteacher</option>
                      <option value="Head Master">Head Master</option>
                      <option value="Director">Director</option>
                      <option value="Rector">Rector</option>
                      <option value="Deputy Rector">Deputy Rector</option>
                      <option value="Dean">Dean</option>
                      <option value="Chancellor">Chancellor</option>
                      <option value="Manager">Manager</option>
                      <option value="Proprietor">Proprietor</option>
                      <option value="__custom__">Other (type below)...</option>
                    </Select>
                    {data.leadershipTitle === "__custom__" && (
                      <Input
                        autoFocus
                        value={data.customLeadershipTitle}
                        onChange={(e) => updateData({ customLeadershipTitle: e.target.value })}
                        placeholder="e.g. Proprietor, Managing Director"
                        className="mt-2"
                      />
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      This is used across the app wherever the school head is referenced. Changeable later from Settings.
                    </p>
                  </div>
                  <label className="flex items-center gap-3 p-4 rounded-xl border border-border cursor-pointer hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={data.isBoarding}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        updateData({
                          isBoarding: checked,
                          facilities: { ...data.facilities, boarding: checked },
                        });
                      }}
                      className="w-4 h-4"
                    />
                    <div>
                      <p className="font-medium text-sm">Boarding School</p>
                      <p className="text-xs text-muted-foreground">Enable boarding/house management features</p>
                    </div>
                  </label>

                  {/* Logo (optional) */}
                  <div>
                    <Label>School Logo (optional)</Label>
                    <div className="flex items-center gap-4 mt-1">
                      <div className="w-16 h-16 rounded-xl border border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
                        {logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logoUrl} alt="School logo" className="w-full h-full object-cover" />
                        ) : (
                          <ImagePlus className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="logo-upload">
                          <div className="inline-flex items-center justify-center rounded-lg font-medium transition-colors border border-border bg-transparent hover:bg-muted h-8 px-3 text-sm cursor-pointer">
                            {uploadingLogo ? <BrandLoader variant="dots" size="sm" className="mr-1" /> : <ImagePlus className="h-4 w-4 mr-1" />}
                            {logoUrl ? "Change logo" : "Upload logo"}
                          </div>
                        </Label>
                        <Input
                          id="logo-upload"
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          disabled={uploadingLogo}
                          className="hidden"
                        />
                        <p className="text-xs text-muted-foreground mt-1">PNG or JPG. You can change this anytime in Settings.</p>
                      </div>
                    </div>
                  </div>

                  {/* Terms per year */}
                  <div>
                    <Label>Terms / semesters per academic year</Label>
                    <Select
                      value={String(data.termsPerYear)}
                      onChange={(e) => updateData({ termsPerYear: Number(e.target.value) })}
                    >
                      <option value="2">2 terms</option>
                      <option value="3">3 terms</option>
                      <option value="4">4 semesters</option>
                    </Select>
                  </div>

                  {/* Current term setup */}
                  <div>
                    <Label>Current term setup</Label>
                    <div className="grid grid-cols-2 gap-3 mt-1">
                      <Input
                        value={data.currentTermName}
                        onChange={(e) => updateData({ currentTermName: e.target.value })}
                        placeholder="e.g. Term 1"
                      />
                      <Input
                        type="number"
                        value={data.currentTermYear}
                        onChange={(e) => updateData({ currentTermYear: Number(e.target.value) })}
                        placeholder="Year"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      This feeds your academic year setup — you can adjust it later from Settings.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: School Context */}
            {currentStepId === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">School Context</h2>
                  <p className="text-sm text-muted-foreground">
                    A few questions about how your school operates — these help the assistant give you relevant help.
                  </p>
                </div>

                <div className="space-y-4 max-w-lg">
                <div>
                     <Label>Fee structure per student</Label>
                     <p className="text-xs text-muted-foreground mb-2">
                       Fees can be the same for every term, or vary by term.
                     </p>
                     <div className="flex items-center gap-4 mt-2 mb-3">
                       <label className="flex items-center gap-2 text-sm cursor-pointer">
                         <input
                           type="radio"
                           name="feeSameForAllTerms"
                           checked={data.feeSameForAllTerms}
                           onChange={() => updateData({ feeSameForAllTerms: true })}
                           className="w-4 h-4"
                         />
                         <span>Same fee for all terms</span>
                       </label>
                       <label className="flex items-center gap-2 text-sm cursor-pointer">
                         <input
                           type="radio"
                           name="feeSameForAllTerms"
                           checked={!data.feeSameForAllTerms}
                           onChange={() => updateData({ feeSameForAllTerms: false })}
                           className="w-4 h-4"
                         />
                         <span>Different fee per term</span>
                       </label>
                     </div>

                     {data.feeSameForAllTerms ? (
                       <div className="flex gap-3 mt-1">
                         <Input
                           value={data.feePerStudent}
                           onChange={(e) => updateData({ feePerStudent: e.target.value })}
                           placeholder="e.g. 8,000 – 15,000"
                         />
                         <Select
                           value={data.feeFrequency}
                           onChange={(e) => updateData({ feeFrequency: e.target.value })}
                           className="w-36"
                         >
                           <option value="per term">per term</option>
                           <option value="per year">per year</option>
                         </Select>
                       </div>
                     ) : (
                       <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
                         {Array.from({ length: data.termsPerYear }, (_, i) => i + 1).map((termNum) => (
                           <div key={termNum}>
                             <Label className="text-xs">Term {termNum}</Label>
                             <Input
                               value={data.feePerTerm[termNum] || ""}
                               onChange={(e) =>
                                 updateData({
                                   feePerTerm: { ...data.feePerTerm, [termNum]: e.target.value },
                                 })
                               }
                               placeholder="e.g. 8,000"
                               className="mt-1"
                             />
                           </div>
                         ))}
                       </div>
                     )}

                     {!data.feeSameForAllTerms && (
                       <Select
                         value={data.feeFrequency}
                         onChange={(e) => updateData({ feeFrequency: e.target.value })}
                         className="mt-2 w-36"
                       >
                         <option value="per term">fees shown per term</option>
                         <option value="per year">fees shown per year</option>
                       </Select>
                     )}

                     <p className="text-xs text-muted-foreground mt-2">
                       Leave blank if unsure — you can set this up later from Settings &gt; Fees.
                     </p>
                    </div>

                   <div>
                    <Label>Facilities present</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                      {FACILITIES.map((f) => {
                        const Icon = f.icon;
                        const checked = data.facilities[f.key] || (f.key === "boarding" && data.isBoarding);
                        return (
                          <label
                            key={f.key}
                            className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer hover:bg-muted/50 ${
                              checked ? "border-primary/30 bg-primary/5" : "border-border"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                updateData({ facilities: { ...data.facilities, [f.key]: !data.facilities[f.key] } })
                              }
                              className="w-4 h-4"
                            />
                            <Icon className={`h-4 w-4 ${checked ? "text-primary" : "text-muted-foreground"}`} />
                            <span className="text-sm">{f.label}</span>
                          </label>
                        );
                      })}
                    </div>

                    <div className="mt-3">
                      <Label className="text-xs">Add a custom facility</Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          value={customFacilityInput}
                          onChange={(e) => setCustomFacilityInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addCustomFacility(customFacilityInput);
                            }
                          }}
                          placeholder="e.g. Skipping rope club, First aid room…"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => addCustomFacility(customFacilityInput)}
                        >
                          Add
                        </Button>
                      </div>
                      {customFacilityInput.trim().length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {FACILITY_SUGGESTIONS.filter((s) =>
                            s.keyword.split(" ").some((kw) => customFacilityInput.toLowerCase().includes(kw))
                          ).map((s) => (
                            <button
                              key={s.label}
                              type="button"
                              className="text-xs bg-muted px-2 py-1 rounded-full hover:bg-primary/10 text-muted-foreground"
                              onClick={() => addCustomFacility(s.label)}
                            >
                              + {s.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {data.customFacilities.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {data.customFacilities.map((f) => (
                            <span
                              key={f}
                              className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full"
                            >
                              {f}
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => removeCustomFacility(f)}
                                aria-label={`Remove ${f}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label>Current headcount estimate</Label>
                    <p className="text-xs text-muted-foreground mb-1">
                      Rough numbers are fine — an approximate total, not exact names.
                    </p>
                    <div className="grid grid-cols-2 gap-3 mt-1">
                      <div>
                        <Input
                          type="number"
                          value={data.headcountLearners}
                          onChange={(e) => updateData({ headcountLearners: e.target.value })}
                          placeholder="Learners"
                        />
                      </div>
                      <div>
                        <Input
                          type="number"
                          value={data.headcountStaff}
                          onChange={(e) => updateData({ headcountStaff: e.target.value })}
                          placeholder="Staff"
                        />
</div>
                  </div>
                </div>

                <div>
                  <Label>Number of campuses/branches</Label>
                  <p className="text-xs text-muted-foreground mb-1">
                    How many physical locations/branches does the school operate?
                  </p>
                  <Input
                    type="number"
                    value={data.campuses}
                    onChange={(e) => updateData({ campuses: e.target.value })}
                    placeholder="1"
                    min="1"
                  />
                </div>

                <div>
                  <Label>Year established</Label>
                  <p className="text-xs text-muted-foreground mb-1">
                    What year was the school founded? Used for tiering and planning.
                  </p>
                  <Input
                    type="number"
                    value={data.establishedYear}
                    onChange={(e) => updateData({ establishedYear: e.target.value })}
                    placeholder={new Date().getFullYear().toString()}
                    min="1800"
                    max={new Date().getFullYear()}
                  />
                </div>

                <div>
                  <Label>How does the school manage records today?</Label>
                    <div className="space-y-2 mt-1">
                      {RECORDS_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-muted/50 ${
                            data.recordsManagement === opt.value ? "border-primary/30 bg-primary/5" : "border-border"
                          }`}
                        >
                          <input
                            type="radio"
                            name="recordsManagement"
                            checked={data.recordsManagement === opt.value}
                            onChange={() => updateData({ recordsManagement: opt.value })}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  These answers only describe how you operate today — nothing here locks you in and everything can be
                  changed later from Settings.
                </p>
              </div>
            )}

            {/* Step 3: Setup Route */}
            {currentStepId === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">How do you want to set up?</h2>
                  <p className="text-sm text-muted-foreground">
                    Both routes can be mixed later — nothing here is final. You can bulk-upload documents anytime from
                    Settings, and you can still walk through any setup step afterward.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => updateData({ setupRoute: "guided" })}
                    className={`p-6 rounded-2xl border text-left transition-all ${
                      data.setupRoute === "guided"
                        ? "border-primary/40 bg-primary/5 ring-1 ring-primary/30"
                        : "border-border hover:border-primary/20 hover:bg-muted/50"
                    }`}
                  >
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                      <Workflow className="h-6 w-6 text-primary" />
                    </div>
                    <p className="font-semibold mb-1">Guided setup</p>
                    <p className="text-sm text-muted-foreground">
                      Walk through setup step by step, selecting what applies to your school as you go.
                    </p>
                    {data.setupRoute === "guided" && (
                      <Badge variant="success" className="mt-3">Selected</Badge>
                    )}
                  </button>
                  <button
                    onClick={() => updateData({ setupRoute: "upload" })}
                    className={`p-6 rounded-2xl border text-left transition-all ${
                      data.setupRoute === "upload"
                        ? "border-primary/40 bg-primary/5 ring-1 ring-primary/30"
                        : "border-border hover:border-primary/20 hover:bg-muted/50"
                    }`}
                  >
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                      <UploadCloud className="h-6 w-6 text-primary" />
                    </div>
                    <p className="font-semibold mb-1">Upload existing documents</p>
                    <p className="text-sm text-muted-foreground">
                      Upload spreadsheets, PDFs, or photos of records you already have — we&apos;ll sort them for you to
                      review.
                    </p>
                    {data.setupRoute === "upload" && (
                      <Badge variant="success" className="mt-3">Selected</Badge>
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isUploadRoute
                    ? "You'll still configure Guardians, Notifications, and Roles below — only the data-entry steps are replaced by upload."
                    : "After this you'll pick your modules for learners, staff, and administration."}
                </p>
              </div>
            )}

            {/* Step 4: Bulk upload (Route B) */}
            {currentStepId === 4 && isUploadRoute && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Upload existing documents</h2>
                  <p className="text-sm text-muted-foreground">
                    Upload one or more CSV or Excel files with your student list, staff records, or fee
                    data. We&apos;ll auto-detect the columns and pre-fill your school setup. Add as many
                    files as you like — each is parsed and shown separately.
                  </p>
                </div>

                {/* Upload zone — always available so you can add more files */}
                <label
                  className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-10 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files ?? []);
                    if (files.length > 0) handleDocFiles(files);
                  }}
                >
                  <UploadCloud className="h-10 w-10 text-primary/60" />
                  <div className="text-center">
                    <p className="font-medium">Drop your files here, or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      CSV, Excel, PDF, Word, or images — student lists, staff records, fee data, or any documents
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Select multiple files at once, or add more later.
                    </p>
                  </div>
                  <input
                    type="file"
                    multiple
                    accept=".csv,.xlsx,.xls,.pdf,.docx,.doc,.jpg,.jpeg,.png,.gif,.webp"
                    className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length > 0) handleDocFiles(files);
                      e.target.value = "";
                    }}
                  />
                </label>

                {/* File queue with per-file status */}
                {docQueue.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Files in queue ({docQueue.length})
                    </p>
                    {docQueue.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                        <div className="shrink-0">
                          {item.status === "parsing" ? (
                            <BrandLoader variant="dots" size="sm" />
                          ) : item.status === "ready" ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : item.status === "error" ? (
                            <XCircle className="h-4 w-4 text-red-500" />
                          ) : (
                            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.fileName}</p>
                          {item.status === "parsing" && (
                            <p className="text-xs text-muted-foreground">Reading file…</p>
                          )}
                          {item.status === "ready" && item.doc && (
                            <p className="text-xs text-muted-foreground">
                              {item.doc.rowCount} rows · {item.doc.headers.length} columns ·{" "}
                              <span
                                title={
                                  item.doc.detectedSignals.length > 0
                                    ? `Why: ${item.doc.detectedSignals.join(", ")}`
                                    : undefined
                                }
                                className={`font-medium ${
                                  item.doc.detectedKind === "unknown"
                                    ? "text-amber-600"
                                    : "text-primary"
                                }`}
                              >
                                {item.doc.detectedKind === "unknown"
                                  ? "Type not recognized"
                                  : `Detected as ${KIND_GUIDES[item.doc.detectedKind].label}`}
                              </span>
                            </p>
                          )}
                          {item.status === "error" && (
                            <p className="text-xs text-red-600">{item.error}</p>
                          )}
                        </div>
                        <button
                          onClick={() => removeDocFile(item.id)}
                          className="p-1 rounded-md hover:bg-muted text-muted-foreground cursor-pointer"
                          aria-label={`Remove ${item.fileName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Parsing spinner */}
                {docParsing && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <BrandLoader variant="book" size="lg" />
                    <p className="text-sm text-muted-foreground">Reading your documents…</p>
                  </div>
                )}

                {/* Parse error */}
                {docError && parsedDocs.length === 0 && (
                  <div className="p-4 rounded-xl border border-red-200 bg-red-50">
                    <p className="text-sm font-medium text-red-800">Could not read files</p>
                    <p className="text-xs text-red-600 mt-1">{docError}</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => setDocError(null)}>
                      Dismiss
                    </Button>
                  </div>
                )}

                {/* Parsed results — preview (aggregated across files) */}
                {parsedDocs.length > 0 && !docConfirmed && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-green-800">
                          {parsedDocs.length} document{parsedDocs.length === 1 ? "" : "s"} read successfully!
                        </p>
                        <p className="text-xs text-green-600 mt-0.5">
                          {totalRows} rows · {allClassNames.length} classes · {allTeacherNames.length} teachers
                          {totalStudents ? ` · ${totalStudents} students` : ""} detected
                        </p>
                      </div>
                    </div>

                    {/* Per-file breakdown */}
                    <div className="space-y-2">
                      {parsedDocs.map((doc) => (
                        <div key={doc.fileName} className="rounded-lg border border-border overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
                            <FileSpreadsheet className="h-4 w-4 text-primary/60 shrink-0" />
                            <p className="text-sm font-medium truncate">{doc.fileName}</p>
                            {doc.detectedKind !== "unknown" && (
                              <Badge variant="secondary" className="shrink-0">
                                {KIND_GUIDES[doc.detectedKind].label}
                              </Badge>
                            )}
                            <span className="ml-auto text-xs text-muted-foreground shrink-0 capitalize">
                              {doc.rowCount > 0
                                ? `${doc.rowCount} rows · ${doc.headers.length} cols`
                                : `${doc.fileType} document`}
                            </span>
                          </div>
                          {doc.rowCount === 0 && doc.text ? (
                            <div className="p-3">
                              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                                Extracted text preview — recognized as a school document
                              </p>
                              <pre className="text-xs whitespace-pre-wrap max-h-44 overflow-y-auto rounded-lg bg-secondary/5 border border-border p-3 text-muted-foreground font-sans">
                                {doc.text.slice(0, 1500)}
                                {doc.text.length > 1500 ? "\n… (truncated)" : ""}
                              </pre>
                            </div>
                          ) : (
                          <div className="overflow-x-auto max-h-48">
                            <table className="w-full text-xs">
                              <thead className="bg-secondary/5">
                                <tr>
                                  {doc.headers.slice(0, 8).map(h => (
                                    <th key={h} className="text-left p-2 font-medium whitespace-nowrap">{h}</th>
                                  ))}
                                  {doc.headers.length > 8 && <th className="text-left p-2 text-muted-foreground">…</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {doc.sampleRows.slice(0, 3).map((row, i) => (
                                  <tr key={i} className="border-t border-border">
                                    {doc.headers.slice(0, 8).map(h => (
                                      <td key={h} className="p-2 whitespace-nowrap max-w-[120px] truncate">{row[h] || "—"}</td>
                                    ))}
                                    {doc.headers.length > 8 && <td className="p-2 text-muted-foreground">…</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* What was detected — per file type */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">What we detected in your files</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {kindBreakdown.map(({ kind, count }) => (
                          <div key={kind} className="p-3 rounded-xl bg-muted/50">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">
                              {kind === "unknown" ? "Unrecognized" : KIND_GUIDES[kind].label}
                            </p>
                            <p className="text-lg font-bold">
                              {count} file{count === 1 ? "" : "s"}
                            </p>
                            {kind !== "unknown" && (
                              <p className="text-xs text-muted-foreground">
                                Goes to {KIND_GUIDES[kind].href.replace("/dashboard/", "")}
                              </p>
                            )}
                          </div>
                        ))}
                        {kindBreakdown.length === 0 && (
                          <p className="text-sm text-muted-foreground">No recognized data files yet</p>
                        )}
                      </div>
                    </div>

                    {/* Auto-detected data (aggregated) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {totalStudents > 0 && (
                        <div className="p-3 rounded-xl bg-muted/50">
                          <p className="text-xs font-semibold uppercase text-muted-foreground">Students</p>
                          <p className="text-lg font-bold">{totalStudents}</p>
                        </div>
                      )}
                      {allClassNames.length > 0 && (
                        <div className="p-3 rounded-xl bg-muted/50">
                          <p className="text-xs font-semibold uppercase text-muted-foreground">Classes Found</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {allClassNames.map(c => (
                              <span key={c} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{c}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {allTeacherNames.length > 0 && (
                        <div className="p-3 rounded-xl bg-muted/50">
                          <p className="text-xs font-semibold uppercase text-muted-foreground">Teachers Found</p>
                          <p className="text-sm font-medium">{allTeacherNames.length} teachers</p>
                        </div>
                      )}
                      {allFeeAmounts.length > 0 && (
                        <div className="p-3 rounded-xl bg-muted/50">
                          <p className="text-xs font-semibold uppercase text-muted-foreground">Fee Amounts</p>
                          <p className="text-sm font-medium">{allFeeAmounts.slice(0, 3).join(", ")}{allFeeAmounts.length > 3 ? "…" : ""}</p>
                        </div>
                      )}
                    </div>

                    {/* Auto-fill actions */}
                    <div className="space-y-3">
                      <p className="text-sm font-medium">What would you like to do?</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          onClick={() => {
                            // Auto-fill onboarding fields from parsed data
                            const updates: Partial<OnboardingData> = {};
                            if (totalStudents) updates.headcountLearners = String(totalStudents);
                            if (allTeacherNames.length > 0) updates.headcountStaff = String(allTeacherNames.length);
                            if (allFeeAmounts.length > 0) updates.feePerStudent = allFeeAmounts[0];
                            if (allClassNames.length > 0) {
                              // Detect if boarding based on class names
                              const hasForm = allClassNames.some(c => /form|grade/i.test(c));
                              if (hasForm) updates.schoolType = "Primary & Secondary";
                            }
                            updateData(updates);
                            setDocConfirmed(true);
                            toast.success(`Auto-filled ${Object.keys(updates).length} fields from your documents!`);
                          }}
                          className="p-4 rounded-xl border border-primary/30 bg-primary/5 text-left hover:bg-primary/10 transition-colors"
                        >
                          <Sparkles className="h-5 w-5 text-primary mb-2" />
                          <p className="font-medium text-sm">Auto-fill setup</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Pre-fill headcount, fees, and school type from the documents
                          </p>
                        </button>
                        <button
                          onClick={() => setDocConfirmed(true)}
                          className="p-4 rounded-xl border border-border text-left hover:bg-muted/50 transition-colors"
                        >
                          <Check className="h-5 w-5 text-muted-foreground mb-2" />
                          <p className="font-medium text-sm">Continue without auto-fill</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Keep your documents as-is — the files will be imported in the next step
                          </p>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Confirmed — show summary */}
                {parsedDocs.length > 0 && docConfirmed && (
                  <div className="p-4 rounded-xl bg-green-50 border border-green-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <p className="text-sm font-medium text-green-800">
                        {parsedDocs.length} document{parsedDocs.length === 1 ? "" : "s"} processed —{" "}
                        {totalStudents} students, {allClassNames.length} classes detected
                      </p>
                    </div>
                    <p className="text-xs text-green-600 mt-1">
                      Click Continue to go to the Import step where you can import these students.
                    </p>
                  </div>
                )}

                <div>
                  <Button variant="outline" onClick={() => updateData({ setupRoute: "guided" })}>
                    Switch to Guided Setup instead
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Learners Setup (Guided) */}
            {currentStepId === 4 && !isUploadRoute && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Learners Setup</h2>
                  <p className="text-sm text-muted-foreground">
                    Choose which modules to enable for your school
                  </p>
                </div>
                <div className="max-w-lg">
                  <Label>What do you call your learners?</Label>
                  <Input
                    value={data.bucketLabel}
                    onChange={(e) => updateData({ bucketLabel: e.target.value })}
                    placeholder="e.g. Learners, Students, Pupils"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    This is the name shown across the app for this group (default: &quot;Learners&quot;). Changeable later.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {MODULE_GROUPS.learners.map((m) => (
                    <ModuleToggle key={m.key} module={m} enabled={data.enabledModules[m.key]} onToggle={() => toggleModule(m.key)} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {enabledCount} modules enabled across all staff groups · You can change these anytime in Settings
                </p>
              </div>
            )}

            {/* Step 5: Teaching Staff */}
            {currentStepId === 5 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Teaching Staff</h2>
                  <p className="text-sm text-muted-foreground">
                    Choose which modules to enable for your school
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {MODULE_GROUPS.teaching.map((m) => (
                    <ModuleToggle key={m.key} module={m} enabled={data.enabledModules[m.key]} onToggle={() => toggleModule(m.key)} />
                  ))}
                </div>
                <label className="flex items-center gap-3 p-4 rounded-xl border border-border cursor-pointer hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={data.classTeacherAssignment}
                    onChange={(e) => updateData({ classTeacherAssignment: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <div>
                    <p className="font-medium text-sm">Use Class Teacher assignment</p>
                    <p className="text-xs text-muted-foreground">
                      Assign a class teacher to each class for reporting and day-to-day ownership. Doesn&apos;t block
                      adding it later.
                    </p>
                  </div>
                </label>
              </div>
            )}

            {/* Step 6: Non-Teaching Staff */}
            {currentStepId === 6 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Non-Teaching Staff</h2>
                  <p className="text-sm text-muted-foreground">
                    Select which roles your school actually has
                  </p>
                </div>
                <div className="space-y-2">
                  {NON_TEACHING_ROLES.map((r) => (
                    <label
                      key={r.key}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={data.nonTeachingRoles[r.key]}
                        onChange={() =>
                          updateData({ nonTeachingRoles: { ...data.nonTeachingRoles, [r.key]: !data.nonTeachingRoles[r.key] } })
                        }
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-medium">{r.label}</span>
                    </label>
                  ))}
                </div>
                <div>
                  <Label>Add a role we don&apos;t have listed</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      value={customRoleInput}
                      onChange={(e) => setCustomRoleInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomRole(); } }}
                      placeholder="e.g. Bursar, Groundskeeper..."
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={addCustomRole}>
                      Add
                    </Button>
                  </div>
                  {data.customRoles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {data.customRoles.map((role) => (
                        <Badge key={role} variant="secondary" className="gap-1 pr-1">
                          {role}
                          <button
                            onClick={() => removeCustomRole(role)}
                            className="rounded-full hover:bg-muted p-0.5"
                            aria-label={`Remove ${role}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Custom roles get a blank workspace you can shape later from Settings.
                  </p>
                </div>
              </div>
            )}

            {/* Step 7: Administrative Staff */}
            {currentStepId === 7 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Administrative Staff</h2>
                  <p className="text-sm text-muted-foreground">
                    Choose which modules to enable for your school
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {MODULE_GROUPS.admin.map((m) => (
                    <ModuleToggle key={m.key} module={m} enabled={data.enabledModules[m.key]} onToggle={() => toggleModule(m.key)} />
                  ))}
                </div>
              </div>
            )}

            {/* Step 8: Guardians */}
            {currentStepId === 8 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Guardian Portal</h2>
                  <p className="text-sm text-muted-foreground">Allow parents to view their children&apos;s data</p>
                </div>
                <label className="flex items-center gap-4 p-6 rounded-xl border border-border cursor-pointer hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={data.enableParentPortal}
                    onChange={(e) => updateData({ enableParentPortal: e.target.checked })}
                    className="w-5 h-5"
                  />
                  <div className="flex-1">
                    <p className="font-semibold">Enable Parent Portal</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Parents can view their children&apos;s data and receive notifications. They get a separate login
                      with restricted access.
                    </p>
                  </div>
                  <Badge variant={data.enableParentPortal ? "success" : "default"}>
                    {data.enableParentPortal ? "Enabled" : "Disabled"}
                  </Badge>
                </label>

                {data.enableParentPortal && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">What can guardians view?</p>
                    {MODULE_GROUPS.learners.map((m) => (
                      <label
                        key={m.key}
                        className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-muted/50"
                      >
                        <input
                          type="checkbox"
                          checked={data.guardianModules[m.key]}
                          onChange={() =>
                            updateData({ guardianModules: { ...data.guardianModules, [m.key]: !data.guardianModules[m.key] } })
                          }
                          className="w-4 h-4"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{m.label}</p>
                          <p className="text-xs text-muted-foreground">{m.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 9: Notifications */}
            {currentStepId === 9 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Notification Rules</h2>
                  <p className="text-sm text-muted-foreground">Choose which alerts to enable and who receives them</p>
                </div>
                <div className="space-y-2">
                  {NOTIFICATION_TRIGGERS.map((n) => (
                    <div key={n.key} className="rounded-xl border border-border overflow-hidden">
                      <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50">
                        <input
                          type="checkbox"
                          checked={data.enabledNotifications[n.key]}
                          onChange={() => toggleNotification(n.key)}
                          className="w-4 h-4"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{n.label}</p>
                          <p className="text-xs text-muted-foreground">{n.description}</p>
                        </div>
                      </label>
                      {data.enabledNotifications[n.key] && (
                        <div className="flex items-center gap-2 px-3 pb-3 pl-10">
                          <Label className="text-xs w-14 shrink-0">Notifies</Label>
                          <Select
                            value={data.notificationRecipients[n.key]}
                            onChange={(e) => setNotificationRecipient(n.key, e.target.value)}
                            className="h-8 text-xs w-auto"
                          >
                            {DEFAULT_ROLE_OPTIONS.map((r) => (
                              <option key={r.key} value={r.key}>
                                {r.key === "principal" ? (data.leadershipTitle === "__custom__" ? (data.customLeadershipTitle || "Head of School") : data.leadershipTitle) : r.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {notifCount} notifications enabled · In-app alerts are always on · You can customize these in Settings
                  → Notifications
                </p>
              </div>
            )}

            {/* Step 10: Review */}
            {currentStepId === 10 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Review Configuration</h2>
                  <p className="text-sm text-muted-foreground">Make sure everything looks right</p>
                </div>
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-muted/50">
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">School</p>
                    <p className="font-medium">{data.schoolName || "Not set"}</p>
                    <p className="text-sm text-muted-foreground">
                      {data.schoolType} {data.isBoarding ? "· Boarding" : ""} · {data.termsPerYear} terms/year · Head: {data.leadershipTitle === "__custom__" ? (data.customLeadershipTitle || "(custom)") : data.leadershipTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {data.currentTermName} {data.currentTermYear}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/50">
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">School Context</p>
                    <p className="text-sm">
                      {data.feeSameForAllTerms
                        ? (data.feePerStudent ? `Fee: ${data.feePerStudent} ${data.feeFrequency} · ` : "Fee: not set · ")
                        : (Object.values(data.feePerTerm).some(v => v) ? "Fee: varies by term · " : "Fee: not set · ")}
                      {data.headcountLearners ? `${data.headcountLearners} learners` : "headcount: not set"}
                      {data.headcountStaff ? `, ${data.headcountStaff} staff` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Facilities: {enabledFacilities.length > 0 ? enabledFacilities.join(", ") : "none selected"} ·{" "}
                      Records: {RECORDS_OPTIONS.find((o) => o.value === data.recordsManagement)?.label}
                    </p>
                  </div>
                  {isUploadRoute ? (
                    <div className="p-4 rounded-xl bg-muted/50">
                      <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Data Setup</p>
                      <p className="text-sm">Bulk document upload — documents will be read and reviewed before anything goes live.</p>
                    </div>
                  ) : (
                    <>
                      <div className="p-4 rounded-xl bg-muted/50">
                        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Learner Group</p>
                        <p className="text-sm">Label: <span className="font-medium">{data.bucketLabel}</span></p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {MODULE_GROUPS.learners
                            .filter((m) => data.enabledModules[m.key])
                            .map((m) => (
                              <Badge key={m.key} variant="default" className="text-xs">{m.label}</Badge>
                            ))}
                        </div>
                      </div>
                      <div className="p-4 rounded-xl bg-muted/50">
                        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Non-Teaching Roles</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {NON_TEACHING_ROLES.filter((r) => data.nonTeachingRoles[r.key]).map((r) => (
                            <Badge key={r.key} variant="secondary" className="text-xs">{r.label}</Badge>
                          ))}
                          {data.customRoles.map((r) => (
                            <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  <div className="p-4 rounded-xl bg-muted/50">
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Parent Portal</p>
                    <Badge variant={data.enableParentPortal ? "success" : "default"}>
                      {data.enableParentPortal ? "Enabled" : "Disabled"}
                    </Badge>
                    {data.enableParentPortal && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Guardians can view:{" "}
                        {MODULE_GROUPS.learners.filter((m) => data.guardianModules[m.key]).map((m) => m.label).join(", ") || "nothing"}
                      </p>
                    )}
                  </div>
                  <div className="p-4 rounded-xl bg-muted/50">
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Notifications</p>
                    <p className="text-sm">{notifCount} notification rules enabled</p>
                  </div>
                </div>
                <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 text-sm">
                  <p className="font-medium mb-1">One thing to know</p>
                  <p className="text-muted-foreground">
                    You are the only account that self-registers. From here, you&apos;ll create logins for every other
                    staff member. You can review and adjust any role&apos;s permissions after setup from Settings.
                  </p>
                </div>
              </div>
            )}

            {/* Step 11: Staff Accounts */}
            {currentStepId === 11 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Staff Accounts</h2>
                  <p className="text-sm text-muted-foreground">Add your team members after setup</p>
                </div>
                <div className="p-6 rounded-xl border border-dashed border-border text-center">
                  <UserPlus className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-medium mb-1">Invite Your Team</p>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    After onboarding you can add teachers, admin staff, and other team members from the{" "}
                    <a href="/dashboard/members" className="text-primary hover:underline">Members</a>{" "}
                    page. Each member gets their own login.
                  </p>
                </div>
              </div>
            )}

            {/* Step 12: Import */}
            {currentStepId === 12 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Import Student Data</h2>
                  <p className="text-sm text-muted-foreground">
                    Import existing student records now, or continue without importing — you can
                    always add students from the dashboard. Pick multiple files at once — each is
                    processed one at a time.
                  </p>
                </div>
                {parsedDocs.length > 0 && docConfirmed && (
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">Documents ready to import</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {parsedDocs.length} file{parsedDocs.length === 1 ? "" : "s"} — {totalStudents} students, {allClassNames.length} classes detected.
                    </p>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button onClick={() => setShowImportStudio(true)} className="flex-1 whitespace-nowrap">
                    <Upload className="h-4 w-4 mr-2" /> {parsedDocs.length > 0 ? "Import files" : "Import CSV / Excel"}
                  </Button>
                  <Button variant="outline" onClick={() => nextStep()} className="flex-1 whitespace-nowrap">
                    Continue without importing
                  </Button>
                </div>
                <div className="p-6 rounded-xl border border-dashed border-border text-center">
                  <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-medium mb-1">Supported formats</p>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    CSV or Excel (.xlsx) with column headers. We auto-detect columns like
                    student name, admission number, class, guardian phone, and more.
                    Duplicate detection prevents re-adding existing students. Multiple files are
                    imported sequentially — a failed file won&apos;t block the rest.
                  </p>
                </div>
                <ImportStudio
                  open={showImportStudio}
                  onClose={() => setShowImportStudio(false)}
                  onboarding={{
                    feePerStudent: data.feePerStudent,
                    currentTermName: data.currentTermName,
                    currentTermYear: data.currentTermYear,
                    termsPerYear: data.termsPerYear,
                  }}
                />
              </div>
            )}

            {/* Step 13: Done */}
            {currentStepId === 13 && (
              <div className="space-y-6 text-center">
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-10 w-10 text-green-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-2">You&apos;re All Set! 🎉</h2>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Your school <span className="font-semibold">{data.schoolName || "SchoolMNG"}</span> is ready. Start
                    by adding students, setting up classes, and inviting your team.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-muted/50 max-w-md mx-auto text-left">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Quick links</p>
                  <ul className="text-sm space-y-1.5">
                    <li>
                      <a href="/dashboard/settings" className="text-primary hover:underline">School settings &amp; branding</a>
                    </li>
                    <li>
                      <a href="/dashboard/students" className="text-primary hover:underline">Add students</a>
                    </li>
                    <li>
                      <a href="/dashboard/members" className="text-primary hover:underline">Invite staff</a>
                    </li>
                    <li>
                      <a href="/dashboard/settings" className="text-primary hover:underline">Review modules, notifications &amp; permissions</a>
                    </li>
                  </ul>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
                  <Button size="lg" onClick={finishOnboarding} disabled={saving}>
                    {saving ? <BrandLoader variant="dots" size="sm" className="mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Go to Dashboard
                  </Button>
                </div>
              </div>
            )}
          {/* Navigation */}
          {currentStepId !== 13 && (
            <div className="flex items-center justify-between mt-8">
              <Button
                variant="outline"
                onClick={prevStep}
                disabled={step === 0}
              >
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <div className="flex items-center gap-2">
                {validationError && (
                  <p className="text-xs text-red-600 mr-2 max-w-[200px]">{validationError}</p>
                )}
                <Button onClick={nextStep}>
                  {currentStepId === 12 ? "Finish" : "Continue"} <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

        {/* AI Assistant Chat */}
        {currentStepId !== 13 && school && (
          <>
            {/* Collapsed state - floating button */}
            {chatCollapsed && (
              <button
                onClick={() => setChatCollapsed(false)}
                className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-50"
              >
                <Sparkles className="h-6 w-6" />
              </button>
            )}

            {/* Expanded state - full chat panel */}
            {!chatCollapsed && (
              <div className="fixed bottom-6 right-6 w-80 bg-background border border-border rounded-xl shadow-lg overflow-hidden z-50">
                <div className="bg-primary/10 p-3 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                        <Sparkles className="h-3 w-3 text-primary" />
                      </div>
                      <p className="text-sm font-medium">Setup Assistant</p>
                    </div>
                    <button
                      onClick={() => setChatCollapsed(true)}
                      className="w-6 h-6 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
                      title="Minimize"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="h-48 overflow-y-auto p-3 space-y-2">
                  {chatMessages.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Ask me anything about setting up your school!
                    </p>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`text-xs p-2 rounded-lg max-w-[85%] ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground ml-auto"
                          : "bg-muted"
                      }`}
                    >
                      {msg.content}
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="text-xs p-2 rounded-lg bg-muted max-w-[85%]">
                      <BrandLoader variant="dots" size="sm" className="mr-1" />
                      Assistant is thinking...
                    </div>
                  )}
                </div>
                <div className="p-2 border-t">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendMessage();
                    }}
                    className="flex gap-2"
                  >
                    <Input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask a question..."
                      className="h-8 text-xs"
                    />
                    <Button type="submit" size="sm" className="h-8 px-3" disabled={chatLoading}>
                      Send
                    </Button>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </OnboardingLayout>
      </>
      )}
    </>
  );
}

// ── Module Toggle Card ──────────────────────────────────────────

function ModuleToggle({
  module: m,
  enabled,
  onToggle,
}: {
  module: { key: string; label: string; icon: typeof Users; description: string };
  enabled: boolean;
  onToggle: () => void;
}) {
  const Icon = m.icon;
  return (
    <button
      onClick={onToggle}
      className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
        enabled
          ? "border-primary/30 bg-primary/5"
          : "border-border hover:border-primary/20 hover:bg-muted/50"
      }`}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
        enabled ? "bg-primary/10" : "bg-muted"
      }`}>
        <Icon className={`h-5 w-5 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{m.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>
      </div>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
        enabled ? "border-primary bg-primary" : "border-border"
      }`}>
        {enabled && <Check className="h-3 w-3 text-white" />}
      </div>
    </button>
  );
}

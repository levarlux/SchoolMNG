"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useConvex, usePaginatedQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Plus, Search, Download, Upload, ChevronRight, ScanLine, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csv-export";
import { checkRateLimit } from "@/lib/rate-limit";
import { ImportStudio } from "@/components/import-studio";
import { StudentProfileView } from "@/components/student-profile-view";
import { DocumentScanner } from "@/components/document-scanner";

/**
 * Students page. With `output: export`, dynamic [id] routes can't serve
 * arbitrary IDs, so the Student 360 profile renders as a full-page view
 * keyed by the ?view=<studentId> query param (query strings work fine on
 * static pages).
 */
export default function StudentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-16">
          <BrandLoader variant="book" size="md" />
        </div>
      }
    >
      <StudentsContent />
    </Suspense>
  );
}

function StudentsContent() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  if (view) return <StudentProfileView studentId={view} />;
  return <StudentsList />;
}

function StudentsList() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);
  const router = useRouter();
  const classes = useQuery(api.classes.listBySchool, school ? { schoolId: school._id } : "skip");
  const { results: paginatedStudents, status: paginationStatus, loadMore } = usePaginatedQuery(
    api.students.listBySchoolPaginated,
    school ? { schoolId: school._id } : "skip",
    { initialNumItems: 20 },
  );
  const createStudent = useMutation(api.students.create);

  const client = useConvex();
  const [streamMap, setStreamMap] = useState<Map<string, string>>(new Map());

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "az">("newest");
  const [classFilter, setClassFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const allStreams = useQuery(
    api.streams.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  // â”€â”€ Form state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [admNo, setAdmNo] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedStream, setSelectedStream] = useState("");
  // Phase 18: gender / DOB / admission date / guardian contact are school-defined
  // EAV fields + the guardian entity system — not hard-coded student columns.
  const [status, setStatus] = useState("active");

  const streamsQuery = useQuery(
    api.streams.listByClass,
    selectedClass ? { classId: selectedClass as any } : "skip"
  );

  const selectedClassData = classes?.find((c) => c._id === selectedClass);

  useEffect(() => {
    if (!paginatedStudents || !classes) return;
    const uniqueClassIds = [...new Set(paginatedStudents.map((s) => s.classId))];
    const classesWithStreams = uniqueClassIds.filter((classId) => {
      const cls = classes.find((c) => c._id === classId);
      return cls?.hasStreams;
    });
    if (classesWithStreams.length === 0) return;

    Promise.all(
      classesWithStreams.map((classId) =>
        client.query(api.streams.listByClass, { classId: classId as any })
      )
    ).then((results) => {
      const map = new Map<string, string>();
      results.forEach((streams: any[]) => {
        streams.forEach((s: any) => map.set(s._id, s.name));
      });
      setStreamMap(map);
    });
  }, [paginatedStudents, classes, client]);

  if (paginationStatus === "LoadingFirstPage") {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  const filtered = paginatedStudents
    ?.filter((s) => {
      if (classFilter && s.classId !== classFilter) return false;
      if (streamFilter && s.streamId !== streamFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        s.firstName.toLowerCase().includes(q) ||
        s.lastName.toLowerCase().includes(q) ||
        s.admNo.toLowerCase().includes(q)
      );
    })
    ?.sort((a, b) => {
      if (sort === "az") return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
      return b._creationTime - a._creationTime;
    });

  function resetForm() {
    setFirstName("");
    setLastName("");
    setAdmNo("");
    setSelectedClass("");
    setSelectedStream("");
    setStatus("active");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!checkRateLimit("student-create", 5, 60_000)) {
      toast.error("Too many attempts. Please wait a moment before trying again.");
      return;
    }
    if (!school || !selectedClass || !firstName.trim() || !lastName.trim() || !admNo.trim()) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await createStudent({
        schoolId: school._id,
        classId: selectedClass as any,
        streamId: selectedStream ? (selectedStream as any) : undefined,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        admNo: admNo.trim(),
        status: (status || undefined) as any,
      });
      toast.success("Student created");
      setShowModal(false);
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
      console.error("[students.create]", error);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Students</h1>
          <p className="text-muted-foreground mt-1">{filtered?.length ?? 0} students loaded</p>
          {paginationStatus === "CanLoadMore" && (
            <Button variant="outline" size="sm" onClick={() => loadMore(20)}>
              Load more...
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLeadership && filtered && filtered.length > 0 && (
            <Button
              variant="outline"
              onClick={() =>
                exportToCsv(
                  filtered.map((s) => ({
                    FirstName: s.firstName,
                    LastName: s.lastName,
                    "Admission No": s.admNo,
                  })),
                  "students"
                )
              }
            >
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
          )}
          {isLeadership && (
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4 mr-2" /> Import
            </Button>
          )}
          {isLeadership && (
            <Button variant="outline" onClick={() => setShowScanner(true)}>
              <ScanLine className="h-4 w-4 mr-2" /> Scan
            </Button>
          )}
          {isLeadership && (
            <Button onClick={() => setShowModal(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Student
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={classFilter}
          onChange={(e) => {
            setClassFilter(e.target.value);
            if (e.target.value) setStreamFilter("");
          }}
          className="w-auto min-w-[10rem]"
        >
          <option value="">All Classes</option>
          {classes?.map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </Select>
        <Select value={streamFilter} onChange={(e) => setStreamFilter(e.target.value)} className="w-auto min-w-[10rem]">
          <option value="">All Streams</option>
          {allStreams
            ?.filter((st) => !classFilter || st.classId === classFilter)
            .map((st) => (
              <option key={st._id} value={st._id}>{st.name}</option>
            ))}
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as "newest" | "az")}
            className="w-auto"
          >
            <option value="newest">Newest first</option>
            <option value="az">Name (A–Z)</option>
          </Select>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or admission number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-secondary/5">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Adm No</th>
                <th className="text-left p-3 font-medium">Class</th>
                <th className="text-left p-3 font-medium">Stream</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {filtered?.map((s) => {
                const sClass = classes?.find((c) => c._id === s.classId);
                return (
                  <tr
                    key={s._id}
                    className="border-t border-border hover:bg-secondary/5 cursor-pointer transition-colors"
                    onClick={() => router.push(`/dashboard/students?view=${s._id}`)}
                  >
                    <td className="p-3 font-medium">
                      <div className="flex items-center gap-2">
                        {s.photoUrl ? (
                          <img src={s.photoUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                            {s.firstName[0]}{s.lastName[0]}
                          </div>
                        )}
                        {s.firstName} {s.lastName}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{s.admNo}</td>
                    <td className="p-3">{sClass?.name ?? ""}</td>
                    <td className="p-3 text-muted-foreground">{s.streamId ? (streamMap.get(s.streamId) ?? "") : ""}</td>
                    <td className="p-3 text-right">
                      <ChevronRight className="h-4 w-4 inline text-muted-foreground" />
                    </td>
                  </tr>
                );
              })}
              {filtered?.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No students found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* â”€â”€ Add Student modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Student" size="lg">
        <form onSubmit={handleCreate} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              School Details
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="admNo">Admission Number *</Label>
                <Input id="admNo" value={admNo} onChange={(e) => setAdmNo(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="class">Class *</Label>
                <Select id="class" value={selectedClass} onChange={(e) => { setSelectedClass(e.target.value); setSelectedStream(""); }} required>
                  <option value="">Select a class</option>
                  {classes?.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </Select>
              </div>
              {selectedClassData?.hasStreams && (
                <div>
                  <Label htmlFor="stream">Stream</Label>
                  <Select id="stream" value={selectedStream} onChange={(e) => setSelectedStream(e.target.value)}>
                    <option value="">Select a stream</option>
                    {streamsQuery?.map((st) => (
                      <option key={st._id} value={st._id}>{st.name}</option>
                    ))}
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor="status">Status</Label>
                <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="active">Active</option>
                  <option value="graduated">Graduated</option>
                  <option value="withdrawn">Withdrawn</option>
                  <option value="suspended">Suspended</option>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Add Student</Button>
          </div>
        </form>
      </Modal>

      <ImportStudio open={showImport} onClose={() => setShowImport(false)} />
      <DocumentScanner open={showScanner} onClose={() => setShowScanner(false)} />
    </div>
  );
}


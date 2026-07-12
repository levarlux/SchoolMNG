"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, BookOpen, Users, AlertTriangle, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { exportToCsv, exportMultiSheetCsv } from "@/lib/csv-export";

type ReportType =
  | "classList"
  | "studentList"
  | "borrowingRecords"
  | "overdueReport"
  | "usageReport"
  | "fullSchoolExport";

const reportOptions: {
  value: ReportType;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    value: "classList",
    label: "Class List",
    icon: <BookOpen className="h-4 w-4" />,
    description: "Students in a selected class with stream info",
  },
  {
    value: "studentList",
    label: "Student List",
    icon: <Users className="h-4 w-4" />,
    description: "All students organized by class and stream",
  },
  {
    value: "borrowingRecords",
    label: "Borrowing Records",
    icon: <FileText className="h-4 w-4" />,
    description: "Complete borrowing history with status",
  },
  {
    value: "overdueReport",
    label: "Overdue Report",
    icon: <AlertTriangle className="h-4 w-4" />,
    description: "Currently overdue books with student details",
  },
  {
    value: "usageReport",
    label: "Usage Report",
    icon: <BarChart3 className="h-4 w-4" />,
    description: "Book usage statistics and popular titles",
  },
  {
    value: "fullSchoolExport",
    label: "Full School Export",
    icon: <Download className="h-4 w-4" />,
    description: "Export ALL data as multi-sheet CSV",
  },
];

export default function ReportsPage() {
  const school = useSchool();
  const classes = useQuery(
    api.classes.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  const [selectedReport, setSelectedReport] = useState<ReportType>("classList");
  const [selectedClass, setSelectedClass] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const schoolId = school?._id;
  const dateFromTs = dateFrom ? new Date(dateFrom).getTime() : undefined;
  const dateToTs = dateTo ? new Date(dateTo).getTime() : undefined;

  // ── Convex queries (skip when not needed) ──────────────────────────
  const classListData = useQuery(
    api.reports.classList,
    selectedReport === "classList" && schoolId && selectedClass
      ? { schoolId, classId: selectedClass as any }
      : "skip"
  );

  const studentListData = useQuery(
    api.reports.studentList,
    selectedReport === "studentList" && schoolId ? { schoolId } : "skip"
  );

  const borrowingData = useQuery(
    api.reports.borrowingRecords,
    selectedReport === "borrowingRecords" && schoolId
      ? { schoolId, startDate: dateFromTs, endDate: dateToTs }
      : "skip"
  );

  const overdueData = useQuery(
    api.reports.overdueReport,
    selectedReport === "overdueReport" && schoolId ? { schoolId } : "skip"
  );

  const usageData = useQuery(
    api.reports.usageReport,
    selectedReport === "usageReport" && schoolId
      ? { schoolId, startDate: dateFromTs, endDate: dateToTs }
      : "skip"
  );

  const fullExportData = useQuery(
    api.reports.fullSchoolExport,
    selectedReport === "fullSchoolExport" && schoolId ? { schoolId } : "skip"
  );

  // ── Derived table state ────────────────────────────────────────────
  const isLoading = useMemo(() => {
    if (!showResults) return false;
    switch (selectedReport) {
      case "classList":
        return classListData === undefined;
      case "studentList":
        return studentListData === undefined;
      case "borrowingRecords":
        return borrowingData === undefined;
      case "overdueReport":
        return overdueData === undefined;
      case "usageReport":
        return usageData === undefined;
      case "fullSchoolExport":
        return fullExportData === undefined;
      default:
        return false;
    }
  }, [
    showResults,
    selectedReport,
    classListData,
    studentListData,
    borrowingData,
    overdueData,
    usageData,
    fullExportData,
  ]);

  const { tableData, columns, columnLabels } = useMemo(() => {
    if (!showResults)
      return { tableData: [] as Record<string, unknown>[], columns: [], columnLabels: {} as Record<string, string> };

    switch (selectedReport) {
      case "classList":
        return {
          tableData: (classListData?.students ?? []) as Record<string, unknown>[],
          columns: ["firstName", "lastName", "admNo", "stream"],
          columnLabels: {
            firstName: "First Name",
            lastName: "Last Name",
            admNo: "ADM No",
            stream: "Stream",
          },
        };
      case "studentList":
        return {
          tableData: (studentListData ?? []) as Record<string, unknown>[],
          columns: ["firstName", "lastName", "admNo", "class"],
          columnLabels: {
            firstName: "First Name",
            lastName: "Last Name",
            admNo: "ADM No",
            class: "Class",
          },
        };
      case "borrowingRecords": {
        let rows = (borrowingData ?? []) as Record<string, unknown>[];
        if (statusFilter) {
          rows = rows.filter((r) => r.status === statusFilter);
        }
        return {
          tableData: rows,
          columns: [
            "studentName",
            "bookName",
            "bookNumber",
            "borrowedAt",
            "dueDate",
            "returnedAt",
            "status",
          ],
          columnLabels: {
            studentName: "Student",
            bookName: "Book",
            bookNumber: "Book No",
            borrowedAt: "Borrowed",
            dueDate: "Due",
            returnedAt: "Returned",
            status: "Status",
          },
        };
      }
      case "overdueReport":
        return {
          tableData: (overdueData ?? []) as Record<string, unknown>[],
          columns: [
            "studentName",
            "bookName",
            "bookNumber",
            "borrowedAt",
            "dueDate",
            "daysOverdue",
          ],
          columnLabels: {
            studentName: "Student",
            bookName: "Book",
            bookNumber: "Book No",
            borrowedAt: "Borrowed",
            dueDate: "Due",
            daysOverdue: "Days Overdue",
          },
        };
      case "usageReport":
        return {
          tableData: (usageData?.topBooks ?? []) as Record<string, unknown>[],
          columns: ["bookNumber", "bookName", "borrowCount"],
          columnLabels: {
            bookNumber: "Book No",
            bookName: "Book",
            borrowCount: "Times Borrowed",
          },
        };
      default:
        return {
          tableData: [],
          columns: [],
          columnLabels: {},
        };
    }
  }, [
    showResults,
    selectedReport,
    classListData,
    studentListData,
    borrowingData,
    overdueData,
    usageData,
    statusFilter,
  ]);

  // ── Export handler ──────────────────────────────────────────────────
  async function handleExport() {
    if (!school) return;
    setIsExporting(true);

    try {
      if (selectedReport === "fullSchoolExport") {
        if (!fullExportData) {
          toast.error("Data is still loading, please wait");
          return;
        }
        exportMultiSheetCsv(
          [
            { name: "classes", data: fullExportData.classes },
            { name: "students", data: fullExportData.students },
            { name: "books", data: fullExportData.books },
            { name: "borrowings", data: fullExportData.borrowings },
          ],
          "full_school_export"
        );
        toast.success("Full school data exported");
        return;
      }

      if (tableData.length === 0) {
        toast.error("No data to export");
        return;
      }

      const filenames: Partial<Record<ReportType, string>> = {
        classList: "class_list",
        studentList: "student_list",
        borrowingRecords: "borrowing_records",
        overdueReport: "overdue_report",
        usageReport: "usage_usage",
      };

      exportToCsv(tableData, filenames[selectedReport] ?? "report");
      toast.success(`Exported ${tableData.length} records`);
    } catch (err) {
      console.error("[Reports] Export failed:", err);
      toast.error("Failed to export report");
    } finally {
      setIsExporting(false);
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────
  function handleReportChange(value: ReportType) {
    setSelectedReport(value);
    setShowResults(false);
    setSelectedClass("");
    setDateFrom("");
    setDateTo("");
    setStatusFilter("");
  }

  function handleGenerate() {
    if (selectedReport === "classList" && !selectedClass) {
      toast.error("Please select a class");
      return;
    }
    if (selectedReport === "usageReport" && (!dateFrom || !dateTo)) {
      toast.error("Please select both start and end dates");
      return;
    }
    setShowResults(true);
  }

  const currentReport = reportOptions.find((r) => r.value === selectedReport);
  const needsClass = selectedReport === "classList";
  const showOptionalClass =
    selectedReport === "studentList" || selectedReport === "borrowingRecords";
  const needsDates = selectedReport === "usageReport";
  const showOptionalDates =
    selectedReport === "borrowingRecords" || selectedReport === "overdueReport";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground mt-1">
          Generate and export reports for your school
        </p>
      </div>

      {/* ── Report Type Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportOptions.map((opt) => (
          <Card
            key={opt.value}
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedReport === opt.value
                ? "border-2 border-primary ring-2 ring-primary/20"
                : "border-l-2 border-l-secondary"
            }`}
            onClick={() => handleReportChange(opt.value)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="text-primary">{opt.icon}</div>
                <div>
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {opt.description}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Report Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {needsClass && (
            <div>
              <label className="text-sm font-medium">Class *</label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a class</option>
                {classes?.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showOptionalClass && (
            <div>
              <label className="text-sm font-medium">Class (optional)</label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">All classes</option>
                {classes?.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedReport === "borrowingRecords" && (
            <div>
              <label className="text-sm font-medium">Status (optional)</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">All statuses</option>
                <option value="borrowed">Borrowed</option>
                <option value="returned">Returned</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          )}

          {(needsDates || showOptionalDates) && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">
                  From date {needsDates && "*"}
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  To date {needsDates && "*"}
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={handleGenerate}>
              Generate
            </Button>
            <Button
              onClick={handleExport}
              disabled={
                isExporting ||
                (selectedReport !== "fullSchoolExport" && !showResults)
              }
            >
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? "Exporting..." : `Export ${currentReport?.label}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Results Table ──────────────────────────────────────────── */}
      {showResults && selectedReport !== "fullSchoolExport" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{currentReport?.label} Results</span>
              {tableData.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  {tableData.length} records
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading...
              </div>
            ) : tableData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No data found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      {columns.map((col) => (
                        <th
                          key={col}
                          className="text-left py-3 px-4 font-medium"
                        >
                          {columnLabels[col]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row, i) => (
                      <tr
                        key={i}
                        className="border-b last:border-0 hover:bg-muted/50"
                      >
                        {columns.map((col) => (
                          <td key={col} className="py-3 px-4">
                            {String((row as Record<string, unknown>)[col] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Usage report summary cards */}
            {selectedReport === "usageReport" && usageData && (
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">
                    {usageData.totalBorrowings}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Total Borrowings
                  </div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">
                    {usageData.totalReturned}
                  </div>
                  <div className="text-xs text-muted-foreground">Returned</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">
                    {usageData.totalOverdue}
                  </div>
                  <div className="text-xs text-muted-foreground">Overdue</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">
                    {usageData.returnRate}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Return Rate
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Full School Export notice ─────────────────────────────── */}
      {selectedReport === "fullSchoolExport" && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            This will export all classes, students, books, and borrowing
            records as separate CSV files.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Download, FileText, BookOpen, Users, AlertTriangle, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { exportToCsv, exportMultiSheetCsv } from "@/lib/csv-export";

type ReportType = "classList" | "studentList" | "borrowingRecords" | "overdueReport" | "usageReport" | "readingLog";

const reportOptions: { value: ReportType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "classList", label: "Class List", icon: <BookOpen className="h-4 w-4" />, description: "List of all classes with stream counts" },
  { value: "studentList", label: "Student List", icon: <Users className="h-4 w-4" />, description: "All students organized by class and stream" },
  { value: "borrowingRecords", label: "Borrowing Records", icon: <FileText className="h-4 w-4" />, description: "Complete borrowing history with status" },
  { value: "overdueReport", label: "Overdue Report", icon: <AlertTriangle className="h-4 w-4" />, description: "Currently overdue books with student details" },
  { value: "usageReport", label: "Usage Report", icon: <BarChart3 className="h-4 w-4" />, description: "Book usage statistics and popular titles" },
  { value: "readingLog", label: "Reading Log", icon: <FileText className="h-4 w-4" />, description: "Full reading log for a student or date range" },
];

export default function ReportsPage() {
  const school = useSchool();
  const classes = useQuery(api.classes.listBySchool, school ? { schoolId: school._id } : "skip");
  const [selectedReport, setSelectedReport] = useState<ReportType>("classList");
  const [selectedClass, setSelectedClass] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    if (!school) return;
    setIsExporting(true);

    try {
      const commonArgs = {
        schoolId: school._id,
        classId: selectedClass ? (selectedClass as any) : undefined,
        dateFrom: dateFrom ? new Date(dateFrom).getTime() : undefined,
        dateTo: dateTo ? new Date(dateTo).getTime() : undefined,
      };

      let data: Record<string, unknown>[] = [];
      let filename = "";

      switch (selectedReport) {
        case "classList": {
          const result = await fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportType: "classList", ...commonArgs }),
          }).then((r) => r.json());
          data = result.data ?? [];
          filename = "class_list";
          break;
        }
        case "studentList": {
          const result = await fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportType: "studentList", ...commonArgs }),
          }).then((r) => r.json());
          data = result.data ?? [];
          filename = "student_list";
          break;
        }
        case "borrowingRecords": {
          const result = await fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportType: "borrowingRecords", ...commonArgs }),
          }).then((r) => r.json());
          data = result.data ?? [];
          filename = "borrowing_records";
          break;
        }
        case "overdueReport": {
          const result = await fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportType: "overdueReport", ...commonArgs }),
          }).then((r) => r.json());
          data = result.data ?? [];
          filename = "overdue_report";
          break;
        }
        case "usageReport": {
          const result = await fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportType: "usageReport", ...commonArgs }),
          }).then((r) => r.json());
          data = result.data ?? [];
          filename = "usage_report";
          break;
        }
        case "readingLog": {
          const result = await fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportType: "readingLog", ...commonArgs }),
          }).then((r) => r.json());
          data = result.data ?? [];
          filename = "reading_log";
          break;
        }
      }

      if (data.length === 0) {
        toast.error("No data found for this report");
        return;
      }

      exportToCsv(data, filename);
      toast.success(`Exported ${data.length} records`);
    } catch (err) {
      console.error("[Reports] Export failed:", err);
      toast.error("Failed to export report");
    } finally {
      setIsExporting(false);
    }
  }

  const currentReport = reportOptions.find((r) => r.value === selectedReport);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground mt-1">Generate and export reports for your school</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportOptions.map((opt) => (
          <Card
            key={opt.value}
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedReport === opt.value
                ? "border-2 border-primary ring-2 ring-primary/20"
                : "border-l-2 border-l-secondary"
            }`}
            onClick={() => setSelectedReport(opt.value)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="text-primary">{opt.icon}</div>
                <div>
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.description}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedReport !== "classList" && (
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

          {(selectedReport === "borrowingRecords" ||
            selectedReport === "overdueReport" ||
            selectedReport === "readingLog") && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">From date</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">To date</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={handleExport} disabled={isExporting}>
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? "Exporting..." : `Export ${currentReport?.label}`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

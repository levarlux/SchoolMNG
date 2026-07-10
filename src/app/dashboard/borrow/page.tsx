"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, BookMarked, UserPlus, BookOpen } from "lucide-react";
import { toast } from "sonner";

export default function BorrowPage() {
  const school = useSchool();
  const classes = useQuery(api.classes.listBySchool, school ? { schoolId: school._id } : "skip");
  const createBorrowing = useMutation(api.borrowings.create);
  const createStudent = useMutation(api.students.create);

  const [searchMode, setSearchMode] = useState<"existing" | "new">("existing");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchedStudent, setSearchedStudent] = useState<any>(null);

  // New student form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [admNo, setAdmNo] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedStream, setSelectedStream] = useState("");

  // Borrowing form
  const [bookName, setBookName] = useState("");
  const [bookNumber, setBookNumber] = useState("");
  const [dueDate, setDueDate] = useState("");

  const searchResults = useQuery(
    api.students.search,
    school && searchQuery.length >= 2 ? { schoolId: school._id, query: searchQuery } : "skip"
  );

  const studentBorrowings = useQuery(
    api.borrowings.listByStudent,
    searchedStudent ? { studentId: searchedStudent._id } : "skip"
  );

  const streamsQuery = useQuery(
    api.streams.listByClass,
    selectedClass ? { classId: selectedClass as any } : "skip"
  );

  const activeBorrowings = studentBorrowings?.filter((b: any) => b.status === "borrowed") ?? [];

  async function handleSelectStudent(student: any) {
    setSearchedStudent(student);
    setSearchQuery("");
  }

  async function handleCreateAndBorrow(e: React.FormEvent) {
    e.preventDefault();
    if (!school) return;

    let studentId: string;

    if (searchMode === "new") {
      if (!firstName.trim() || !lastName.trim() || !admNo.trim() || !selectedClass) {
        toast.error("Please fill all student fields");
        return;
      }
      const id = await createStudent({
        schoolId: school._id,
        classId: selectedClass as any,
        streamId: selectedStream ? (selectedStream as any) : undefined,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        admNo: admNo.trim(),
      });
      studentId = id;
      toast.success("Student profile created");
    } else {
      if (!searchedStudent) {
        toast.error("Please search and select a student");
        return;
      }
      studentId = searchedStudent._id;
    }

    if (!bookName.trim() || !bookNumber.trim() || !dueDate) {
      toast.error("Please fill all book fields");
      return;
    }

    await createBorrowing({
      schoolId: school._id,
      studentId: studentId as any,
      bookName: bookName.trim(),
      bookNumber: bookNumber.trim(),
      dueDate: new Date(dueDate).getTime(),
    });

    toast.success("Book borrowed successfully");
    resetForm();
  }

  function resetForm() {
    setSearchedStudent(null);
    setSearchQuery("");
    setFirstName("");
    setLastName("");
    setAdmNo("");
    setSelectedClass("");
    setSelectedStream("");
    setBookName("");
    setBookNumber("");
    setDueDate("");
    setSearchMode("existing");
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Borrow a Book</h1>
        <p className="text-muted-foreground mt-1">Find or create a student profile, then record the borrowing.</p>
      </div>

      <Card className="border-l-2 border-l-secondary">
        <CardHeader>
          <CardTitle>1. {searchMode === "existing" ? "Find Student" : "Create New Student"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={searchMode === "existing" ? "default" : "outline"}
              size="sm"
              onClick={() => setSearchMode("existing")}
            >
              <Search className="h-4 w-4 mr-1" /> Existing Student
            </Button>
            <Button
              variant={searchMode === "new" ? "default" : "outline"}
              size="sm"
              onClick={() => setSearchMode("new")}
            >
              <UserPlus className="h-4 w-4 mr-1" /> New Student
            </Button>
          </div>

          {searchMode === "existing" ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name (min 2 characters)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {searchedStudent ? (
                <div className="p-3 rounded-lg border border-green-200 bg-green-50 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{searchedStudent.firstName} {searchedStudent.lastName}</p>
                    <p className="text-sm text-muted-foreground">{searchedStudent.admNo}</p>
                  </div>
                  <Badge variant="success">Selected</Badge>
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                <div className="space-y-1">
                  {searchResults.map((s: any) => (
                    <button
                      key={s._id}
                      onClick={() => handleSelectStudent(s)}
                      className="w-full text-left p-3 rounded-lg hover:bg-secondary/5 border border-border transition-colors cursor-pointer"
                    >
                      <p className="font-medium">{s.firstName} {s.lastName}</p>
                      <p className="text-sm text-muted-foreground">{s.admNo}</p>
                    </button>
                  ))}
                </div>
              ) : searchQuery.length >= 2 ? (
                <p className="text-sm text-muted-foreground">No students found. Try a different name or switch to &quot;New Student&quot;.</p>
              ) : null}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
              <div className="col-span-2">
                <Label>Admission Number</Label>
                <Input value={admNo} onChange={(e) => setAdmNo(e.target.value)} required />
              </div>
              <div>
                <Label>Class</Label>
                <Select value={selectedClass} onChange={(e) => { setSelectedClass(e.target.value); setSelectedStream(""); }}>
                  <option value="">Select class</option>
                  {classes?.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </Select>
              </div>
              {classes?.find((c) => c._id === selectedClass)?.hasStreams && (
                <div>
                  <Label>Stream</Label>
                  <Select value={selectedStream} onChange={(e) => setSelectedStream(e.target.value)}>
                    <option value="">Select stream</option>
                    {streamsQuery?.map((st) => (
                      <option key={st._id} value={st._id}>{st.name}</option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {(searchMode === "new" || searchedStudent) && (
        <Card className="border-l-2 border-l-secondary">
          <CardHeader>
            <CardTitle>2. Book Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateAndBorrow} className="space-y-4">
              <div>
                <Label htmlFor="bookName">Book Name</Label>
                <Input id="bookName" value={bookName} onChange={(e) => setBookName(e.target.value)} placeholder="e.g. Mathematics Form 1" required />
              </div>
              <div>
                <Label htmlFor="bookNumber">Book Number / Accession Number</Label>
                <Input id="bookNumber" value={bookNumber} onChange={(e) => setBookNumber(e.target.value)} placeholder="e.g. BK-00123" required />
              </div>
              <div>
                <Label htmlFor="dueDate">Due Date</Label>
                <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full">
                <BookMarked className="h-4 w-4 mr-2" />
                {searchMode === "new" ? "Create Profile & Borrow" : "Borrow Book"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {searchedStudent && activeBorrowings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Currently Borrowed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeBorrowings.map((b) => (
                <div key={b._id} className="flex justify-between items-center text-sm p-2 rounded-lg bg-secondary/5">
                  <span className="font-medium">{b.bookName}</span>
                  <span className="text-muted-foreground">Due {new Date(b.dueDate).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Shield, LogIn, LogOut, Clock } from "lucide-react";
import { toast } from "sonner";

export default function GateLogPage() {
  const school = useSchool();
  const [tab, setTab] = useState<"visitors" | "student">("visitors");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedDate] = useState(new Date().toISOString().split("T")[0]);

  const dateTimestamp = new Date(selectedDate).getTime();
  const visitors = useQuery(
    api.gateLog.listVisitors,
    school ? { schoolId: school._id, date: dateTimestamp } : "skip"
  );

  const checkInVisitor = useMutation(api.gateLog.checkInVisitor);
  const checkOutVisitor = useMutation(api.gateLog.checkOutVisitor);

  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [visitorPurpose, setVisitorPurpose] = useState("");
  const [personToVisit, setPersonToVisit] = useState("");

  async function handleCheckIn(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !visitorName.trim() || !visitorPurpose.trim()) return;
    try {
      await checkInVisitor({
        schoolId: school._id,
        visitorName: visitorName.trim(),
        phone: visitorPhone || undefined,
        purpose: visitorPurpose.trim(),
        personToVisit: personToVisit || undefined,
      });
      toast.success("Visitor checked in");
      setShowAdd(false);
      setVisitorName("");
      setVisitorPhone("");
      setVisitorPurpose("");
      setPersonToVisit("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!school) {
    return (
      <div className="flex items-center justify-center p-16">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  const checkedIn = visitors?.filter((v) => !v.checkOutTime).length ?? 0;
  const checkedOut = visitors?.filter((v) => v.checkOutTime).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gate Log</h1>
          <p className="text-muted-foreground text-sm">Visitor check-in/out and student gate passes</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Check In Visitor
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <LogIn className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-lg font-bold">{checkedIn}</p>
              <p className="text-xs text-muted-foreground">Currently In</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <LogOut className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-lg font-bold">{checkedOut}</p>
              <p className="text-xs text-muted-foreground">Checked Out</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {visitors === undefined ? (
        <div className="flex items-center justify-center p-8"><BrandLoader variant="book" size="md" /></div>
      ) : visitors.length === 0 ? (
        <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground text-sm"><Shield className="h-10 w-10 mx-auto mb-3 opacity-50" />No visitors today.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {visitors.map((v) => (
            <Card key={v._id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{v.visitorName}</p>
                    {v.checkOutTime ? (
                      <Badge variant="secondary">Checked Out</Badge>
                    ) : (
                      <Badge variant="success">In</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{v.purpose}</p>
                  {v.personToVisit && <p className="text-xs text-muted-foreground">Visiting: {v.personToVisit}</p>}
                  <p className="text-xs text-muted-foreground">
                    In: {new Date(v.checkInTime).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                    {v.checkOutTime && ` | Out: ${new Date(v.checkOutTime).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}`}
                  </p>
                </div>
                {!v.checkOutTime && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try { await checkOutVisitor({ id: v._id }); toast.success("Checked out"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                    }}
                  >
                    Check Out
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Check In Visitor">
        <form onSubmit={handleCheckIn} className="space-y-4">
          <div>
            <Label>Visitor Name *</Label>
            <Input value={visitorName} onChange={(e) => setVisitorName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input value={visitorPhone} onChange={(e) => setVisitorPhone(e.target.value)} />
            </div>
            <div>
              <Label>Person to Visit</Label>
              <Input value={personToVisit} onChange={(e) => setPersonToVisit(e.target.value)} placeholder="e.g. Student Name" />
            </div>
          </div>
          <div>
            <Label>Purpose *</Label>
            <Input value={visitorPurpose} onChange={(e) => setVisitorPurpose(e.target.value)} required placeholder="e.g. Pick up student, Meeting with teacher" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Check In</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

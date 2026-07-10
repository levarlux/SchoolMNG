"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RotateCcw, Search, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function ReturnsPage() {
  const school = useSchool();
  const allBorrowings = useQuery(api.borrowings.listBySchool, school ? { schoolId: school._id } : "skip");
  const markReturned = useMutation(api.borrowings.markReturned);

  const [search, setSearch] = useState("");

  const active = allBorrowings?.filter((b) => b.status === "borrowed") ?? [];

  const filtered = active.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return b.bookName.toLowerCase().includes(q) || b.bookNumber.toLowerCase().includes(q);
  });

  async function handleReturn(id: string) {
    await markReturned({ id: id as any });
    toast.success("Book marked as returned");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Returns</h1>
        <p className="text-muted-foreground mt-1">Mark borrowed books as returned.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by book name or number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="space-y-2">
        {filtered.map((b) => (
          <Card key={b._id} className="border-l-2 border-l-secondary">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium">{b.bookName}</p>
                  <p className="text-sm text-muted-foreground">#{b.bookNumber}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Borrowed {new Date(b.borrowedAt).toLocaleDateString()} &middot; Due {new Date(b.dueDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {b.dueDate < Date.now() && (
                    <Badge variant="danger">Overdue</Badge>
                  )}
                  <Button onClick={() => handleReturn(b._id)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Return
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <RotateCcw className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No active borrowings found</p>
          </div>
        )}
      </div>
    </div>
  );
}

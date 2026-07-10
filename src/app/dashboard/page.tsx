"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Users, BookMarked, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default function Dashboard() {
  const school = useSchool();
  const classes = useQuery(api.classes.listBySchool, school ? { schoolId: school._id } : "skip");
  const students = useQuery(api.students.listBySchool, school ? { schoolId: school._id } : "skip");
  const activeBorrowings = useQuery(api.borrowings.listActive, school ? { schoolId: school._id } : "skip");

  const overdue = activeBorrowings?.filter((b: any) => b.dueDate < Date.now()) ?? [];

  const stats = [
    { label: "Classes", value: classes?.length ?? 0, icon: BookOpen, href: "/dashboard/classes", color: "text-blue-600" },
    { label: "Students", value: students?.length ?? 0, icon: Users, href: "/dashboard/students", color: "text-green-600" },
    { label: "Active Borrowings", value: activeBorrowings?.length ?? 0, icon: BookMarked, href: "/dashboard/borrow", color: "text-purple-600" },
    { label: "Overdue", value: overdue.length, icon: AlertCircle, href: "/dashboard/returns", color: "text-red-600" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back! Here&apos;s your library at a glance.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-2 border-l-secondary">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                      <p className="text-3xl font-bold mt-1">{stat.value}</p>
                    </div>
                    <Icon className={`h-8 w-8 ${stat.color}`} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {overdue.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5" /> Overdue Books
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdue.slice(0, 5).map((b: any) => (
                <div key={b._id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{b.bookName}</span>
                  <Badge variant="danger">Overdue</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

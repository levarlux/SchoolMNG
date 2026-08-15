"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { Search, User } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";

/**
 * Global student search (Student 360) — lives in the dashboard header so
 * the principal can find any student from any page. Principal-only.
 */
export function GlobalSearch() {
  const school = useSchool();
  const role = useRole();
  const router = useRouter();

  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounce so we don't hammer Convex per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(input.trim()), 250);
    return () => clearTimeout(t);
  }, [input]);

  const results = useQuery(
    api.globalSearch.searchAll,
    school && debounced.length > 0 ? { schoolId: school._id, query: debounced } : "skip"
  );

  // Close on outside click.
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  if (!isLeadershipRole(role)) return null;

  const loading = open && debounced.length > 0 && results === undefined;

  function go(studentId: string) {
    setOpen(false);
    setInput("");
    setDebounced("");
    // Static export can't serve dynamic [id] routes — the profile is a
    // view on the students page keyed by the ?view= query param.
    router.push(`/dashboard/students?view=${studentId}`);
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-xs">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search any student by name or adm no…"
          className="flex h-10 w-full rounded-lg border border-border bg-background pl-10 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        />
      </div>

      {open && debounced.length > 0 && (
        <div className="absolute top-11 left-0 right-0 z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <BrandLoader variant="dots" size="sm" /> Searching…
            </div>
          ) : results && results.length > 0 ? (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((s) => (
                <li key={s._id}>
                  <button
                    onClick={() => go(s._id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/10 transition-colors"
                  >
                    {s.photoUrl ? (
                      <img src={s.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {s.firstName[0]}{s.lastName[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{s.firstName} {s.lastName}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{s.admNo}</span>
                      </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {s.status && <span className="capitalize">{s.status}</span>}
                      {"matchSource" in s && s.matchSource === "custom_field" && (
                        <span className="text-primary/70">custom field match</span>
                      )}
                    </div>
                    </div>
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No students match “{debounced}”
            </div>
          )}
        </div>
      )}
    </div>
  );
}

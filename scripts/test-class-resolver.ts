/**
 * Stress test for the school-agnostic class resolver.
 * Run with: node scripts/test-class-resolver.ts   (Node >= 24, type stripping)
 */

import {
  normalizeName,
  tokenize,
  resolveClassStream,
  describeResolution,
  type ClassRef,
  type StreamRef,
  type StudentRef,
} from "../convex/classResolver.ts";

let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    console.error(`  FAIL ${label}\n    expected: ${e}\n    actual:   ${a}`);
  }
}

function checkTrue(label: string, cond: boolean) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`  FAIL ${label}`);
  }
}

const classes: ClassRef[] = [
  { id: "c-pp1", name: "PP1", hasStreams: true },
  { id: "c-g1", name: "Grade 1", hasStreams: true },
  { id: "c-g2", name: "Grade 2", hasStreams: true },
  { id: "c-f1", name: "Form 1", hasStreams: true },
  { id: "c-f4", name: "Form 4", hasStreams: false },
  { id: "c-3", name: "3", hasStreams: true },
  { id: "c-3e", name: "3E", hasStreams: false },
  { id: "c-std5", name: "Standard 5", hasStreams: true },
  { id: "c-g1a-leaf", name: "Grade 1 A", hasStreams: false }, // phantom style
  { id: "c-g10", name: "Grade 10", hasStreams: true },
  { id: "c-g1b", name: "Grade 1 B", hasStreams: false }, // a real leaf (grade 1b stream is B but written combined as class)
];

const streams: StreamRef[] = [
  { id: "s-pp1-a", classId: "c-pp1", name: "A" },
  { id: "s-g1-a", classId: "c-g1", name: "A" },
  { id: "s-g1-b", classId: "c-g1", name: "B" },
  { id: "s-g2-e", classId: "c-g2", name: "East" },
  { id: "s-g2-w", classId: "c-g2", name: "West" },
  { id: "s-f1-w", classId: "c-f1", name: "West" },
  { id: "s-3-e", classId: "c-3", name: "E" },
  { id: "s-std5-r", classId: "c-std5", name: "Red" },
  { id: "s-g10-a", classId: "c-g10", name: "A" },
];

const students: StudentRef[] = [
  { classId: "c-g1", streamId: "s-g1-a" },
  { classId: "c-g1", streamId: "s-g1-a" },
  { classId: "c-g1", streamId: "s-g1-b" },
  { classId: "c-g2", streamId: "s-g2-e" },
  { classId: "c-f1", streamId: "s-f1-w" },
  { classId: "c-3", streamId: "s-3-e" },
  { classId: "c-g1b" },
];

console.log("── normalizeName / tokenize ──");
check("normalize mixed separators", normalizeName("Grade 1 A"), "grade 1 a");
check("normalize punctuation", normalizeName("Grade-1  A  "), "grade 1 a");
check("normalize unicode", normalizeName("Grade 2 – Blue"), "grade 2 blue");
check("tokens combined", tokenize("Grade 1 A"), ["grade", "1", "a"]);
check("tokens G1A", tokenize("G1A"), ["g", "1", "a"]);
check("tokens 3E", tokenize("3E"), ["3", "e"]);
check("tokens grade2blue", tokenize("grade2 blue"), ["grade", "2", "blue"]);
check("tokens Grade 10", tokenize("Grade 10"), ["grade", "10"]);
check("tokens PP1 A", tokenize("PP1 A"), ["pp", "1", "a"]);

console.log("── Baptist Prep: fee structure file, combined class ──");
const r1 = resolveClassStream({ className: "Grade 1 A" }, classes, streams, students);
check("fee 'Grade 1 A' reconciles", r1, {
  status: "reconciled",
  classId: "c-g1",
  streamId: "s-g1-a",
  className: "Grade 1",
  streamName: "A",
});

console.log("── student file: split columns ──");
const r2 = resolveClassStream({ className: "Grade 1", streamName: "A" }, classes, streams, students);
check("split 'Grade 1'+'A' exact", r2, {
  status: "exact",
  classId: "c-g1",
  streamId: "s-g1-a",
  className: "Grade 1",
  streamName: "A",
});

console.log("── naming variants ──");
checkTrue(
  "'Form 1 West' → Form 1 · West",
  resolveClassStream({ className: "Form 1 West" }, classes, streams, students).status === "reconciled"
);
checkTrue(
  "'G1A' → Grade 1 · A (no spaces, split alnum)",
  resolveClassStream({ className: "G1A" }, classes, streams, students).status === "reconciled"
);
checkTrue(
  "'3E' prefers streamed class 3 · E over leaf 3E",
  JSON.stringify(resolveClassStream({ className: "3E" }, classes, streams, students)) ===
    JSON.stringify({ status: "reconciled", classId: "c-3", streamId: "s-3-e", className: "3", streamName: "E" })
);
checkTrue(
  "'Grade 2 East' → Grade 2 · East",
  resolveClassStream({ className: "Grade 2 East" }, classes, streams, students).status === "reconciled"
);
checkTrue(
  "'Grade 2 West' → Grade 2 · West",
  resolveClassStream({ className: "Grade 2 West" }, classes, streams, students).status === "reconciled"
);
checkTrue(
  "'Standard 5 Red' → Standard 5 · Red",
  resolveClassStream({ className: "Standard 5 Red" }, classes, streams, students).status === "reconciled"
);
checkTrue(
  "'PP1 A' → PP1 · A",
  resolveClassStream({ className: "PP1 A" }, classes, streams, students).status === "reconciled"
);
checkTrue(
  "'Grade 10 A' → Grade 10 · A (Grade 1 vs Grade 10 not confused)",
  resolveClassStream({ className: "Grade 10 A" }, classes, streams, students).status === "reconciled"
);

console.log("── leaf classes ──");
const rLeaf = resolveClassStream({ className: "Form 4" }, classes, streams, students);
check("'Form 4' leaf exact", rLeaf, { status: "exact", classId: "c-f4", className: "Form 4" });

console.log("── ambiguity ──");
checkTrue(
  "'Grade 1 B' ambiguous (leaf 'Grade 1 B' + class 'Grade 1'·B both exist)",
  resolveClassStream({ className: "Grade 1 B" }, classes, streams, students).status === "ambiguous"
);

console.log("── no match / create decision ──");
check("'Year 13' nomatch", resolveClassStream({ className: "Year 13" }, classes, streams, students).status, "nomatch");
check("empty className nomatch", resolveClassStream({ className: "   " }, classes, streams, students).status, "nomatch");

console.log("── student-dictionary fallback (thin registry) ──");
const thinClasses: ClassRef[] = [{ id: "c-g1", name: "Grade 1", hasStreams: true }];
const thinStreams: StreamRef[] = [{ id: "s-g1-a", classId: "c-g1", name: "A" }];
const thinStudents: StudentRef[] = [{ classId: "c-g1", streamId: "s-g1-a" }];
// Registry has the pair, but ALSO exercise the fallback when only students carry it:
checkTrue(
  "dict fallback resolves via students",
  resolveClassStream({ className: "Grade 1 A" }, thinClasses, thinStreams, thinStudents).status === "reconciled"
);

console.log("── description strings ──");
const d = describeResolution({ className: "Grade 1 A" }, r1);
checkTrue("describe reconciled", d === "Grade 1 A → Grade 1 · A");

console.log("");
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

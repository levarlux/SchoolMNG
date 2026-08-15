/**
 * School-agnostic class + stream resolver.
 *
 * Imported data (fee structures, student placements, marks, ...) refers to a
 * class many ways: "Grade 1 A", "Grade 1", "Form 1 West", "3E", "G1A", "Grade
 * 2 – Blue". A value is therefore NEVER treated as an opaque token — it is
 * reconciled against the school's OWN registry (classes + streams) and, when
 * that registry is thin, the school's OWN students. No naming convention is
 * hard-coded: the vocabulary always comes from the data. Ambiguity stops and
 * asks instead of guessing.
 *
 * Pure module — no Convex imports, safe to run in a unit test and safe to
 * import from client components (preview hints) and server functions alike.
 */

export type ClassRef = {
  id: string;
  name: string;
  hasStreams: boolean;
};

export type StreamRef = {
  id: string;
  classId: string;
  name: string;
};

export type StudentRef = {
  classId: string;
  streamId?: string;
};

export type ResolveOutcome =
  | {
      status: "exact";
      classId: string;
      streamId?: string;
      className: string;
      streamName?: string;
    }
  | {
      status: "reconciled";
      classId: string;
      streamId: string;
      className: string;
      streamName: string;
    }
  | {
      status: "ambiguous";
      matches: { classId: string; streamId?: string; label: string }[];
    }
  | { status: "nomatch" };

/** Case/punctuation-insensitive key: "Grade 1 A" == "grade1a" == "GRADE-1 A". */
export function normalizeName(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-–—,.]+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split a name into tokens, separating mixed letter/digit runs:
 * "grade 1 a" → ["grade","1","a"], "G1A" → ["g","1","a"], "3E" → ["3","e"],
 * "grade2 blue" → ["grade","2","blue"].
 */
export function tokenize(v: unknown): string[] {
  const norm = normalizeName(v);
  if (!norm) return [];
  const out: string[] = [];
  for (const word of norm.split(" ")) {
    let run = "";
    let mode: "L" | "D" | "" = "";
    for (const ch of word) {
      const isDigit = ch >= "0" && ch <= "9";
      const isLetter = (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
      const m = isDigit ? "D" : isLetter ? "L" : "";
      if (m && m !== mode) {
        if (run) out.push(run);
        run = "";
        mode = m;
      }
      if (m) run += ch;
    }
    if (run) out.push(run);
  }
  return out;
}

function tokensEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/**
 * Resolve a (possibly combined) class value to a real class/stream pair.
 *
 * Priority:
 *   1. Explicit stream column → exact class + exact stream.
 *   2. Combined value decomposes into an existing streamed class + stream
 *      (e.g. "Grade 1 A" → class "Grade 1" + stream "A").
 *   3. Exact leaf-class match ("Grade 1 A" is itself a class).
 *   4. Student-derived dictionary (registry thin but students exist).
 *   5. None of the above → "nomatch" (caller decides: create or error).
 *
 * When several candidates tie, the ones the school's own students actually
 * use win; if that still leaves more than one, the result is "ambiguous".
 */
export function resolveClassStream(
  input: { className: string; streamName?: string },
  classes: ClassRef[],
  streams: StreamRef[],
  students?: StudentRef[]
): ResolveOutcome {
  const cn = normalizeName(input.className);
  if (!cn) return { status: "nomatch" };

  const classByName = new Map<string, ClassRef>();
  for (const c of classes) classByName.set(normalizeName(c.name), c);

  const streamsByClass = new Map<string, StreamRef[]>();
  for (const s of streams) {
    const list = streamsByClass.get(s.classId) ?? [];
    list.push(s);
    streamsByClass.set(s.classId, list);
  }

  const studentPairs = new Set<string>();
  for (const s of students ?? []) {
    studentPairs.add(s.streamId ? `${s.classId}:${s.streamId}` : s.classId);
  }

  const pushCandidate = (
    list: { classId: string; streamId?: string; label: string; hasStudents: boolean }[],
    classId: string,
    streamId: string | undefined,
    label: string
  ) => {
    const hasStudents = streamId ? studentPairs.has(`${classId}:${streamId}`) : studentPairs.has(classId);
    list.push({ classId, streamId, label, hasStudents });
  };

  // ── 1. Explicit stream column → exact class + exact stream ──────────
  const sn = input.streamName ? normalizeName(input.streamName) : undefined;
  if (sn) {
    const cls = classByName.get(cn);
    if (!cls) return { status: "nomatch" };
    const stream = (streamsByClass.get(cls.id) ?? []).find((s) => normalizeName(s.name) === sn);
    if (!stream) return { status: "nomatch" };
    return { status: "exact", classId: cls.id, streamId: stream.id, className: cls.name, streamName: stream.name };
  }

  const candidates: { classId: string; streamId?: string; label: string; hasStudents: boolean }[] = [];
  const cnTokens = tokenize(cn);

   // ── 2. Decompose a combined value into class + stream ───────────────
  for (const cls of classes) {
    const clsTokens = tokenize(cls.name);
    if (clsTokens.length === 0 || clsTokens.length >= cnTokens.length) continue;
    // Verify the class prefix actually matches the input prefix before
    // treating the remainder as a stream name. Without this check, "Grade 1 A"
    // would decompose against "Grade 2" (same length prefix) → wrong match.
    const prefix = cnTokens.slice(0, clsTokens.length);
    if (!tokensEqual(clsTokens, prefix)) continue;
    const rest = cnTokens.slice(clsTokens.length);
    for (const st of streamsByClass.get(cls.id) ?? []) {
      if (tokensEqual(tokenize(st.name), rest)) {
        pushCandidate(candidates, cls.id, st.id, `${cls.name} · ${st.name}`);
      }
    }
  }

  // ── 3. Exact leaf-class match (class itself) ────────────────────────
  const clsOnly = classByName.get(cn);
  if (clsOnly) pushCandidate(candidates, clsOnly.id, undefined, clsOnly.name);

  // ── 4. Student-derived dictionary (thin registry fallback) ──────────
  if (candidates.length === 0 && (students ?? []).length > 0) {
    const classById = new Map(classes.map((c) => [c.id, c]));
    const streamById = new Map(streams.map((s) => [s.id, s]));
    const seen = new Set<string>();
    for (const s of students ?? []) {
      const key = s.streamId ? `${s.classId}:${s.streamId}` : s.classId;
      if (seen.has(key)) continue;
      seen.add(key);
      const cls = classById.get(s.classId);
      if (!cls) continue;
      if (s.streamId) {
        const st = streamById.get(s.streamId);
        if (!st) continue;
        if (normalizeName(`${cls.name} ${st.name}`) === cn) {
          pushCandidate(candidates, cls.id, st.id, `${cls.name} · ${st.name}`);
        }
      } else if (normalizeName(cls.name) === cn) {
        pushCandidate(candidates, cls.id, undefined, cls.name);
      }
    }
  }

  if (candidates.length === 0) return { status: "nomatch" };

  const toOutcome = (c: { classId: string; streamId?: string; label: string }) =>
    c.streamId
      ? {
          status: "reconciled" as const,
          classId: c.classId,
          streamId: c.streamId,
          className: c.label.split(" · ")[0] ?? "",
          streamName: c.label.split(" · ")[1] ?? "",
        }
      : { status: "exact" as const, classId: c.classId, className: c.label };

  // ── Rank: candidates the school's own students actually use win. ────
  // If two DIFFERENT candidates both house students (e.g. a real leaf class
  // "Grade 1 B" AND a stream B under "Grade 1"), that is genuinely ambiguous —
  // stop and ask rather than guess.
  const withStudents = candidates.filter((c) => c.hasStudents);
  if (withStudents.length === 1) return toOutcome(withStudents[0]!);
  if (withStudents.length > 1) {
    return {
      status: "ambiguous",
      matches: withStudents.map((c) => ({ classId: c.classId, streamId: c.streamId, label: c.label })),
    };
  }

  // No students anywhere yet: prefer a unique streamed decomposition over a
  // leaf match (a combined value usually means class + stream).
  if (candidates.length === 1) return toOutcome(candidates[0]!);
  const streamed = candidates.filter((c) => c.streamId);
  if (streamed.length === 1) return toOutcome(streamed[0]!);

  return {
    status: "ambiguous",
    matches: candidates.map((c) => ({ classId: c.classId, streamId: c.streamId, label: c.label })),
  };
}

/** Describe a resolution for preview/report UI (single source of truth). */
export function describeResolution(input: { className: string; streamName?: string }, outcome: ResolveOutcome): string {
  switch (outcome.status) {
    case "exact":
      return outcome.streamName
        ? `${input.className} → ${outcome.className} · ${outcome.streamName}`
        : `${input.className} → ${outcome.className}`;
    case "reconciled":
      return `${input.className} → ${outcome.className} · ${outcome.streamName}`;
    case "ambiguous":
      return `${input.className} matches ${outcome.matches.length} classes (${outcome.matches.map((m) => m.label).join(", ")})`;
    case "nomatch":
      return `${input.className} does not match any class`;
  }
}

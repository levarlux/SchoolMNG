# SchoolMNG — One System, Every School's Own Way

*A plain-language vision and build plan. Written so anyone at a school — head, bursar, clerk, board member — can read it and understand what we are building and why.*

---

## 1. The idea in one paragraph

A school already keeps its records — in files, registers, folders, and spreadsheets. Those records are almost never tidy. One file has student names. Another has payments. Another has marks. Birth certificates sit in one folder, photos in another. Staff files are separate again. **The only thing that connects all of these is a person's name** (or their admission / staff number).

SchoolMNG's job is to take all that scattered information, **tie each piece to the right person**, and bring it together into one clear, complete view of that person — plus clear answers for the school as a whole: how much has each student paid, who is in arrears, how is each class performing, how is attendance, what is happening in the school.

And because no two schools are alike — different columns, different documents, different naming, different levels of complexity — the system must **learn each school's own way of doing things** instead of forcing one rigid format on everyone.

---

## 2. The golden rule: one identity, everything ties to it

Every person (or thing) in the school has an identity:

| Who / What | Their identity |
|---|---|
| Student | Admission number + name |
| Teaching staff | Staff / TSC number + name |
| Non-teaching & admin staff | Staff number + name |
| Bus / vehicle | Vehicle registration |
| Library book | Book / accession number |
| Class, stream, subject, activity | Their own names |

Everything a school records — a payment, a mark, an attendance register, a birth certificate, a photo, a feeding record, a timetable — **ties to one of these identities**. The system's core skill is doing that tying reliably: reading a name out of any file, finding the right person, attaching the information, and remembering the match so it never needs to be done again.

---

## 3. The four pipelines

All the information flows through four lanes.

```
            ┌────────────────────────────────────────────┐
            │   Whatever the school uploads or enters    │
            └───────────────────┬────────────────────────┘
                                │  "Who is this about?"
                    ┌───────────┼───────────────┬─────────┐
                    ▼           ▼               ▼         ▼
             ┌────────────┐ ┌──────────┐ ┌───────────┐ ┌─────────────┐
             │ 1. STUDENTS │ │ 2. STAFF  │ │3. THINGS & │ │4. ANALYTICS │
             │  everything │ │  teaching,│ │ OPERATIONS │ │  compiled   │
             │  about each │ │ non-teach,│ │ buses,books│ │  views &    │
             │  learner    │ │  admin    │ │ timetable, │ │  reports    │
             │             │ │           │ │ activities │ │             │
             └─────────────┘ └───────────┘ └────────────┘ └─────────────┘
```

**Pipeline 1 — Students.** Every learner has a full profile: identity and bio, guardians, class and stream, academics (exams, marks, report cards), attendance, fees (expected, paid, balance, arrears, credit), library, health, behaviour, documents (birth certificate, photos, certificates), and any extra fields the school wants.

**Pipeline 2 — Staff.** The same idea for everyone who works at the school: teaching, non-teaching, and administrative staff. Each staff member gets a profile holding their documents (contract, ID), subjects and classes they teach, timetable, attendance, payroll/honoraria, and any extra fields the school wants.

**Pipeline 3 — Things & Operations.** The physical and day-to-day side: buses and routes, library books and borrowing, inventory,  timetable, activities, feeding, boarding. These connect to people (a bus route has students; a timetable ties a teacher, a class, and a subject) and to the school as a whole.

**Pipeline 4 — Analytics & Reports.** Everything compiled for decision-making: total fees collected, arrears, top debtors, class performance, grade distribution, attendance trends, library usage, staff numbers, student numbers.  fees, report,marks classes, teachers as a whole, students as a whole, etcThis feeds the dashboards, term-end statements, and board reports and any other page responsible

> If we have missed a lane, the answer is not a new lane in the code — it is the school defining it in their own structure (see section 5). The engine stays the same. let it be flexible so they can manipulate edit, change, dlet, customize to their liking

---

## 4. How information gets in: the intake, done once

Today, a school uploads a file and the system tries to import it — but only if the file happens to match a fixed format. That is the main thing we are changing.

**The new intake works like this:**

1. **Upload anything.** A names list, a payments sheet, a marks sheet, a folder of birth certificates, a PDF register. All at once, in bulk — not one student at a time.
2. **The system reads each file** and asks: *what is this?* (names? money? marks? documents?) and *who is this about?* (students, staff, buses…?).
3. **Matching.** Each row or document is matched to the right person by name or number:
   - *Confident match* (e.g. admission number, or a clear unique name) → linked automatically.
   - *Not sure* (two students share a name, or the spelling differs) → shown to a staff member in a **fixes queue**; they pick the right person once, and the system **remembers forever**.
4. **Attach.** Birth certificates and photos are matched to students the same way and stored on their profile.
5. **Compile.** Every matched piece appears in the person's 360° profile and in the analytics — no manual re-entry, no double-typing.

**What this feels like for a school:** "I gave the system my 600 students' files, my payments, my marks, and my certificates. It asked me about the few dozen names it wasn't sure of, and now everything is together."

---

## 5. Every school is different: the School Blueprint

We are **not building one version per school** — that is impossible and unnecessary. Instead, each school gets a **Blueprint**: a one-page description of how *that* school works, stored with their data.

The Blueprint holds things like:

- **Naming:** how admission numbers are formed (`ADM-1001`, `BP/2026/001`, …) and staff numbers; the system uses the school's own pattern and never invents a wrong one.
- **Terms:** "Term 1/2/3", "Semester A/B", or whatever the school calls them, and how many per year.
- **Grading:** the school's own scale (e.g. 80–100 = A, or a different banding), used in report cards and results.
- **Their fields:** extra columns the school tracks (house, nationality, sponsor, clubs…), defined once in a simple builder.
- **Their documents:** which document types the school actually uses (admission form, CBC report card, fee statement…).

A Blueprint can be created **three ways** — exactly matching how real schools operate:

1. **The school builds it** — with simple screens (a "structure builder").
2. **The assistant builds it** — the school uploads its own files (student list, fee schedule, report card, admission form) and the assistant proposes the whole Blueprint from what it reads; the school reviews and confirms.
3. **The files build it** — during intake, the system spots things it hasn't seen (a new column, a new class, a new document type) and offers to add them right then.

New schools start with a sensible default Blueprint, so nothing is empty or blocked while they customise.

---

## 6. The assistant that does the work (with your approval)

Every school gets a **personal assistant** inside the system. It works like this:

- Upload your files into the assistant and say what you want:
  *"Import these students and their payments."*
  *"Attach these certificates to the right students."*
  *"Rename the school to its correct name."*
- The assistant looks at your data, figures out the steps, and shows them to you as **approval cards**: *"I will add 560 students and 3,031 payments, and link 40 certificates. Approve?"*
- You click **Approve** and it does the work — neatly, within your school's data only, with a record of everything it did.
- Nothing touches another school, and nothing happens without your approval.

This is the same pattern the system already uses safely for permissions — we are extending it to data work.

---

## 7. What the school sees afterwards

**A person's 360° profile** — one screen per student (or staff member) showing everything that has been tied to them:

- Identity, guardian(s), class/stream
- Academics: exams, marks, grades, report cards
- Attendance
- Fees: expected, paid, balance, arrears, credit carried forward
- Library: books borrowed
- Documents: birth certificate, photos, certificates
- Any extra fields the school defined

**The school's compiled views** — fees dashboard (collected, arrears, top debtors), class performance, attendance, library usage, staff lists, and exports for the board.

---

## 8. What already works today

To be honest about the starting point — some of this is built and working:

| Area | Status |
|---|---|
| Students / staff / classes / streams / terms records | ✅ Working |
| Import of students, staff, fee structures, attendance, fee payments, subjects, classes, terms (by admission number) | ✅ Working |
| Duplicate detection and per-row skip/overwrite during student import | ✅ Working |
| Student 360° profile (Overview, Academics, Attendance, Library, Fees, EAV fields) | ✅ Working |
| Fees math with credit carry-over | ✅ Working |
| School's own custom fields (EAV / Structure Builder) | ✅ Working |
| Saved per-school import mappings (remembers column mapping) | ✅ Working |
| AI column-mapping suggestions during import | ✅ Working |
| **Bulk name-keyed matching across many files** | ❌ Not yet |
| **Fixes queue for ambiguous names** | ❌ Not yet |
| **Bulk document attachment (birth certs, photos) + Documents tab** | ❌ Not yet |
| **Marks/results import (CSV)** | ❌ Not yet |
| **School Blueprint (naming, terms, grading, their documents)** | ❌ Not yet |
| **Assistant that proposes and performs data changes with approval** | ❌ Not yet |
| **Report template engine (their PDF + batch generation)** | ❌ Not yet |

The plan closes these gaps in four phases, each safe to ship on its own.

---

## 9. The build plan

**Phase 1 — School Blueprint.** Naming conventions, term naming, grading scale, school document types — stored per school, with defaults so nothing breaks. *(Builds section 5.)*

**Phase 2 — Identity Engine & bulk intake.** Match any file's rows/documents to the right person by name or number; auto-link confident matches; fixes queue for the rest; remembered links; bulk document attachment; Documents tab on profiles; marks import. *(Builds sections 4 and 7 — the heart of the idea.)*

**Phase 3 — The assistant (approve-to-act).** Upload files into the assistant, it proposes the changes as approval cards, you approve, it executes with a full audit trail. *(Builds section 6.)*

**Phase 4 — Report templates.** Upload the school's own report-card PDF, bind the fields once, and batch-generate report cards for a whole class or term, graded with the school's own scale. *(Builds the report-card half of section 7.)*

**How we will prove it works:** using a realistic test school (Baptist Preparatory — 560 students, 3,031 payments, 9,640 marks, certificates and profile documents) so we can see the intake actually tie everything together before it ever meets a real school.

---

## 10. One sentence for the board

**We are building one flexible system where each school defines its own structure, uploads its messy real-world records once, and the system ties every piece of information to the right person — so staff stop re-typing and start seeing the full picture, for every student, every staff member, and the school as a whole.**

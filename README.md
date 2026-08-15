# SchoolMNG

> A comprehensive, multi-tenant school management system that replaces spreadsheets, third-party tools, and fragmented software with one unified platform.

**Version:** 0.2.1 | **Stack:** Next.js 16 + Convex + Clerk + Tauri | **License:** Private

---

## What is SchoolMNG?

SchoolMNG is a full-featured school management platform built for principals, teachers, and administrators. It handles everything from student records and attendance to fees, library, health, discipline, transport, and staff management — all in one place.

The system is built on a **schema-driven Entity-Attribute-Value (EAV) architecture**, meaning every school can customize modules, sections, and fields to match their specific needs without code changes.

---

## Features at a Glance

| Category | Modules |
|----------|---------|
| **Learner Management** | Students, Classes, Streams, Attendance, Exams & Results, Health Records, Discipline, Documents, Extracurricular, Promotions |
| **Academic** | Subjects, Timetable, Lesson Plans, Schemes of Work, Academic Years & Terms |
| **Library** | Books, Borrowings, Fines, Book Holds, Book Transfers |
| **Finance** | Fee Structures, Fee Payments, Expenditures, Budgets, Supplier Payments |
| **Teaching Staff** | Teachers, Staff Attendance, Duty Roster, Leave Requests, Appraisals, Parent Meetings |
| **Non-Teaching Staff** | Medical Supplies, Transport Routes, Gate Log, Visitor Log, Maintenance Tasks |
| **Administration** | Admissions, Correspondence, Appointments, Compliance Documents, Board Meetings |
| **Guardians** | Guardian Records, Guardian-Student Links, Parent Portal |
| **Notifications** | Configurable notification rules with in-app delivery |
| **Reports** | Dashboard stats, CSV export, multi-sheet reports, analytics snapshots |
| **Import/Export** | Bulk student import (CSV/Excel), OCR document scanning, CSV export on every module |
| **AI Assistant** | Natural language queries, report generation |
| **Billing** | Subscription management with Paystack integration |
| **Developer Admin** | Feature flags, release management, school metadata, system health |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                     │
│  • 46 dashboard pages                                    │
│  • 15 reusable components                                │
│  • Generic EAV renderer (renders any module dynamically) │
│  • Responsive design with Tailwind CSS                   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│               Authentication (Clerk)                     │
│  • JWT-based with org_id claims                          │
│  • Role hierarchy: Teacher → Principal → Superadmin       │
│  • Multi-factor authentication support                   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 Backend (Convex)                          │
│  • 90 backend modules                                    │
│  • 250+ exported queries/mutations/actions                │
│  • 80 database tables                                    │
│  • Server-side auth & tenant isolation                   │
│  • Real-time subscriptions                               │
│  • Rate limiting on critical mutations                   │
│  • Audit logging on all write operations                 │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Desktop App (Tauri v2)                       │
│  • Native Windows/macOS/Linux builds                     │
│  • Auto-update mechanism                                 │
│  • Clerk authentication integration                      │
└─────────────────────────────────────────────────────────┘
```

### EAV Data Model

Instead of hardcoding columns for every school's unique needs, SchoolMNG uses an Entity-Attribute-Value pattern:

```
modules → sections → fields → fieldValues
   │          │         │          │
   │          │         │          └─ Actual data (key-value pairs)
   │          │         └─ What data to collect (text, number, date, dropdown, etc.)
   │          └─ Logical groupings within a module
   └─ Top-level feature groupings (Academics, Health, Finance, etc.)
```

This means schools can:
- Toggle modules on/off
- Rename labels to their convention
- Add custom fields anywhere in the tree
- All without code changes or database migrations

### Multi-Tenancy

Every piece of data is scoped to a school via `schoolId`. The system enforces tenant isolation at the server level:

- `requireSchoolMembership()` — verifies JWT org_id matches the school
- `requireStudentMembership()` — verifies student belongs to the caller's school
- All queries filter by `schoolId` using indexed lookups
- No cross-school data leakage possible

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS 4 | Web application |
| **Backend** | Convex | Serverless database, functions, real-time sync |
| **Auth** | Clerk | Authentication, multi-tenancy, user management |
| **Payments** | Paystack | Subscription billing (card payments) |
| **Desktop** | Tauri v2 | Native desktop application |
| **OCR** | Tesseract.js | Document scanning and text extraction |
| **Fuzzy Matching** | Fuse.js | Smart column matching for imports |
| **Math** | Math.js | Deterministic calculation engine |
| **PDF** | PDF-lib | Report cards, receipts, class lists |
| **Charts** | Recharts | Data visualization |
| **CSV** | PapaParse | Spreadsheet import/export |

---

## Getting Started

### Prerequisites

- **Node.js** 18+ (recommended: 20 LTS)
- **npm** 9+
- **Git**
- A [Convex](https://convex.dev) account (free tier works)
- A [Clerk](https://clerk.com) account (free tier works)
- A [Paystack](https://paystack.com) account (for billing, optional)

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd SchoolMNG
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env.local` file in the project root:

```env
# Convex
CONVEX_DEPLOYMENT=<your-convex-deployment>
NEXT_PUBLIC_CONVEX_URL=<your-convex-url>

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<your-publishable-key>
CLERK_SECRET_KEY=<your-secret-key>
CLERK_WEBHOOK_SECRET=<your-webhook-secret>

# Paystack (optional)
PAYSTACK_SECRET_KEY=<your-paystack-secret>
PAYSTACK_PUBLIC_KEY=<your-paystack-public-key>
```

### 4. Initialize Convex

```bash
npx convex dev --once
```

This provisions a local anonymous deployment, pushes the schema, and generates types.

### 5. Start Development

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

### 6. Set Up Clerk

1. Create a Clerk application at [dashboard.clerk.com](https://dashboard.clerk.com)
2. Enable Organizations (for multi-tenancy)
3. Copy the API keys to `.env.local`
4. Set up a webhook endpoint pointing to `https://<your-convex-url>/api/clerk/webhook`

### 7. Desktop App (Optional)

```bash
npm run tauri:dev
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js development server |
| `npm run build` | Build for production (includes Convex codegen) |
| `npm run build:static` | Build static export |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run tauri:dev` | Start Tauri desktop app in dev mode |
| `npm run tauri:build` | Build desktop app for distribution |

---

## Project Structure

```
SchoolMNG/
├── convex/                    # Backend (Convex functions)
│   ├── _generated/           # Auto-generated types and API
│   ├── lib/                  # Shared utilities (logger)
│   ├── schema.ts             # Database schema (80 tables)
│   ├── helpers.ts            # Auth & validation helpers
│   ├── students.ts           # Student CRUD + search
│   ├── classes.ts            # Class management
│   ├── fees.ts               # Fee structures & payments
│   ├── borrowings.ts         # Library borrowings
│   ├── health.ts             # Health records & clinic visits
│   ├── discipline.ts         # Discipline incidents
│   ├── teachers.ts           # Teacher management
│   ├── attendance.ts         # Student attendance
│   ├── exams.ts              # Exams & results
│   ├── timetable.ts          # Class timetable
│   ├── guardians.ts          # Guardian records
│   ├── notifications.ts      # Notification system
│   ├── billing.ts            # Subscription management
│   ├── calcEngine.ts         # Deterministic math primitives
│   ├── ocr.ts                # OCR document processing
│   ├── pdfGenerator.ts       # PDF report generation
│   ├── bulkOperations.ts     # Batch operations
│   ├── exportData.ts         # CSV export queries
│   ├── onboarding.ts         # Setup wizard sessions
│   ├── rateLimit.ts          # Server-side rate limiting
│   ├── platformAudit.ts      # Platform audit logging
│   └── ... (90 files total)
│
├── src/
│   ├── app/                   # Next.js App Router pages
│   │   ├── admin/            # Superadmin dashboard
│   │   ├── dashboard/        # School dashboard (46 pages)
│   │   │   ├── page.tsx      # Home dashboard
│   │   │   ├── students/     # Student management
│   │   │   ├── classes/      # Class management
│   │   │   ├── fees/         # Fee management
│   │   │   ├── exams/        # Exam management
│   │   │   ├── attendance/   # Attendance tracking
│   │   │   ├── books/        # Library management
│   │   │   ├── teachers/     # Teacher management
│   │   │   ├── reports/      # Reports & analytics
│   │   │   ├── settings/     # School settings
│   │   │   ├── health/       # Health records
│   │   │   ├── discipline/   # Discipline tracking
│   │   │   ├── guardians/    # Guardian management
│   │   │   ├── bulk-operations/ # Batch operations
│   │   │   └── ... (46 pages)
│   │   ├── dev-admin/        # Developer admin dashboard
│   │   └── onboarding/       # Setup wizard
│   │
│   ├── components/           # React components
│   │   ├── ui/               # Base UI (Button, Card, Modal, etc.)
│   │   ├── generic/          # EAV renderer components
│   │   │   ├── FieldRenderer.tsx
│   │   │   ├── SectionRenderer.tsx
│   │   │   ├── ModuleRenderer.tsx
│   │   │   ├── RecordList.tsx
│   │   │   ├── RecordDetail.tsx
│   │   │   └── PermissionGate.tsx
│   │   ├── import-studio.tsx # Spreadsheet import wizard
│   │   ├── document-scanner.tsx # OCR document scanning
│   │   ├── student-profile-view.tsx # Student 360 view
│   │   ├── dashboard-layout.tsx # Sidebar navigation
│   │   └── ... (15 components)
│   │
│   └── lib/                  # Client utilities
│       ├── csv-export.ts     # CSV generation
│       ├── rate-limit.ts     # Client-side rate limiting
│       ├── use-school.ts     # School context hook
│       ├── use-role.ts       # Role context hook
│       └── utils.ts          # General utilities
│
├── docs/                      # Documentation
│   ├── IMPLEMENTATION-PLAN.md
│   ├── SECURITY-AUDIT.md
│   └── ... (19 doc files)
│
├── scripts/                   # Build & utility scripts
├── src-tauri/                 # Tauri desktop app config
└── public/                    # Static assets
```

---

## Security

SchoolMNG implements defense-in-depth security:

| Layer | Implementation |
|-------|---------------|
| **Authentication** | Clerk JWT with org_id claims |
| **Authorization** | Server-side role checks (Teacher/Principal/Superadmin) |
| **Tenant Isolation** | Every query/mutation verifies schoolId matches JWT |
| **Input Validation** | Convex validators on all function arguments |
| **Rate Limiting** | Server-side sliding window on critical mutations |
| **Audit Logging** | All write operations logged to report_logs table |
| **Webhook Security** | Shared-secret validation for Clerk & Paystack |

See [docs/SECURITY-AUDIT.md](docs/SECURITY-AUDIT.md) for the full security analysis.

---

## Deployment

### Web Application

```bash
# Build and deploy to Convex + Vercel/Netlify
npm run build
```

### Desktop Application

```bash
# Build for current platform
npm run tauri:build

# Output: src-tauri/target/release/bundle/
```

### Convex Backend

```bash
# Deploy to production
npx convex deploy
```

---

## Contributing

1. Read `DEVELOPMENT_PROCESS.md` for architecture guidelines
2. Read `convex/_generated/ai/guidelines.md` for Convex patterns
3. Run `npx tsc --noEmit` before committing (pre-commit hook enforces this)
4. Follow the existing code patterns (one file per domain entity)
5. Add audit logging to any new mutation

---

## Documentation

| Document | Description |
|----------|-------------|
| [DEVELOPMENT_PROCESS.md](DEVELOPMENT_PROCESS.md) | Architecture overview, setup, release process |
| [docs/SECURITY-AUDIT.md](docs/SECURITY-AUDIT.md) | Security analysis and hardening guide |
| [docs/IMPLEMENTATION-PLAN.md](docs/IMPLEMENTATION-PLAN.md) | Phase-by-phase implementation plan |
| [docs/PUSH-CHECKLIST.md](docs/PUSH-CHECKLIST.md) | Pre-deployment verification checklist |
| [HANDOFF.md](HANDOFF.md) | Session handoff notes |
| [docs/00-architecture.md](docs/00-architecture.md) | Master architecture specification |

---

## License

This is private software. All rights reserved.

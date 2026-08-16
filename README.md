# SchoolMNG — School Management Platform

<p align="center">
  <strong>Enterprise-grade, fully configurable school management platform built on Convex + Next.js</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.2.1-blue" alt="Version" />
  <img src="https://img.shields.io/badge/license-proprietary-red" alt="License" />
  <img src="https://img.shields.io/badge/Convex-1.44-green" alt="Convex" />
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js" />
</p>

---

## Overview

SchoolMNG is a **configurable** school management platform designed for schools of all sizes — from small primary schools to large multi-campus institutions. Unlike rigid off-the-shelf solutions, SchoolMNG lets each school **build its own data structure** from scratch using a generic Entity-Attribute-Value (EAV) engine, while still providing sensible defaults for quick setup.

**Key Design Philosophy:** Nothing about a school's data is hardcoded. Every school creates its own modules, sections, and fields. The platform provides the engine; the school defines what it manages.

---

## Features

### Core Modules (Configurable)

| Module | Description |
|---|---|
| **Student Records** | Learner profiles, enrollment lifecycle, promotion/progression |
| **Staff Records** | Teacher/staff profiles, subject assignments, 360° views |
| **Attendance** | Daily + period-based attendance, absence logs, summaries |
| **Academics** | Classes, streams, subjects, timetables, exam results |
| **Finance** | Fee structures, payments, collections, expenditures, budgets |
| **Health/Clinic** | Health records, clinic visits, vaccinations, counseling |
| **Library** | Book catalog, borrowing, holds, overdue tracking |
| **Discipline** | Incident reports, status tracking, student history |
| **HR & Performance** | Leave management, appraisals, staff attendance |
| **Payroll** | Salary management, payroll runs |
| **Transport** | Route management, vehicle logs, maintenance |
| **Boarding** | Boarding records, welfare checks, leave requests |
| **Feeding** | Meal plans, feeding records |
| **Facilities** | Maintenance requests, asset tracking |
| **Events** | School events, calendar, RSVPs |
| **Communication** | Announcements, broadcasts, notifications |
| **Documents** | Template-based PDF generation (report cards, receipts, certificates) |
| **Admissions** | Application intake, status workflow, statistics |

### Platform Features

- **Generic EAV Engine** — Build custom modules/sections/fields via Settings → Data Structure
- **Role-Based Access Control** — Configurable roles with module/section/field-level permissions
- **Tiered Subscription** — 6-tier system (Free → Enterprise) with auto-evaluation
- **AI Assistant** — Permission-filtered AI chat with school context awareness
- **Global Search** — Full-text search across students, staff, and custom EAV fields
- **Import/Export** — CSV/Excel/Word import with AI-assisted field mapping
- **Chart Customization** — Toggle chart visibility per page via Settings
- **Document Generation** — Template-based PDF engine using pdf-lib
- **Multi-Campus Support** — Per-school campus configuration
- **Recursive Terms** — Year → Semester → Term → Week → Day, any depth
- **Enrollment Lifecycle** — Active/graduated/withdrawn/suspended per term
- **Generic Entity Links** — Free-form relationships between any two entities

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16, React 19, TypeScript 5.7, Tailwind CSS 4 |
| **Backend** | Convex 1.44 (real-time serverless platform) |
| **Database** | Convex (transactional, real-time, with search indexes) |
| **Authentication** | Clerk (JWT-based, org-scoped) |
| **AI** | Mistral AI (agent with RAG-like school context) |
| **Payments** | Paystack (subscription billing) |
| **PDF Generation** | pdf-lib (template-based document generation) |
| **Charts** | Chart.js + react-chartjs-2 |
| **Search** | Convex full-text search indexes + Fuse.js client-side |
| **Monitoring** | Sentry (error tracking + performance) |
| **Desktop** | Tauri 2 (optional desktop app wrapper) |
| **Testing** | Vitest + convex-test |
| **Webhooks** | Svix (Clerk webhook verification) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Dashboard │  │ Onboard  │  │ Settings │  │ Admin  │ │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └───┬────┘ │
│        │              │              │            │      │
│  ┌─────┴──────────────┴──────────────┴────────────┴────┐│
│  │          EavRouteWrapper (auto EAV/hardcoded)       ││
│  └─────────────────────┬───────────────────────────────┘│
│                        │                                │
│  ┌─────────────────────┴───────────────────────────────┐│
│  │    Generic EAV Components (ModuleRenderer,          ││
│  │    RecordList, RecordDetail, FieldRenderer)         ││
│  └─────────────────────┬───────────────────────────────┘│
└────────────────────────┼────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │    Convex Client     │
              │   (real-time sync)   │
              └──────────┬──────────┘
                         │
┌────────────────────────┼────────────────────────────────┐
│                    Convex Backend                         │
│  ┌─────────────────────┴───────────────────────────────┐│
│  │              AccessResolver (fail-closed)            ││
│  │    ┌──────────┐  ┌──────────┐  ┌──────────────┐    ││
│  │    │ Permissions│  │  Scope   │  │  Leadership   │    ││
│  │    │  Engine   │  │  Rules   │  │   Bypass     │    ││
│  │    └──────────┘  └──────────┘  └──────────────┘    ││
│  └─────────────────────┬───────────────────────────────┘│
│                        │                                │
│  ┌─────────────────────┴───────────────────────────────┐│
│  │              EAV Engine (records/fieldValues)        ││
│  │    modules → sections → fields → fieldValues        ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │  Typed Core Tables (~90 tables for specific domains)││
│  │  students, teachers, classes, fees, attendance, ...  ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### Dual-Mode Rendering

Every dashboard page uses **EavRouteWrapper** which automatically detects whether a module has EAV structure configured:

- **Has sections** → Renders via generic EAV components (ModuleRenderer + RecordList)
- **No sections** → Renders the original hardcoded typed-table page

Schools migrate from hardcoded to EAV at their own pace by building structure in Settings → Data Structure.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ (20+ recommended)
- [Convex CLI](https://docs.convex.dev/cli/installation): `npm install -g convex`
- [Clerk](https://clerk.com/) account (for authentication)
- [Paystack](https://paystack.com/) account (for payments, optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/levarlux/SchoolMNG.git
cd SchoolMNG

# Install dependencies
npm install

# Start Convex backend (creates a new deployment)
npx convex dev

# In a second terminal, start the Next.js frontend
npm run dev
```

### Environment Setup

Create a `.env.local` file in the project root:

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Convex
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# Convex Auth
CONVEX_AUTH_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

# Paystack (optional)
PAYSTACK_SECRET_KEY=sk_test_...
PAYSTACK_PUBLIC_KEY=pk_test_...

# Mistral AI (optional)
MISTRAL_API_KEY=...
MISTRAL_AGENT_ID=...

# Sentry (optional)
SENTRY_DSN=https://...

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### First-Time Setup

1. Open `http://localhost:3000`
2. Sign in with Clerk (create an account or use an existing one)
3. The onboarding wizard guides you through:
   - **Step 1:** School details (name, slug, logo, colors)
   - **Step 2:** School type + headcount + modules to enable
   - **Step 3:** Admin/leadership setup
   - **Step 4:** Import data (optional)
   - **Step 5:** Review + launch
4. After onboarding, build your structure in **Settings → Data Structure**

---

## Project Structure

```
SchoolMNG/
├── convex/                    # Convex backend (serverless functions)
│   ├── _generated/            # Auto-generated types + API
│   ├── __tests__/             # Integration tests
│   ├── accessResolver.ts      # Fail-closed permission enforcement
│   ├── aiAssistant.ts         # AI chat with school context
│   ├── calcEngine.ts          # Finance calculation engine
│   ├── chartConfigs.ts        # Chart visibility configuration
│   ├── classAssignments.ts    # Student ↔ Class placement
│   ├── crons.ts               # Scheduled jobs (tier re-evaluation)
│   ├── docTemplates.ts        # Document template CRUD
│   ├── enrollments.ts         # Learner enrollment lifecycle
│   ├── entityLinks.ts         # Generic entity relationships
│   ├── expenses.ts            # Expenditure tracking
│   ├── fields.ts              # EAV field CRUD
│   ├── fieldValues.ts         # EAV field value CRUD
│   ├── financeConfig.ts       # EAV ↔ finance field mapping
│   ├── fees.ts                # Fee structures + payments
│   ├── globalSearch.ts        # Full-text search across entities
│   ├── helpers.ts             # Auth helpers, requireSchoolMembership, etc.
│   ├── modules.ts             # EAV module CRUD
│   ├── nav.ts                 # Sidebar navigation tree
│   ├── onboarding.ts          # School provisioning + onboarding
│   ├── permissions.ts         # Permission engine (RBAC)
│   ├── records.ts             # EAV record CRUD
│   ├── roles.ts               # Role management + leadership
│   ├── schema.ts              # Database schema (~90 tables)
│   ├── sections.ts            # EAV section CRUD
│   ├── seedFullTree.ts        # Legacy full EAV tree seeder
│   ├── students.ts            # Student typed-core CRUD
│   ├── subjects.ts            # Subject management
│   ├── teachers.ts            # Teacher management + relationships
│   ├── templateRenderer.ts    # PDF generation engine
│   ├── terms.ts               # Recursive term management
│   ├── tierAssignment.ts      # Subscription tier scoring
│   └── ...                    # 40+ more domain modules
├── src/
│   ├── app/
│   │   ├── admin/             # Platform admin pages
│   │   ├── dashboard/         # Main app pages (27+ modules)
│   │   │   ├── analytics/     # Charts + analytics
│   │   │   ├── attendance/    # Attendance tracking
│   │   │   ├── classes/       # Class management
│   │   │   ├── documents/     # Document generation
│   │   │   ├── exams/         # Exam management
│   │   │   ├── fees/          # Fee management
│   │   │   ├── health/        # Health records
│   │   │   ├── records/       # Generic EAV records page
│   │   │   ├── settings/      # School settings
│   │   │   ├── students/      # Student management
│   │   │   ├── teachers/      # Staff management
│   │   │   └── terms/         # Term management
│   │   ├── onboarding/        # School setup wizard
│   │   └── page.tsx           # Landing page
│   ├── components/
│   │   ├── generic/           # EAV renderers (ModuleRenderer, RecordList, etc.)
│   │   ├── settings/          # Settings panels (structure builder, finance config)
│   │   ├── ui/                # Shared UI components (shadcn/ui)
│   │   ├── document-generator.tsx
│   │   ├── teacher-profile-view.tsx
│   │   └── ...
│   └── lib/
│       ├── use-eav-module.ts  # Hook for EAV module detection
│       ├── use-school.ts      # School context hook
│       └── ...
├── audit/                     # Spec compliance audit
├── docs/                      # Documentation
├── scripts/                   # Build + utility scripts
├── public/                    # Static assets
├── src-tauri/                 # Tauri desktop wrapper
└── CHANGELOG.md               # Release notes
```

---

## Development

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npx convex dev` | Start Convex backend (requires separate terminal) |
| `npm run build` | Production build (codegen + deploy + next build) |
| `npm run build:static` | Static export build |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest tests |
| `npx convex run <fn>` | Run a Convex function |
| `npx tauri dev` | Start desktop app (Tauri) |
| `npx tauri build` | Build desktop app |

### Running the Test Suite

```bash
# Run all tests
npm test

# Run EAV migration smoke test against live deployment
npx convex run __tests__/eavMigrationTest:runTest
```

### EAV Migration Test Coverage

The test suite verifies the full EAV migration pipeline:

| Test | Scenario | Expected |
|---|---|---|
| TEST 1 | Module has sections | EAV route (`/dashboard/records?moduleId=...`) |
| TEST 2 | Create additional section | Still EAV route |
| TEST 3 | Disable all sections | Hardcoded route (`/dashboard/students`) |
| TEST 4 | Re-enable sections | Back to EAV route |
| TEST 5 | Create field in section | EAV route still works |
| TEST 6 | Cleanup test data | Original state restored |
| TEST 7 | Module without sections | Hardcoded route |

---

## Database Schema

SchoolMNG uses a **dual schema** approach:

### EAV Engine (Generic)

| Table | Purpose |
|---|---|
| `modules` | Top-level grouping (e.g., "Academics", "Library") |
| `sections` | Divide modules into logical groups (recursive) |
| `fields` | Individual data points with input types + validation |
| `records` | Entity instances (students, staff, or custom) |
| `fieldValues` | Actual field values for records (EAV storage) |
| `entityLinks` | Free-form relationships between any two entities |

### Typed Core (~90 tables)

Domain-specific tables for features that need typed queries:

- `students`, `teachers`, `classes`, `streams`, `subjects`
- `terms`, `academicYears`, `exams`, `examResults`
- `feeStructures`, `feePayments`, `attendance`
- `healthRecords`, `books`, `borrowings`
- `discipline`, `events`, `inventory`
- `payroll`, `expenditures`, `budgets`
- `docTemplates`, `chartConfigs`, `feeConfig`
- And 50+ more...

---

## Deployment

### Convex Backend

```bash
# Deploy to production
npx convex deploy

# Run a specific function
npx convex run <module>:<function>
```

### Next.js Frontend

```bash
# Build for production
npm run build

# Or deploy to Vercel
npx vercel
```

### Desktop App (Tauri)

```bash
# Build for current platform
npm run tauri:build

# Output: src-tauri/target/release/bundle/
```

---

## Subscription Tiers

| Tier | Signals | Features |
|---|---|---|
| **Free** | < 50 students, < 3 modules | Basic features, 1 admin |
| **Starter** | 50–200 students | Core modules, basic analytics |
| **Growth** | 200–500 students | All modules, import/export, AI assistant |
| **Professional** | 500–1000 students | Multi-campus, advanced analytics, custom docs |
| **Enterprise** | 1000+ students | Full feature set, priority support |
| **Campus** | Multi-campus | All Enterprise + campus management |

Tiers are automatically evaluated monthly via a Convex cron job based on 7 signals: headcount, modules, facilities, fees, boarding, campuses, and establishment year.

---

## Security

- **JWT Authentication** — Clerk-issued JWTs with `org_id` scope
- **Fail-Closed Permissions** — `AccessResolver` denies by default; zero permissions = zero access
- **Tenant Isolation** — Every query/mutation validates school membership via JWT
- **Scope Rules** — Bucket-level visibility (a teacher sees only their class's students)
- **Leadership Bypass** — Per-school configurable leadership role with full access
- **Webhook Verification** — Svix signature verification for Clerk webhooks
- **Secret Scanning** — GitHub push protection for API keys

---

## API Reference

### Convex Functions (Selected)

| Module | Function | Description |
|---|---|---|
| `nav` | `getNavTree` | Sidebar navigation (EAV-aware routing) |
| `modules` | `listBySchool` | List all modules for a school |
| `sections` | `listByModule` | List sections for a module |
| `fields` | `listBySection` | List fields for a section |
| `records` | `listBySchoolAndBucket` | List EAV records (permission-filtered) |
| `records` | `searchByName` | Full-text search across records |
| `fieldValues` | `getValuesForRecord` | Get all field values for a record |
| `enrollments` | `enroll` | Enroll a student in a term |
| `terms` | `listChildren` | List child periods (recursive) |
| `entityLinks` | `create` | Create a generic relationship |
| `docTemplates` | `list` | List document templates |
| `templateRenderer` | `renderTemplate` | Generate PDF from template |
| `fees` | `getTermSummary` | Fee summary for a term |
| `permissions` | `checkAccess` | Check module/section/field access |
| `globalSearch` | `searchAll` | Global search across all entities |
| `aiAssistant` | `chat` | AI chat with school context |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Convention

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `refactor:` — Code refactoring
- `test:` — Tests
- `chore:` — Maintenance

---

## License

This project is proprietary software. All rights reserved.

---

## Support

- **Documentation:** [docs/](./docs/)
- **Issues:** [GitHub Issues](https://github.com/levarlux/SchoolMNG/issues)
- **Dashboard:** [Convex Dashboard](https://dashboard.convex.dev)

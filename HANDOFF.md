# Handoff — Member Invitations & Multi-Tenancy (v0.2.0)

**Date:** 2026-07-19
**Status:** Code deployed to prod Convex, `v0.2.0-preview.1` published as GitHub prerelease with all artifacts. Pending: install preview build, dual-role manual test pass, then promote to stable.

---

## What We Built

A self-service invitation system: principals invite teachers by email, teachers accept, a Convex `members` row is created automatically via Clerk webhook, and role-based sidebar/rendering restricts what each role can see.

### The Flow (End to End)

```
Principal fills email + role in members page
  → convex/invitations.ts sendInvitation action
  → Clerk Backend API: POST /organizations/{orgId}/invitations (with public_metadata: { appRole: "teacher" })
  → Clerk sends invitation email
  → Teacher clicks link, accepts, creates Clerk user account
  → Clerk fires organizationMembership.created webhook
  → convex/http.ts receives POST /api/webhooks/clerk
  → convex/clerkWebhook.ts verifies svix signature, extracts fields from evt.data
  → convex/webhooks.ts handleMembershipEvent creates row in members table
  → Teacher signs in, useRole() reads members table, gets role: "teacher"
  → dashboard-layout.tsx renders restricted sidebar for teachers
```

---

## What We Fixed

### Bug 1: Webhook URL (Clerk Dashboard config, not code)

Clerk Dashboard had the webhook endpoint pointing at the **wrong URL** on two axes:
- Wrong deployment: `hip-crab-756` (dev) instead of `polite-fly-292` (prod)
- Wrong domain: `.convex.cloud` instead of `.convex.site` (HTTP actions are served from `.site`)

**Fix:** Updated the URL in Clerk Dashboard to `https://polite-fly-292.convex.site/api/webhooks/clerk` and re-enabled the endpoint.

### Bug 2: Webhook payload field mismatch (code bug)

`convex/clerkWebhook.ts:60` accessed `data.user.id` — but Clerk's `organizationMembership.created` event has **no `user` field**. The user info lives in `data.public_user_data`, and the ID is `user_id` (snake_case), not `id`.

This threw `TypeError: Cannot read properties of undefined (reading 'id')` on every membership webhook, which Svix reported as "verification failed" (misleading — verification passed, the error was inside the handler).

**Fix in `convex/clerkWebhook.ts`:**
- `data.user.id` → `data.public_user_data.user_id`
- `data.user.email_addresses` → `data.public_user_data.email_addresses` with fallback to `data.public_user_data.identifier` (Clerk may use either shape)

### Bug 3: CI — bundler disabled in tauri.conf.json

`src-tauri/tauri.conf.json` had `"bundle": { "active": false }`, which completely disabled the Tauri bundler. The Rust compilation succeeded (producing the `.exe`), but no MSI/NSIS installers were ever created. Tauri-action then looked for those installer files and found nothing → `No artifacts were found`.

**Fix:** `"active": false` → `"active": true`, and `"createUpdaterArtifacts": false` → `"createUpdaterArtifacts": true` (needed for `.sig` files used by the updater).

### Bug 4: CI — tauri-action@v0 artifact discovery

The workflow used `tauri-apps/tauri-action@v0`, which has a known artifact discovery bug on Windows. Updated to `@v1`.

### Bug 5: CI — version mismatch in config files

All three version files (`package.json`, `Cargo.toml`, `tauri.conf.json`) were still at `0.1.4` when the tag was `v0.2.0`. Tauri-action looks for artifacts matching the tag version but the build produced `SchoolMNG_0.1.4_*` files.

**Fix:** Bumped all three files to `0.2.0`.

### Bug 6: Updater can't reach GitHub API for private repos

The app's `fetch_latest_prerelease_url()` calls `https://api.github.com/repos/levarlux/SchoolMNG/releases` without authentication. GitHub returns 404 for unauthenticated requests to private repos. The function fails silently (falls back to stable endpoint), which also fails → no update prompt.

**Fix:** Made the GitHub repo public. The updater now works, but is subject to GitHub's unauthenticated rate limit (60 requests/hour per IP). Heavy testing can exhaust this, causing silent failure.

**Long-term fix (TODO):** Host `latest.json` on the Convex site (`https://polite-fly-292.convex.site/latest.json`) instead of relying on GitHub releases. This removes the GitHub API dependency entirely.

### Added: Permanent diagnostic log

`convex/clerkWebhook.ts` now logs one line per webhook receipt:
```
[webhook] organizationMembership.created — org: org_xxx, user: user_xxx
```
Cosmetic note: for non-membership events (session.created, etc.), the `org:` and `user:` labels are misleading — the generic log puts the resource ID in the `org` slot. Low priority, not worth fixing during release.

---

## Files Changed (Key Ones)

| File | What Changed |
|---|---|
| `convex/clerkWebhook.ts` | Fixed field paths (`public_user_data.user_id`), added email fallback, added diagnostic log |
| `convex/webhooks.ts` | Added `handleOrganizationEvent` and `handleMembershipEvent` mutations (new) |
| `convex/invitations.ts` | New file — `sendInvitation` action calls Clerk org invitations API |
| `convex/members.ts` | Added `addFromWebhook` internal mutation |
| `convex/clerk.ts` | Added `sendClerkOrgInvitation` helper |
| `src/app/dashboard/members/page.tsx` | Invitation UI for principals |
| `src/components/dashboard-layout.tsx` | Role-based sidebar rendering (fail-closed) |
| `src/lib/use-role.ts` | Role hook — reads from Convex `members` table |
| `src-tauri/tauri.conf.json` | Enabled bundler (`active: true`), enabled updater artifacts |
| `src-tauri/src/lib.rs` | Preview channel default: debug builds → preview, release builds → stable |
| `.github/workflows/release.yml` | Upgraded tauri-action to v1, added `NEXT_PUBLIC_CLERK_PROXY_URL` to env |
| `DEVELOPMENT_PROCESS.md` | Added gotchas #8–#10, Section 7b (webhook debugging checklist), updated versioning rules |

---

## Known Limitations / Future Work

### Updater depends on GitHub API (rate-limited)

The prerelease auto-discovery (`fetch_latest_prerelease_url()`) calls the GitHub API unauthenticated. This is rate-limited to 60 requests/hour per IP. During heavy testing, this limit can be exhausted, causing the updater to silently fall back to the stable endpoint (which finds no update).

**Workaround for now:** Install releases manually from GitHub. The rate limit resets hourly.

**Proper fix:** Host `latest.json` on the Convex site so the updater doesn't depend on the GitHub API at all. The stable endpoint (`/releases/latest/download/latest.json`) also depends on the repo being public.

### Clerk `publicMetadata` is never set on the user object

The invitation API's `public_metadata` is set on the **membership invitation**, not on the **user**. When the invitee accepts and a Clerk user is created, Clerk does not copy that metadata onto the user — `user.publicMetadata` stays `{}`.

**Current workaround:** `use-role.ts` falls back to a Convex query on the `members` table (line 44), which works correctly. The Clerk metadata fast-path (line 27, reads `user.publicMetadata.schoolRole`) never resolves and is dead code for invited users.

**If you need user-level metadata in the future:** In `convex/webhooks.ts` `handleMembershipEvent`, after creating the member row, call `PATCH /users/{userId}` via the Clerk Backend API to set `publicMetadata`. There is also a field name mismatch to fix: the invitation sets `appRole`, but `use-role.ts` reads `schoolRole`.

### No `user.created` webhook handler

If you ever need to run logic when a new Clerk user is created (not just when they join an org), you'll need to register the `user.created` event in Clerk Dashboard and add a handler in `clerkWebhook.ts`.

---

## CI / Release Pipeline

### How the updater works

- **Stable channel (default):** App checks `https://github.com/levarlux/SchoolMNG/releases/latest/download/latest.json` on launch. If a newer version exists, prompts user to install. **Requires repo to be public.**
- **Preview channel:** If the machine has `{"preview": true}` in `%APPDATA%\schoolmng\updater.json`, the app calls the GitHub API to find the latest prerelease, fetches its `latest.json`, and prompts if newer. Falls back to stable if the API call fails.
- **Dev builds default to preview** (`cfg!(debug_assertions)` in `src-tauri/src/lib.rs`). Release builds default to stable. Zero config needed.
- The update check runs **once on launch** — no background polling. If the app is already open when a new release publishes, the user must close and reopen to see the update prompt.
- **Rate limit caveat:** Unauthenticated GitHub API calls are limited to 60/hour per IP. Heavy testing can exhaust this, causing silent updater failure.

### Versioning scheme

| Type | Pattern | Example |
|---|---|---|
| Patch (bug fixes) | `0.1.x` → `0.1.x+1` | `0.1.4` → `0.1.5` |
| Feature (new feature) | `0.x.0` → `0.x+1.0` | `0.1.5` → `0.2.0` |

Once you bump to `0.2.0` for a feature, the next patch is `0.2.1`, not `0.1.4`. You never go backwards. Major version (`1.0.0`) is reserved for a deliberate future milestone.

### Required GitHub Secrets

These must exist in GitHub repo → Settings → Secrets → Actions:

| Secret | Value | Used by |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_...` | Next.js + Rust build |
| `NEXT_PUBLIC_CONVEX_URL` | `https://polite-fly-292.convex.cloud` | Next.js build |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `https://polite-fly-292.convex.site` | Next.js build |
| `NEXT_PUBLIC_CLERK_PROXY_URL` | `https://polite-fly-292.convex.site/__clerk` | Rust build (build.rs) |
| `NEXT_PUBLIC_APP_URL` | App URL | Next.js build |
| `CLERK_SECRET_KEY` | `sk_live_...` | Rust build |
| `CLERK_WEBHOOK_SECRET` | `whsec_...` | Rust build |
| `CLERK_FRONTEND_API_URL` | Clerk frontend API URL | Rust build |
| `CONVEX_DEPLOYMENT` | `prod:polite-fly-292` | Rust build |
| `CONVEX_CLERK_ISSUER_URL` | Convex Clerk issuer URL | Rust build |
| `CONVEX_DEPLOY_KEY` | `prod:polite-fly-292\|...` | Rust build |
| `SENTRY_AUTH_TOKEN` | `sntrys_...` | Rust build |
| `TAURI_SIGNING_PRIVATE_KEY` | Minisign private key | Tauri signing |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for signing key (empty string if none) | Tauri signing |

### CI Gotchas (Lessons Learned)

1. **`.env.production` and `.env.local` don't exist in CI** — they're gitignored. The build falls back to process env vars set by the tauri-action env block. Every `NEXT_PUBLIC_*` and other required var must be in that env block AND exist as a GitHub secret.
2. **`bundle.active: false` in tauri.conf.json silently disables all installers** — the Rust compilation succeeds but no MSI/NSIS files are produced, causing `tauri-action` to fail with "No artifacts were found."
3. **Version in `package.json`, `Cargo.toml`, and `tauri.conf.json` must match the git tag** — tauri-action looks for artifacts with the version from the tag, not from the config files.
4. **Before tagging a release, cross-reference every secret in `release.yml` against GitHub repo settings** — GitHub Actions silently substitutes empty strings for missing secrets rather than failing the workflow.
5. **The GitHub repo must be public for the updater to work** — the app's update check calls the GitHub API and download endpoints without authentication. Private repos return 404/403 for unauthenticated requests.
6. **Unauthenticated GitHub API rate limit is 60 requests/hour per IP** — heavy testing (multiple app launches, API calls from different tools) can exhaust this, causing the prerelease updater to silently fail. Wait for the hourly reset or install manually.

---

## Deployment State

| What | Where | Status |
|---|---|---|
| Convex functions | `prod:polite-fly-292` | Deployed |
| Git | `main` branch, tag `v0.2.0-preview.1` | Pushed, CI build succeeded |
| GitHub release | `v0.2.0-preview.1` (prerelease) | Published with all artifacts |
| GitHub repo | Public | Required for updater |
| Clerk webhook endpoint | `https://polite-fly-292.convex.site/api/webhooks/clerk` | Enabled, events: org + membership |
| Tauri app | v0.1.3 installed, v0.2.0-preview.1 available | Manual install needed |

---

## What's Next (In Order)

1. **Install v0.2.0-preview.1 manually** from https://github.com/levarlux/SchoolMNG/releases/tag/v0.2.0-preview.1 (updater can't prompt for the first install)
2. **Dual-role manual test pass** — sign in as teacher, sign in as principal, click through every page, confirm visibility matches the role matrix, test invitation flow end-to-end
3. **Soak 3 calendar days** minimum
4. **Promote to stable** — delete `v0.2.0-preview.1` tag, tag `v0.2.0` (no hyphen → publishes as stable)
5. **Deploy to prod Convex** if any fixes came out of the test pass
6. **TODO: Host `latest.json` on Convex site** to remove GitHub API dependency from updater

---

## Key Docs

- `DEVELOPMENT_PROCESS.md` — architecture, env setup, release process, gotchas (includes webhook-specific traps and CI secrets checklist)
- `AGENTS.md` — Convex-specific AI guidelines
- Section 7b in DEVELOPMENT_PROCESS.md — webhook debugging checklist

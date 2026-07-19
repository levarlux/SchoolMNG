# Handoff — Member Invitations & Multi-Tenancy (v0.2.0)

**Date:** 2026-07-19
**Status:** Code deployed to prod Convex, v0.2.0 tagged on GitHub. Pending: dual-role manual test pass, then patch release cycle.

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
| `src/lib/use-role.ts` | Role hook — reads from Convex `members` table (Clerk metadata fast-path exists but user metadata is `{}` — see below) |
| `DEVELOPMENT_PROCESS.md` | Added gotchas #8–#10 and Section 7b (webhook debugging checklist) |

---

## Known Limitations / Future Work

### Clerk `publicMetadata` is never set on the user object

The invitation API's `public_metadata` is set on the **membership invitation**, not on the **user**. When the invitee accepts and a Clerk user is created, Clerk does not copy that metadata onto the user — `user.publicMetadata` stays `{}`.

**Current workaround:** `use-role.ts` falls back to a Convex query on the `members` table (line 44), which works correctly. The Clerk metadata fast-path (line 27, reads `user.publicMetadata.schoolRole`) never resolves and is dead code for invited users.

**If you need user-level metadata in the future:** In `convex/webhooks.ts` `handleMembershipEvent`, after creating the member row, call `PATCH /users/{userId}` via the Clerk Backend API to set `publicMetadata`. There is also a field name mismatch to fix: the invitation sets `appRole`, but `use-role.ts` reads `schoolRole`.

### No `user.created` webhook handler

If you ever need to run logic when a new Clerk user is created (not just when they join an org), you'll need to register the `user.created` event in Clerk Dashboard and add a handler in `clerkWebhook.ts`.

---

## Deployment State

| What | Where | Status |
|---|---|---|
| Convex functions | `prod:polite-fly-292` | Deployed (latest push) |
| Git | `main` branch, tag `v0.2.0` | Pushed |
| Clerk webhook endpoint | `https://polite-fly-292.convex.site/api/webhooks/clerk` | Enabled, events: org + membership |
| Tauri app | Not rebuilt yet | Pending dual-role test pass |

---

## What's Next (In Order)

1. **Dual-role manual test pass** — sign in as teacher, sign in as principal, click through every page, confirm visibility matches the role matrix
2. **Bump patch version** in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
3. **Publish as GitHub prerelease** (`gh release create --prerelease`)
4. **Install fresh, sanity check**
5. **Soak 3 calendar days**, then promote to stable
6. **Deploy to prod Convex** (already done for current code, but re-deploy if any fixes come out of the test pass)

---

## Key Docs

- `DEVELOPMENT_PROCESS.md` — architecture, env setup, release process, gotchas (now includes webhook-specific traps)
- `AGENTS.md` — Convex-specific AI guidelines
- Section 7b in DEVELOPMENT_PROCESS.md — webhook debugging checklist (new)

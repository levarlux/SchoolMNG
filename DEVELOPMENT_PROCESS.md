# Development Process

Single source of truth for how we build, test, and ship SchoolMNG. Read this before touching the codebase.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  Tauri v2 Desktop App (Rust + WebView)          │
│  src-tauri/                                     │
│  - tauri-plugin-clerk  v0.1.1                   │
│  - tauri-plugin-http   v2                       │
│  - build.rs loads .env via dotenvy              │
│  - option_env!() embeds keys at compile time    │
│  - ClerkPluginBuilder::proxy() routes fetch     │
│    through Rust HTTP client (no CORS)           │
├─────────────────────────────────────────────────┤
│  Next.js 16 (Static Export)                     │
│  output: "export" → out/ directory              │
│  No API routes — everything lives on Convex     │
│  clerk-provider-with-router.tsx                 │
│  - isTauri() detection (v2-safe)                │
│  - initClerk() patches globalThis.fetch         │
│  - standardBrowser: false (native mode)         │
├─────────────────────────────────────────────────┤
│  Convex Backend                                 │
│  Queries, Mutations, Actions, HTTP Router       │
│  convex/http.ts → Clerk proxy + webhooks        │
│  Two deployments:                               │
│    Dev:   hip-crab-756  (convex.cloud)          │
│    Prod:  polite-fly-292 (convex.cloud)         │
└─────────────────────────────────────────────────┘
```

### How Clerk Auth Works in Tauri

The flow that took us a full day to get right:

```
App starts
  → build.rs loads .env.production + .env.local via dotenvy
  → cargo:rustc-env embeds NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and
    NEXT_PUBLIC_CLERK_PROXY_URL into the Rust binary at compile time
  → option_env!() in lib.rs reads them
  → ClerkPluginBuilder registers with .proxy("https://polite-fly-292.convex.site/__clerk")
  → initClerk() in clerk-provider-with-router.tsx:
      1. Patches globalThis.fetch (applyGlobalPatches)
      2. Hooks __internal_onBeforeRequest → stamps x-tauri-fetch: 1 on all Clerk requests
      3. Calls Rust "initialize" command → Rust fetches /v1/client + /v1/environment
      4. Injects cached resources into ClerkJS (standardBrowser: false)
  → All subsequent requests: patched fetch → Rust HTTP → Convex proxy → Clerk API
  → convex/http.ts strips Origin, injects Clerk-Proxy-Url + Clerk-Secret-Key
  → Clerk accepts the request (origin is now polite-fly-292.convex.site)
```

### Two Convex Deployments

| Deployment | ID | URL | Purpose |
|---|---|---|---|
| Dev | `hip-crab-756` | `https://hip-crab-756.convex.cloud` | Local development, `npx convex dev` |
| Prod | `polite-fly-292` | `https://polite-fly-292.convex.cloud` | Production, `npx convex deploy --prod` |

The site URLs (for HTTP actions):
- Dev: `https://hip-crab-756.convex.site`
- Prod: `https://polite-fly-292.convex.site`

### Gotchas — Things We Learned the Hard Way

1. **`window.__TAURI__` does not exist in Tauri v2** unless `app.withGlobalTauri: true` is set. Use `isTauri()` from `@tauri-apps/api/core` instead. This was the root cause of Clerk never engaging — the detection check silently returned false.

2. **`option_env!()` in Rust reads the OS process environment at compile time.** `.env.local` and `.env.production` are Next.js files — they are NOT loaded into the process for `cargo build`. Fix: `build.rs` with `dotenvy` loads them and emits `cargo:rustc-env`.

3. **Convex `httpRouter` uses `pathPrefix` (not `path` with wildcards).** `path: "/__clerk"` only matches the exact path `/__clerk`. For sub-paths like `/__clerk/v1/client`, you need `pathPrefix: "/__clerk/"` (trailing slash required).

4. **Static exports (`output: "export"`) cannot have API routes.** All server-side logic lives on Convex. The `convex/http.ts` handler is the only server-side code.

5. **`proxyUrl` on `ClerkProvider` makes ClerkJS load its own `<script>` tag through the proxy.** Convex can't serve Clerk's JS bundle → CORS error. Don't set `proxyUrl` on ClerkProvider when using `tauri-plugin-clerk`. The plugin's `.proxy()` handles routing at the Rust level.

6. **Clerk production keys reject non-HTTPS origins.** `tauri://localhost` will never be accepted. The only path is routing through a server-side proxy that strips the Origin header.

7. **Convex env vars require `npx convex env set`** — `npx convex deploy` does NOT sync `.env` files into Convex's environment. These are two separate stores.

---

## 2. Environment Setup

### Fresh Clone

```bash
git clone https://github.com/levarlux/SchoolMNG.git
cd SchoolMNG
npm install
```

### Required .env Files

**`.env.local`** (not committed — get values from team):
```
CONVEX_DEPLOYMENT=dev:hip-crab-756
NEXT_PUBLIC_CONVEX_URL=https://hip-crab-756.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://hip-crab-756.convex.site
NEXT_PUBLIC_CLERK_PROXY_URL=https://polite-fly-292.convex.site/__clerk
```

> **Why does `.env.local` point Clerk at the prod Convex site?**
> The Clerk proxy requires `CLERK_SECRET_KEY` to authenticate with Clerk's API. That key is only set on the prod Convex deployment (`polite-fly-292`) for security — you don't want dev builds having access to production Clerk secrets. So Clerk auth always routes through the prod Convex proxy, regardless of which Convex deployment holds the app's data. This is intentional. A separate dev Clerk proxy would require duplicating the secret key on the dev deployment, which is a security risk.

**`.env.production`** (not committed — get values from team):
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_CLERK_PROXY_URL=https://polite-fly-292.convex.site/__clerk
CONVEX_DEPLOYMENT=prod:polite-fly-292
NEXT_PUBLIC_CONVEX_URL=https://polite-fly-292.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://polite-fly-292.convex.site
CONVEX_DEPLOY_KEY=prod:polite-fly-292|...
SENTRY_AUTH_TOKEN=sntrys_...
```

**`src-tauri/Cargo.toml` secrets** — The `build.rs` loads `.env.production` then `.env.local` at Rust compile time. The `.env.local` values override `.env.production` for overlapping keys (matching Next.js behavior).

### Dev vs. Prod Convex

| Command | Target |
|---|---|
| `npx convex dev` | Dev (`hip-crab-756`) — hot-reload during development |
| `npx convex deploy` | Uses `CONVEX_DEPLOYMENT` env var (default: dev) |
| `$env:CONVEX_DEPLOYMENT="prod:polite-fly-292"; npx convex deploy` | Prod (`polite-fly-292`) |

### Running Locally

```bash
# Web dev (browser)
npm run dev

# Tauri dev (native window, hot-reload)
npm run tauri:dev

# Tauri build (release)
npm run tauri:build
```

---

## 3. The Golden Rule: Dev → Preview → Stable

**No one deploys directly to `polite-fly-292` (prod) or publishes a stable release without going through dev and preview first. This is non-negotiable.**

### Step 1: Deploy to Dev

```bash
# Convex functions
npx convex dev

# Or explicitly target dev
npx convex deploy
```

Test actual user flows: sign-in, borrow, return, add student. Don't skip this.

### Step 2: Build and Test Tauri Against Dev

The `.env.local` points Convex data at `hip-crab-756` (dev), but Clerk auth always routes through the prod Convex proxy (`polite-fly-292`) — see the note in Section 2 for why. Build:

```powershell
Remove-Item -Recurse -Force .next
npx @tauri-apps/cli build --debug
```

Run the built app. Click through sign-in and one full CRUD flow. Check devtools console.

### Step 3: Publish as GitHub Prerelease (Preview Channel)

```bash
# Bump version (all three files must match — see Section 5)
# Tag the release
git tag v0.1.5
git push origin v0.1.5

# Create GitHub prerelease (NOT stable)
gh release create v0.1.5 --title "v0.1.5" --prerelease --notes "..."
```

Install the prerelease build fresh (not incremental update). Repeat Step 2 testing.

### Step 4: Promote to Stable

After the prerelease runs clean for at least 3 calendar days:

```bash
# Re-publish the same release as stable (remove prerelease flag)
gh release edit v0.1.5 --prerelease=false
```

Or create a new stable release pointing at the same assets. The updater plugin in `src-tauri/src/lib.rs` checks `latest.json` for stable releases — this file is auto-generated by GitHub when a non-prerelease is published.

### Step 5: Deploy to Prod Convex

Only after stable is confirmed working:

```powershell
$env:CONVEX_DEPLOYMENT="prod:polite-fly-292"; npx convex deploy
```

This step is separate from the app release because Convex functions and the Tauri binary are deployed independently.

---

## 4. Pre-Release Checklist

Copy-paste this before every release:

```
[ ] 1. Deploy Convex changes to dev (`npx convex dev`), smoke-test manually
[ ] 2. Full Tauri --debug build, click through:
       [ ] Sign-in / sign-up
       [ ] Add a book
       [ ] Borrow a book
       [ ] Return a book
       [ ] Check devtools console — no new errors
[ ] 3. Bump version in all three files:
       [ ] package.json → "version"
       [ ] src-tauri/Cargo.toml → version
       [ ] src-tauri/tauri.conf.json → version
[ ] 4. Tag git: git tag v<version>
[ ] 5. Publish as GitHub PRERELEASE (--prerelease flag)
[ ] 6. Install prerelease fresh (not incremental), repeat step 2
[ ] 7. Wait minimum 3 calendar days, confirm no issues
[ ] 8. Promote to stable (gh release edit --prerelease=false)
[ ] 9. Deploy to prod Convex ($env:CONVEX_DEPLOYMENT="prod:polite-fly-292"; npx convex deploy)
```

---

## 5. Versioning Rules

### Bump Types

| Type | When | Example |
|---|---|---|
| Patch (`0.1.4` → `0.1.5`) | Bug fixes only | Fix auth proxy, fix UI glitch |
| Minor (`0.1.x` → `0.2.0`) | New features | Add new report type, add bulk import |

Minor versions **always** go through preview for a minimum of 3 calendar days before stable. No exceptions. This gives at least one full school day of real usage before all schools receive the update.

### Version Must Match in All Three Files

Every release, these three must have the same version:

1. `package.json` → `"version": "0.1.5"`
2. `src-tauri/Cargo.toml` → `version = "0.1.5"`
3. `src-tauri/tauri.conf.json` → `"version": "0.1.5"`

Plus the git tag: `git tag v0.1.5`

If a school reports a bug, `git log v0.1.3..v0.1.5` tells you exactly what changed between their build and yours.

---

## 6. Rollback Procedure

### Convex Functions Rollback

Convex has no built-in rollback command. The dashboard's History page (https://dashboard.convex.dev/deployment/history) is an audit log of deploys — useful for identifying which deploy broke things, but does not offer one-click rollback. The free/starter plans don't include this feature at all.

The real rollback path is git-based:

```bash
# Find the last known-good commit
git log --oneline -- convex/

# Restore convex/ to that state
git checkout <commit-hash> -- convex/

# Deploy the old code
$env:CONVEX_DEPLOYMENT="prod:polite-fly-292"; npx convex deploy

# Return to main
git checkout main
```

Or use `git revert <bad-commit>` to create a clean revert commit, then deploy.

### App Release Rollback

If a stable build ships with a critical bug:

1. **Re-point `latest.json`** — edit the latest stable GitHub release to point at the previous version's assets. The updater plugin checks `latest.json` for the download URL.

2. **Never delete old release assets.** Previous builds must remain downloadable. The updater needs them for rollback and for users on older versions.

3. **Cut a hotfix** — bump patch version, go through the full checklist, release as stable.

The updater logic is in `src-tauri/src/lib.rs:check_and_prompt_update()`. It fetches `latest.json` from the latest stable GitHub release, compares versions, and prompts the user to install.

---

## 7. Debugging Checklist: Blank Screen / Auth Issues

If the app shows a blank screen or Clerk auth fails, walk through this:

### Step 1: Check if the Clerk Plugin Registered

Look at the app's stderr/console output on launch:

```
=== CLERK PLUGIN DIAGNOSTICS ===
option_env!(NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) = Some("pk_live_...")
option_env!(NEXT_PUBLIC_CLERK_PROXY_URL) = Some("https://...")
CLERK PLUGIN: Registering with key=pk_live_...
CLERK PLUGIN: proxy=https://polite-fly-292.convex.site/__clerk
CLERK PLUGIN: Registered successfully
=== END CLERK PLUGIN DIAGNOSTICS ===
```

If it says `option_env returned None, NOT registering` → `build.rs` isn't loading `.env` files. Check:
- `src-tauri/build.rs` exists and has `dotenvy` code
- `src-tauri/Cargo.toml` has `build = "build.rs"` under `[package]`
- `.env.production` exists at the project root (not inside `src-tauri/`)
- Run with verbose cargo output to see `build.rs:` warnings

### Step 2: Check isTauri() Detection

In the built app's devtools console:

```js
console.log("isTauri:", window.__TAURI__ !== undefined);
```

If `undefined` → `withGlobalTauri` is not set in `tauri.conf.json`, or the check in `clerk-provider-with-router.tsx` is still using the old `window.__TAURI__` pattern instead of `isTauri()`.

### Step 3: Check Convex Proxy Routes

Test the proxy directly:

```bash
curl -v https://polite-fly-292.convex.site/__clerk/v1/client
```

- **404** → `pathPrefix` routes not deployed. Run `$env:CONVEX_DEPLOYMENT="prod:polite-fly-292"; npx convex deploy`
- **400** → Route exists but Clerk rejected it. Check `CLERK_SECRET_KEY` is set on Convex: `npx convex env get CLERK_SECRET_KEY --prod`
- **200** → Proxy is working, problem is elsewhere

### Step 4: Check Convex Logs

```bash
$env:CONVEX_DEPLOYMENT="prod:polite-fly-292"; npx convex logs
```

Look for the proxy handler logging. If requests aren't appearing at all, the route isn't matching.

### Step 5: Check Environment Variables on Convex

```bash
npx convex env get NEXT_PUBLIC_CLERK_PROXY_URL --prod
npx convex env get CLERK_SECRET_KEY --prod
```

Both must return values. If empty, run:

```bash
$env:CONVEX_DEPLOYMENT="prod:polite-fly-292"
npx convex env set NEXT_PUBLIC_CLERK_PROXY_URL "https://polite-fly-292.convex.site/__clerk"
npx convex env set CLERK_SECRET_KEY "sk_live_..."
```

### Step 6: Check Build-Time Env Vars in Rust

If the plugin registers but still fails, check that `option_env!()` resolved correctly during the last build. The `build.rs` diagnostics print during `cargo build`:

```
build.rs: CARGO_MANIFEST_DIR = .../src-tauri
build.rs: resolved root = .../SchoolMNG
build.rs: .env.production exists = true
build.rs: dotenvy load .env.production = true
build.rs: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = pk_liv...xxxx (len=66)
build.rs: NEXT_PUBLIC_CLERK_PROXY_URL = https:... (len=53)
```

If keys show `NOT SET` → dotenvy can't find the files. Check the path resolution.

---

## 8. Where to Look / Who to Ask

### Key Files

| File | What it does |
|---|---|
| `src-tauri/src/lib.rs` | Rust entry point, plugin registration, updater logic |
| `src-tauri/build.rs` | Loads `.env` files for Rust compile-time env vars |
| `src-tauri/tauri.conf.json` | Tauri config, window settings, `withGlobalTauri` |
| `src/components/clerk-provider-with-router.tsx` | ClerkProvider setup, `isTauri()` detection, `initClerk()` |
| `convex/http.ts` | HTTP router — Clerk proxy + webhook handler |
| `convex/auth.config.ts` | Clerk JWT auth provider for Convex |
| `convex/clerk.ts` | Clerk API helpers (org create/update/delete) |
| `.env.local` | Dev environment variables |
| `.env.production` | Production keys (gitignored) |

### External Docs

- Tauri v2: https://v2.tauri.app
- `tauri-plugin-clerk` v0.1.1: https://github.com/Nipsuli/tauri-plugin-clerk
- Convex HTTP Router: https://docs.convex.dev/functions/http-actions
- Convex Multiple Deployments: https://docs.convex.dev/production/multiple-deployments
- Clerk Proxy: https://clerk.com/docs/references/http/proxy
- Clerk JS SDK: https://clerk.com/docs/references/javascript/overview

### Current Pinned Versions

| Dependency | Version |
|---|---|
| `tauri` (Rust) | 2.x |
| `tauri-plugin-clerk` | 0.1.1 |
| `@clerk/clerk-react` | 5.x |
| `next` | 16.2.10 |
| `convex` | latest |

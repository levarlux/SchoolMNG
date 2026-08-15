# Off — Session Notes

---

## v0.2.1 — Gear Icon Fix (2026-07-21)

**Status:** Complete. Deployed to prod Convex, tagged, built.

### What Changed

The gear icon (Cog) on the classes listing page was a `<Link>` navigating to `/dashboard/classes/[id]` (the class detail page). Users expected it to open a stream management modal inline on the same page.

**Fix in `src/app/dashboard/classes/page.tsx`:**
- Replaced `<Link>` with `<Button>` that opens a stream creation modal
- Added `createStream` mutation, `showStreamModal`/`selectedClassId`/`streamName` state
- Added stream creation modal (same pattern as `class-detail-client.tsx`)
- Gear icon now only shows for classes with `hasStreams` enabled
- Removed unused `Link` import

### Release

| Item | Detail |
|---|---|
| Version | 0.2.1 (patch — bug fix only) |
| Commit | `456be62` |
| Branch | `stable-v0.2.0` |
| Tag | `v0.2.1` |
| Prod Convex | Deployed to `polite-fly-292` |
| Tauri build | Debug build at `src-tauri\target\debug\bundle\` |

### Build Note

The `npm run build` script includes `npx convex deploy --cmd "next build"` which prompts interactively for prod deploy confirmation. Tauri's CLI runs in non-interactive mode, so this fails. **Workaround:** run the build steps manually:
1. `npx convex codegen`
2. `npx next build`
3. `npx @tauri-apps/cli build --debug --ci` (the `--ci` flag skips the interactive prompt)

Or set `$env:CONVEX_DEPLOYMENT="prod:polite-fly-292"` before running `npx @tauri-apps/cli build --ci`.

### Signing Key

The `pubkey` in `tauri.conf.json` corresponds to a private key stored in GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`. The secret is write-only — you cannot view it, only overwrite. For local debug builds, the signing error is harmless (bundles work, just unsigned). For release builds, the CI pipeline has the key.

---

## v0.2.0 — Clerk Proxy Auth Fix (2026-07-20)

**Status:** Code deployed to prod Convex. Pending: Clerk Dashboard proxy URL configuration + end-to-end test.

---

## What We Found

The app showed a **blank white screen** on launch. After extensive debugging across multiple sessions, the root cause chain was:

### The Failure Chain

```
Tauri app launches
  → initClerk() from tauri-plugin-clerk tries to fetch /v1/client and /v1/environment
  → Requests route through Rust HTTP → Convex proxy → Clerk FAPI
  → Clerk FAPI rejects with 400: host_invalid
  → "We were unable to attribute this request to an instance running on Clerk"
  → initClerk() throws → try/catch catches it, returns null
  → ClerkProvider falls back to browser-mode Clerk
  → Browser-mode Clerk hits Clerk directly with tauri://localhost Origin
  → Clerk rejects Origin: "Production Keys are only allowed for domain levarlux.com"
  → Blank screen — neither native nor browser-mode works
```

### The Actual Root Cause

**`X-Forwarded-Host` header was wrong in the Convex proxy.**

Per Clerk's proxy docs, when forwarding requests to Clerk FAPI, the proxy must set:
- `X-Forwarded-Host` — must match the domain configured on Clerk's Domains page (`levarlux.com`)
- `X-Forwarded-Proto` — must be `https`

The old code in `convex/http.ts` line 73 was:
```ts
headers.set("X-Forwarded-Host", new URL(proxyUrl).host);
// → "polite-fly-292.convex.site" (the proxy's own domain, WRONG)
```

Clerk uses `X-Forwarded-Host` to attribute the request to the correct Clerk instance. When it received `polite-fly-292.convex.site` instead of `levarlux.com`, it couldn't match the request to any instance → `host_invalid`.

---

## What We Fixed

### Fix 1: `X-Forwarded-Host` header (convex/http.ts)

**File:** `convex/http.ts:73`

**Before:**
```ts
headers.set("X-Forwarded-Host", new URL(proxyUrl).host);
```

**After:**
```ts
headers.set("X-Forwarded-Host", process.env.CLERK_FORWARDED_HOST ?? "levarlux.com");
```

The proxy now sends `levarlux.com` as `X-Forwarded-Host`, which Clerk recognizes as the configured domain for the `pk_live_Y2xlcmsubGV2YXJsdXguY29tJA` publishable key.

**Deployed to:** `prod:polite-fly-292` Convex deployment.

### Fix 2: try/catch resilience (clerk-provider-with-router.tsx)

**File:** `src/components/clerk-provider-with-router.tsx:11-18`

Wrapped `initClerk()` in a try/catch so that if native Clerk init fails, the app doesn't crash with an uncaught error. It falls back to `null` (browser-mode Clerk). This is a defensive measure — in a Tauri app, browser-mode Clerk also can't work (Origin rejection), so native mode MUST succeed. But the try/catch prevents a hard crash and gives a clear error message in the console.

**Before:** No error handling — `initClerk()` throwing crashed the entire app.
**After:** Errors are caught and logged, returning `null` gracefully.

### Fix 3: Proxy error logging (convex/http.ts)

**File:** `convex/http.ts:100-105`

Added `console.error` / `console.log` to the proxy handler so Clerk FAPI responses are visible in `npx convex logs`. This was critical for diagnosing the `host_invalid` error — without it, the 400 was silent.

---

## What's Still Pending

### 1. Clerk Dashboard Proxy Configuration (ONE-TIME, MANUAL)

The Clerk Dashboard needs the proxy URL registered. This is a **dashboard-only change**, no code involved:

1. Go to **Clerk Dashboard → your production instance → Configure → Domains**
2. Find the **Frontend API** section, click **"Use proxy"** (or "Set proxy configuration")
3. Enter: `https://polite-fly-292.convex.site/__clerk`
4. Clerk performs a live validation check — with the `X-Forwarded-Host` fix above deployed, this should now **pass** (it was failing with "Clerk Frontend API cannot be accessed through the proxy URL" before the fix)
5. Save

**Important:** This is the Clerk Dashboard UI, not code. It was failing before because Clerk's live validation test was receiving `X-Forwarded-Host: polite-fly-292.convex.site` from our proxy. Now that it sends `levarlux.com`, the validation should pass.

### 2. End-to-End Test

After saving the proxy URL in the Dashboard:
- Relaunch the app (no rebuild needed — the fix is server-side on Convex)
- Check `npx convex logs` — you should see `[clerk-proxy] GET /v1/client → 200` instead of 400
- The app should load the dashboard instead of a blank screen
- Sign-in/sign-up should work

### 3. Rebuild the Tauri App

Once the proxy is confirmed working:
```powershell
Remove-Item -Recurse -Force .next
npx @tauri-apps/cli build --debug
```

The previous build failed with `os error 32` (file in use) — close any running `school-library-manager.exe` process first.

---

## How the Proxy Works (Architecture Reference)

```
Tauri App (tauri-plugin-clerk)
  │
  │  initClerk() calls /v1/client, /v1/environment
  │  Patched fetch intercepts → Rust HTTP client
  │
  ▼
Rust HTTP (tauri-plugin-http)
  │
  │  Routes to: https://polite-fly-292.convex.site/__clerk/v1/client
  │
  ▼
Convex HTTP Action (convex/http.ts clerkProxyHandler)
  │
  │  Strips: Origin, Host headers
  │  Sets:   Clerk-Proxy-Url, Clerk-Secret-Key,
  │          X-Forwarded-Host: levarlux.com  ← THIS WAS THE FIX
  │          X-Forwarded-Proto: https
  │
  ▼
Clerk Frontend API (https://frontend-api.clerk.dev/v1/client)
  │
  │  Sees X-Forwarded-Host: levarlux.com
  │  Matches to instance: clerk.levarlux.com (pk_live_Y2xlcmsubGV2YXJsdXguY29tJA)
  │  Accepts request → returns client/environment data
  │
  ▼
Response flows back through proxy → Rust → tauri-plugin-clerk → ClerkJS initialized
```

### Why Browser-Mode Fallback Doesn't Work in Tauri

When `initClerk()` fails and returns `null`, `ClerkProvider` falls back to its standard browser-based Clerk runtime. This runtime makes HTTP requests directly from the WebView with `Origin: tauri://localhost`. Clerk production keys reject any Origin that isn't a subdomain of the configured domain (`levarlux.com`). There is no way to make browser-mode Clerk work in a Tauri app — the native plugin path is the only option.

### Why `X-Forwarded-Host` Matters

Clerk's proxy architecture works by:
1. The app sends requests to the proxy URL (instead of directly to Clerk)
2. The proxy forwards to Clerk FAPI with `X-Forwarded-Host` set to the original domain
3. Clerk uses `X-Forwarded-Host` to determine which Clerk instance the request belongs to
4. If `X-Forwarded-Host` doesn't match any configured domain → `host_invalid`

Setting `X-Forwarded-Host` to the proxy's own domain (`polite-fly-292.convex.site`) tells Clerk "this request is for the polite-fly-292 instance" — which doesn't exist on Clerk. Setting it to `levarlux.com` tells Clerk "this request is for the levarlux.com instance" — which matches the publishable key.

---

## Key Files

| File | What Changed |
|---|---|
| `convex/http.ts:73` | `X-Forwarded-Host` now sends `levarlux.com` instead of proxy's own host |
| `convex/http.ts:100-105` | Added proxy error logging for diagnostics |
| `src/components/clerk-provider-with-router.tsx:11-18` | Added try/catch around `initClerk()` |

## Debugging Technique That Worked

Adding `console.error` to the Convex proxy handler and checking `npx convex logs` was the breakthrough. The proxy was silently forwarding Clerk's 400 responses without logging them. Once we could see the actual Clerk error body (`host_invalid`), the fix was obvious.

**Lesson:** When debugging proxy/API issues, always add response body logging to the proxy layer. HTTP status codes alone are never enough — you need the actual error message from the upstream service.

---

## Environment Variables Reference

| Variable | Value | Where Used |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_Y2xlcmsubGV2YXJsdXguY29tJA` | Rust build (option_env!), Next.js |
| `NEXT_PUBLIC_CLERK_PROXY_URL` | `https://polite-fly-292.convex.site/__clerk` | Rust plugin, Convex proxy handler |
| `CLERK_SECRET_KEY` | `sk_live_...` | Convex env (set via `npx convex env set`) |
| `CLERK_FORWARDED_HOST` | `levarlux.com` (hardcoded fallback in code) | Convex proxy handler — **NOT YET SET AS CONVEX ENV VAR**, using hardcoded fallback |
| `CONVEX_DEPLOYMENT` | `prod:polite-fly-292` | Deploy target |

**Note:** `CLERK_FORWARDED_HOST` is not yet set as a Convex environment variable — the code uses `process.env.CLERK_FORWARDED_HOST ?? "levarlux.com"` with a hardcoded fallback. Optionally set it via `npx convex env set CLERK_FORWARDED_HOST "levarlux.com"` for configurability, but the fallback works fine.

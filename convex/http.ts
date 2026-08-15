import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// ── Web Crypto signature verification (edge-runtime compatible) ──

async function verifyPaystackSignature(
  rawBody: string,
  signature: string,
): Promise<boolean> {
  // Paystack uses the main API Secret Key for webhook verification
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error("[paystack] PAYSTACK_SECRET_KEY not set");
    return false;
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expectedHash = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison to prevent timing attacks
  // Convert both strings to typed arrays and XOR every byte
  if (expectedHash.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expectedHash.length; i++) {
    result |= expectedHash.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

// --- Clerk webhook (existing) ---

http.route({
  path: "/api/webhooks/clerk",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response("Missing svix headers", { status: 400 });
    }

    const rawBody = await request.text();

    try {
      await ctx.runAction(internal.clerkWebhook.verifyAndProcessWebhook, {
        rawBody,
        headers: {
          "svix-id": svixId,
          "svix-timestamp": svixTimestamp,
          "svix-signature": svixSignature,
        },
      });

      return new Response("OK", { status: 200 });
    } catch (err) {
      console.error("Webhook verification failed:", err);
      return new Response("Invalid webhook signature", { status: 400 });
    }
  }),
});

// --- Paystack webhook endpoint ---

http.route({
  path: "/api/paystack/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const rawBody = await request.text();
    const signature = request.headers.get("x-paystack-signature");
    const webhookId = request.headers.get("x-paystack-id"); // Unique event ID

    if (!signature) {
      return new Response("Missing signature header", { status: 400 });
    }

    // Verify webhook signature (prevents forged requests)
    if (!(await verifyPaystackSignature(rawBody, signature))) {
      console.error("[paystack-webhook] Invalid signature");
      return new Response("Invalid signature", { status: 400 });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const event = (body as Record<string, unknown>).event as string | undefined;
    const data = (body as Record<string, unknown>).data;
    const eventId = webhookId || (data as Record<string, unknown>)?.id as string;

    if (!event || !data) {
      return new Response("Missing event or data", { status: 400 });
    }

    if (!eventId) {
      return new Response("Missing event ID", { status: 400 });
    }

    // Reject stale events (>5 min old) to prevent replay attacks
    const createdAt = (data as Record<string, unknown>).created_at as string | undefined;
    if (createdAt) {
      const eventAge = Date.now() - new Date(createdAt).getTime();
      if (eventAge > 5 * 60 * 1000) {
        console.warn(`[paystack-webhook] Stale event rejected: ${event} (${Math.round(eventAge / 1000)}s old)`);
        return new Response("Event too old", { status: 400 });
      }
    }
    
    // Convert event ID to string (Paystack sends it as a number)
    const eventIdStr = String(eventId);

    try {
      // Process the webhook event with idempotency check
      const result = await ctx.runMutation(internal.paystack.processWebhookEvent, {
        eventId: eventIdStr,
        event,
        data,
      });
      
      // Return 200 even for duplicates (Paystack expects 200)
      return new Response("OK", { status: 200 });
    } catch (err) {
      console.error("[paystack-webhook] Processing error:", err);
      return new Response("Processing error", { status: 500 });
    }
  }),
});

// --- Paystack callback (user redirect after checkout) ---

http.route({
  path: "/api/paystack/callback",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const url = new URL(request.url);
    const reference = url.searchParams.get("reference");
    const trxref = url.searchParams.get("trxref");
    const queryRef = reference || trxref;

    // Redirect to the billing page with the reference — the client-side
    // component will verify the transaction and activate the subscription.
    const billingUrl = new URL("/dashboard/billing", url.origin);
    if (queryRef) {
      billingUrl.searchParams.set("ref", queryRef);
      billingUrl.searchParams.set("verified", "pending");
    }

    return Response.redirect(billingUrl.toString(), 302);
  }),
});

// --- Clerk Frontend API proxy ---

// This catches ALL methods on /__clerk/* and forwards to Clerk's Frontend API.
// It strips the tauri://localhost Origin header and injects the headers Clerk
// needs to accept the request from our verified domain.

const CLERK_FAPI = "https://frontend-api.clerk.dev";

const clerkProxyHandler = httpAction(async (_ctx, request) => {
  const proxyUrl = process.env.NEXT_PUBLIC_CLERK_PROXY_URL;
  if (!proxyUrl) {
    return new Response("Proxy not configured", { status: 500 });
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return new Response("CLERK_SECRET_KEY not set", { status: 500 });
  }

  const url = new URL(request.url);
  const clerkPath = url.pathname.replace("/__clerk", "") + url.search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower !== "origin" && lower !== "host") {
      headers.set(key, value);
    }
  });

  headers.set("Clerk-Proxy-Url", proxyUrl);
  headers.set("Clerk-Secret-Key", secretKey);
  headers.set("X-Forwarded-Host", new URL(proxyUrl).host);
  headers.set("X-Forwarded-Proto", "https");

  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.text()
      : undefined;

  const clerkResponse = await fetch(`${CLERK_FAPI}${clerkPath}`, {
    method: request.method,
    headers,
    body,
  });

  const responseHeaders = new Headers();
  clerkResponse.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === "content-type" ||
      lower === "cache-control" ||
      lower === "set-cookie" ||
      lower.startsWith("x-")
    ) {
      responseHeaders.set(key, value);
    }
  });

  return new Response(await clerkResponse.arrayBuffer(), {
    status: clerkResponse.status,
    headers: responseHeaders,
  });
});

http.route({
  pathPrefix: "/__clerk/",
  method: "GET",
  handler: clerkProxyHandler,
});

http.route({
  pathPrefix: "/__clerk/",
  method: "POST",
  handler: clerkProxyHandler,
});

http.route({
  pathPrefix: "/__clerk/",
  method: "PUT",
  handler: clerkProxyHandler,
});

http.route({
  pathPrefix: "/__clerk/",
  method: "PATCH",
  handler: clerkProxyHandler,
});

http.route({
  pathPrefix: "/__clerk/",
  method: "DELETE",
  handler: clerkProxyHandler,
});

http.route({
  pathPrefix: "/__clerk/",
  method: "OPTIONS",
  handler: clerkProxyHandler,
});

export default http;

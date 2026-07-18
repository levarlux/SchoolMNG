import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

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

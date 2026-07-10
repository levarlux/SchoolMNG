import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new NextResponse("Missing svix headers", { status: 400 });
  }

  const secret = process.env.CLERK_WEBHOOK_SECRET!;
  const wh = new Webhook(secret);

  let evt: { type: string; data: Record<string, unknown> };
  try {
    const payload = await req.json();
    evt = wh.verify(JSON.stringify(payload), {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof evt;
  } catch {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return new NextResponse("Convex not configured", { status: 500 });
  }

  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("@/convex/_generated/api");
  const convex = new ConvexHttpClient(convexUrl);

  if (evt.type === "organization.created") {
    const { id, name, slug } = evt.data as { id: string; name: string; slug: string };
    const existing = await convex.query(api.schools.getByClerkOrgId, { clerkOrgId: id });
    if (!existing) {
      await convex.mutation(api.schools.create, {
        clerkOrgId: id,
        name,
        slug,
        logoUrl: undefined,
        primaryColor: "#2563eb",
        secondaryColor: "#64748b",
      });
    }
  }

  if (evt.type === "organization.updated") {
    const { id, name, slug } = evt.data as { id: string; name?: string; slug?: string };
    const school = await convex.query(api.schools.getByClerkOrgId, { clerkOrgId: id });
    if (school) {
      await convex.mutation(api.schools.update, {
        id: school._id,
        ...(name ? { name } : {}),
        ...(slug ? { slug } : {}),
      });
    }
  }

  if (evt.type === "organization.deleted") {
    const { id } = evt.data as { id: string };
    const school = await convex.query(api.schools.getByClerkOrgId, { clerkOrgId: id });
    if (school) {
      await convex.mutation(api.schools.remove, { id: school._id });
    }
  }

  return new NextResponse("OK", { status: 200 });
}

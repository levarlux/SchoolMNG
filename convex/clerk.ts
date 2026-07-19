const CLERK_API = "https://api.clerk.com/v1";

function authHeader() {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY not set in Convex env");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export async function createClerkOrg(name: string) {
  const res = await fetch(`${CLERK_API}/organizations`, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Clerk createOrg failed (${res.status}): ${body}`);
  }
  return (await res.json()) as { id: string };
}

export async function updateClerkOrg(orgId: string, data: { name?: string }) {
  const res = await fetch(`${CLERK_API}/organizations/${orgId}`, {
    method: "PATCH",
    headers: authHeader(),
    body: JSON.stringify(data),
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Clerk updateOrg failed (${res.status}): ${body}`);
  }
}

export async function deleteClerkOrg(orgId: string) {
  const res = await fetch(`${CLERK_API}/organizations/${orgId}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  // 404 means already gone — that's fine
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Clerk deleteOrg failed (${res.status}): ${body}`);
  }
}

export async function sendClerkOrgInvitation(
  orgId: string,
  emailAddress: string,
  publicMetadata: Record<string, unknown>
) {
  const res = await fetch(`${CLERK_API}/organizations/${orgId}/invitations`, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify({
      email_address: emailAddress,
      role: "org:member",
      public_metadata: publicMetadata,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Clerk invite failed (${res.status}): ${body}`);
  }
  return (await res.json()) as { id: string };
}

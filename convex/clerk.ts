const CLERK_API = "https://api.clerk.com/v1";
const CLERK_TIMEOUT_MS = 15_000; // 15 second timeout for Clerk API calls

function authHeader() {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY not set in Convex env. Run: npx convex env set CLERK_SECRET_KEY <your-key>");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/** Fetch with timeout to prevent hanging actions */
async function clerkFetch(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLERK_TIMEOUT_MS);

  try {
    const res = await fetch(`${CLERK_API}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...authHeader(),
        ...options.headers,
      },
    });
    return res;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Clerk API timeout after ${CLERK_TIMEOUT_MS / 1000}s — check network or try again`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createClerkOrg(name: string) {
  const res = await clerkFetch("/organizations", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Clerk createOrg failed (${res.status}): ${body}`);
  }
  return (await res.json()) as { id: string };
}

export async function updateClerkOrg(orgId: string, data: { name?: string }) {
  const res = await clerkFetch(`/organizations/${orgId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Clerk updateOrg failed (${res.status}): ${body}`);
  }
}

export async function deleteClerkOrg(orgId: string) {
  const res = await clerkFetch(`/organizations/${orgId}`, {
    method: "DELETE",
  });
  // 404 means already gone — that's fine
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Clerk deleteOrg failed (${res.status}): ${body}`);
  }
}

/** Check if a Clerk organization exists */
export async function getClerkOrg(orgId: string): Promise<{ id: string; name: string } | null> {
  const res = await clerkFetch(`/organizations/${orgId}`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = await res.json();
  return { id: data.id, name: data.name };
}

export async function sendClerkOrgInvitation(
  orgId: string,
  emailAddress: string,
  publicMetadata: Record<string, unknown>
) {
  // Verify org exists first
  const org = await getClerkOrg(orgId);
  if (!org) {
    throw new Error(
      `Clerk organization not found (ID: ${orgId}). The school's organization may have been deleted. ` +
      "Please contact a superadmin to re-provision this school."
    );
  }

  const res = await clerkFetch(`/organizations/${orgId}/invitations`, {
    method: "POST",
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

export async function revokeClerkOrgInvitation(orgId: string, invitationId: string) {
  const res = await clerkFetch(
    `/organizations/${orgId}/invitations/${invitationId}/revoke`,
    { method: "POST" }
  );
  // 404 = already gone — treat as success
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Clerk revoke invite failed (${res.status}): ${body}`);
  }
}

/** Remove a Clerk user from an org. 404 (not a member) is treated as success. */
export async function deleteClerkOrgMembership(orgId: string, userId: string) {
  const res = await clerkFetch(`/organizations/${orgId}/memberships/${userId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Clerk remove-membership failed (${res.status}): ${body}`);
  }
}

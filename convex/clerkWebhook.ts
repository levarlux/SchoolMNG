"use node";

import { internalAction } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { Webhook } from "svix";

export const verifyAndProcessWebhook = internalAction({
  args: {
    rawBody: v.string(),
    headers: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error("CLERK_WEBHOOK_SECRET not set in Convex env");
    }

    const wh = new Webhook(secret);
    let evt: any;

    try {
      evt = wh.verify(args.rawBody, args.headers as any);
    } catch (err) {
      throw new Error("Verification failed");
    }

    const eventType = evt.type;
    console.log(`[webhook] ${eventType} — org: ${evt.data?.organization?.id ?? evt.data?.id ?? "n/a"}, user: ${evt.data?.public_user_data?.user_id ?? evt.data?.user?.id ?? "n/a"}`);

    if (
      eventType === "organization.created" ||
      eventType === "organization.updated" ||
      eventType === "organization.deleted"
    ) {
      const { id, name, slug } = evt.data as {
        id: string;
        name?: string;
        slug?: string;
      };
      await ctx.runMutation(api.webhooks.handleOrganizationEvent, {
        secret,
        event: eventType,
        data: { id, name, slug },
      });
    } else if (
      eventType === "organizationMembership.created" ||
      eventType === "organizationMembership.deleted"
    ) {
      const data = evt.data as {
        id: string;
        organization: { id: string };
        public_user_data: { user_id: string; identifier?: string; email_addresses?: { email_address: string }[] };
        public_metadata?: Record<string, unknown>;
      };
      const email =
        data.public_user_data.email_addresses?.[0]?.email_address ??
        data.public_user_data.identifier;
      await ctx.runMutation(api.webhooks.handleMembershipEvent, {
        secret,
        event: eventType,
        data: {
          orgId: data.organization.id,
          userId: data.public_user_data.user_id,
          email,
          publicMetadata: data.public_metadata,
        },
      });
    }
  },
});

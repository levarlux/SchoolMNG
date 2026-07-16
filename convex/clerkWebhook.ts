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

    const { id, name, slug } = evt.data as {
      id: string;
      name?: string;
      slug?: string;
    };

    await ctx.runMutation(api.webhooks.handleOrganizationEvent, {
      secret,
      event: evt.type,
      data: { id, name, slug },
    });
  },
});

import { v, ConvexError } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { authComponent } from "./auth";
import { billingAccess, CAPY_PRICE_ID } from "@capy/equity/billing";

export async function accessForUser(ctx: QueryCtx | MutationCtx, userId: string) {
  const subscriptions = await ctx.db
    .query("billingSubscriptions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const paidUntil = Math.max(0, ...subscriptions.map((s) => s.paidUntil));
  const accessUntil = Math.max(
    paidUntil,
    ...subscriptions.filter((s) => s.status === "trialing").map((s) => s.trialEnd),
  );
  return {
    ...billingAccess(accessUntil, Date.now(), process.env.CAPY_SELF_HOSTED === "true"),
    paidUntil,
  };
}
export async function requireEditing(ctx: QueryCtx | MutationCtx, userId: string) {
  if (!(await accessForUser(ctx, userId)).canEdit)
    throw new ConvexError(
      "Your account is read-only. Choose a plan in Billing to continue editing. You can still view and export your records.",
    );
}
export const status = query({
  args: { tick: v.number() },
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new ConvexError("Sign in to view billing.");
    const own = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const reservations = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_email", (q) => q.eq("email", user.email.toLowerCase()))
      .collect();
    const current = own.find((s) =>
      ["active", "trialing", "past_due", "unpaid", "paused"].includes(s.status),
    );
    const reservation = reservations.some(
      (s) => !s.userId && ["active", "trialing", "past_due", "unpaid", "paused"].includes(s.status),
    );
    return {
      ...(await accessForUser(ctx, user._id)),
      subscribed: !!current,
      status: current?.status,
      trialEnd: current?.trialEnd,
      cancelAtPeriodEnd: current?.cancelAtPeriodEnd,
      reservation,
      portalUrl: process.env.STRIPE_PORTAL_URL || null,
    };
  },
});

type Subscription = {
  id: string;
  customer: string;
  status: string;
  metadata?: Record<string, string>;
  trial_end?: number | null;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  items?: { data: { price?: { id: string }; current_period_end?: number }[] };
};
export const syncSubscription = internalMutation({
  args: {
    subscription: v.any(),
    email: v.optional(v.string()),
    eventCreated: v.number(),
    eventId: v.string(),
    paidUntil: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (
      await ctx.db
        .query("billingEvents")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .unique()
    )
      return;
    const s = args.subscription as Subscription;
    if (!s.items?.data.some((i) => i.price?.id === CAPY_PRICE_ID)) return;
    const old = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_subscription", (q) => q.eq("subscriptionId", s.id))
      .unique();
    // Entitlement extends only on an authenticated paid invoice (or an explicit administrative reconciliation).
    const paidUntil = Math.max(old?.paidUntil || 0, args.paidUntil || 0);
    if (
      !old ||
      (args.eventCreated >= old.updatedAt && (old.status !== "canceled" || s.status === "canceled"))
    ) {
      const record = {
        userId: old?.userId || s.metadata?.capyUserId || undefined,
        email: (args.email || s.metadata?.capyEmail || old?.email || "").toLowerCase(),
        subscriptionId: s.id,
        customerId: s.customer,
        status: s.status,
        trialEnd: (s.trial_end || 0) * 1000,
        paidUntil,
        cancelAtPeriodEnd: !!s.cancel_at_period_end,
        updatedAt: args.eventCreated,
      };
      if (old) await ctx.db.patch(old._id, record);
      else await ctx.db.insert("billingSubscriptions", record);
    } else if (paidUntil > old.paidUntil) await ctx.db.patch(old._id, { paidUntil });
    await ctx.db.insert("billingEvents", { eventId: args.eventId });
  },
});
export const paidInvoice = internalMutation({
  args: { eventId: v.string(), subscriptionId: v.string(), paidUntil: v.number() },
  handler: async (ctx, args) => {
    if (
      await ctx.db
        .query("billingEvents")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .unique()
    )
      return;
    const subscription = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_subscription", (q) => q.eq("subscriptionId", args.subscriptionId))
      .unique();
    if (!subscription) throw new Error("Subscription has not arrived yet; retry this invoice.");
    await ctx.db.patch(subscription._id, {
      paidUntil: Math.max(subscription.paidUntil, args.paidUntil),
    });
    await ctx.db.insert("billingEvents", { eventId: args.eventId });
  },
});

export const beginCheckout = mutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.CAPY_SELF_HOSTED === "true")
      throw new ConvexError(
        "This installation is self-hosted and does not require a subscription.",
      );
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new ConvexError("Sign in to choose a plan.");
    const subscriptions = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    if (subscriptions.some((s) => s.paidUntil > Date.now()))
      throw new ConvexError(
        "Your account already has paid access. You can choose a new plan when your paid period ends.",
      );
    const reservations = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_email", (q) => q.eq("email", user.email.toLowerCase()))
      .collect();
    if (
      [...subscriptions, ...reservations].some((s) =>
        ["active", "trialing", "past_due", "unpaid", "paused"].includes(s.status),
      )
    )
      throw new ConvexError(
        "You already have a subscription or reservation. Open Billing to manage it or contact us to connect it.",
      );
    const old = await ctx.db
      .query("billingCheckouts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (old && old.expiresAt > Date.now() + 60000) return { ...old, email: user.email };
    // Checkout sessions expire before another reservation can be created.
    if (old && old.expiresAt > Date.now())
      throw new ConvexError("Your checkout link is expiring. Please try again in one minute.");
    const value = {
      userId: user._id,
      nonce: crypto.randomUUID(),
      expiresAt: Math.ceil(Date.now() / 1000) * 1000 + 31 * 60000,
    };
    if (old) await ctx.db.patch(old._id, value);
    else await ctx.db.insert("billingCheckouts", value);
    return { ...value, email: user.email };
  },
});

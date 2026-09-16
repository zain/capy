import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { CAPY_PRICE_ID, verifyStripeSignature } from "@capy/equity/billing";

type StripeEvent = {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: {
    object: {
      id: string;
      subscription?: string;
      parent?: { subscription_details?: { subscription?: string } };
      paid?: boolean;
      status?: string;
      amount_paid?: number;
      billing_reason?: string;
      lines?: {
        data: {
          price?: { id: string };
          pricing?: { price_details?: { price: string } };
          period: { end: number };
        }[];
      };
    };
  };
};
export const webhook = httpAction(async (ctx, request) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook is not configured", { status: 503 });
  const body = await request.text();
  if (!(await verifyStripeSignature(body, request.headers.get("stripe-signature") || "", secret)))
    return new Response("Invalid signature", { status: 400 });
  const event = JSON.parse(body) as StripeEvent;
  if (event.livemode !== (process.env.STRIPE_LIVE_MODE === "true"))
    return new Response("Wrong mode", { status: 400 });
  if (
    [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ].includes(event.type)
  ) {
    await ctx.runMutation(internal.billing.syncSubscription, {
      subscription: event.data.object,
      eventCreated: event.created,
      eventId: event.id,
    });
  } else if (event.type === "invoice.paid") {
    const invoice = event.data.object;
    const subscriptionId =
      invoice.parent?.subscription_details?.subscription || invoice.subscription;
    const lines =
      invoice.lines?.data.filter(
        (l) => (l.pricing?.price_details?.price || l.price?.id) === CAPY_PRICE_ID,
      ) || [];
    if (
      subscriptionId &&
      invoice.status === "paid" &&
      lines.length &&
      (invoice.amount_paid || 0) > 0
    ) {
      await ctx.runMutation(internal.billing.paidInvoice, {
        eventId: event.id,
        subscriptionId,
        paidUntil: Math.max(...lines.map((l) => l.period.end)) * 1000,
      });
    }
  }
  return new Response("ok");
});

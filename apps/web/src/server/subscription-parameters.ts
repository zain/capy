import { FREE_UNTIL, CAPY_PRICE_ID } from "@capy/equity/billing";

export function subscriptionParameters(
  checkout: { userId: string; email: string; expiresAt: number },
  site: string,
  now = Date.now(),
) {
  const p = new URLSearchParams();
  p.set("mode", "subscription");
  p.set("line_items[0][price]", CAPY_PRICE_ID);
  p.set("line_items[0][quantity]", "1");
  p.set("payment_method_collection", "always");
  p.set("customer_email", checkout.email);
  p.set("client_reference_id", checkout.userId);
  p.set("subscription_data[metadata][capyUserId]", checkout.userId);
  p.set("subscription_data[metadata][capyEmail]", checkout.email);
  p.set("success_url", `${site}/billing?checkout=success`);
  p.set("cancel_url", `${site}/billing`);
  p.set("expires_at", String(Math.floor(checkout.expiresAt / 1000)));
  if (now < FREE_UNTIL - 48 * 3600000) {
    p.set("subscription_data[trial_end]", String(FREE_UNTIL / 1000));
    p.set(
      "custom_text[submit][message]",
      "Nothing is charged today. Your subscription starts at $600 per year on December 8, 2026. Cancel before then to pay nothing.",
    );
  } else if (now < FREE_UNTIL) {
    // Stripe requires trial_end to be at least 48 hours out. Keep the advertised free period.
    p.set("subscription_data[trial_period_days]", "2");
    p.set(
      "custom_text[submit][message]",
      "Nothing is charged today. Your subscription starts at $600 per year after a two-day free trial. Cancel before then to pay nothing.",
    );
  } else
    p.set(
      "custom_text[submit][message]",
      "$600 per year. Your subscription begins today. Manage or cancel it from Billing.",
    );
  return p;
}

import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { api } from "@capy/backend/convex/_generated/api";
import { fetchAuthMutation } from "@/lib/auth-server";
import { subscriptionParameters } from "./subscription-parameters";
import type { CheckoutEnv } from "./checkout";

export const startSubscription = createServerFn({ method: "POST" }).handler(async () => {
  const runtime = env as unknown as CheckoutEnv;
  if (!runtime.STRIPE_SECRET_KEY)
    throw new Error("Billing is temporarily unavailable. Contact hello@capyinc.com.");
  const checkout = await fetchAuthMutation(api.billing.beginCheckout, {});
  const result = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2025-08-27.basil",
      "Idempotency-Key": `capy-subscribe-${checkout.nonce}`,
    },
    body: subscriptionParameters(checkout, runtime.SITE_URL, checkout.expiresAt - 31 * 60000),
  });
  if (!result.ok)
    throw new Error("We couldn’t open checkout. Please try again or contact hello@capyinc.com.");
  const session = (await result.json()) as { url: string };
  return { url: session.url };
});

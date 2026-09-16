import { describe, expect, it } from "vite-plus/test";
import { createHmac } from "node:crypto";
import {
  billingAccess,
  FREE_UNTIL,
  BILLING_REMINDER_AT,
  CAPY_PRICE_ID,
  verifyStripeSignature,
} from "@capy/equity/billing";
import { subscriptionParameters } from "./subscription-parameters";

describe("billing access", () => {
  it("keeps self-hosted installations editable after the hosted cutoff without reminders", () => {
    expect(billingAccess(0, FREE_UNTIL + 10 * 365 * 86400000, true)).toMatchObject({
      selfHosted: true,
      canEdit: true,
      remind: false,
    });
    expect(billingAccess(0, FREE_UNTIL, false).canEdit).toBe(false);
  });
  it("keeps onboarding free, starts reminders December 1, and stops unpaid edits December 8 at noon ET", () => {
    expect(billingAccess(0, BILLING_REMINDER_AT - 1)).toMatchObject({
      canEdit: true,
      remind: false,
    });
    expect(billingAccess(0, BILLING_REMINDER_AT)).toMatchObject({ canEdit: true, remind: true });
    expect(billingAccess(0, FREE_UNTIL - 1).canEdit).toBe(true);
    expect(billingAccess(0, FREE_UNTIL).canEdit).toBe(false);
  });
  it("keeps paid access until its exact expiry and suppresses reminders while covered", () => {
    const paidUntil = FREE_UNTIL + 365 * 86400000;
    expect(billingAccess(paidUntil, FREE_UNTIL)).toMatchObject({ canEdit: true, remind: false });
    expect(billingAccess(paidUntil, paidUntil - 1).canEdit).toBe(true);
    expect(billingAccess(paidUntil, paidUntil).canEdit).toBe(false);
  });
});
describe("account-linked checkout", () => {
  const checkout = {
    userId: "account-123",
    email: "founder@example.com",
    expiresAt: FREE_UNTIL + 31 * 60000,
  };
  it("links the fixed annual price to the authenticated account and billing return page", () => {
    const params = subscriptionParameters(checkout, "https://capyinc.com", FREE_UNTIL);
    expect(params.get("line_items[0][price]")).toBe(CAPY_PRICE_ID);
    expect(params.get("mode")).toBe("subscription");
    expect(params.get("subscription_data[metadata][capyUserId]")).toBe(checkout.userId);
    expect(params.get("subscription_data[metadata][capyEmail]")).toBe(checkout.email);
    expect(params.get("client_reference_id")).toBe(checkout.userId);
    expect(params.get("success_url")).toBe("https://capyinc.com/billing?checkout=success");
    expect(params.get("cancel_url")).toBe("https://capyinc.com/billing");
    expect(params.get("expires_at")).toBe(String(checkout.expiresAt / 1000));
  });
  it("never charges before December 8, including Stripe's final 48-hour trial restriction", () => {
    const early = subscriptionParameters(
      checkout,
      "https://capyinc.com",
      FREE_UNTIL - 49 * 3600000,
    );
    expect(early.get("subscription_data[trial_end]")).toBe(String(FREE_UNTIL / 1000));
    const late = subscriptionParameters(checkout, "https://capyinc.com", FREE_UNTIL - 3600000);
    expect(late.get("subscription_data[trial_period_days]")).toBe("2");
    expect(late.has("subscription_data[trial_end]")).toBe(false);
    const after = subscriptionParameters(checkout, "https://capyinc.com", FREE_UNTIL);
    expect(after.has("subscription_data[trial_period_days]")).toBe(false);
    expect(after.has("subscription_data[trial_end]")).toBe(false);
  });
});
describe("Stripe webhook authentication", () => {
  const now = Date.parse("2026-09-16T16:00:00Z");
  const body = '{"id":"evt_test","livemode":true}';
  const secret = "whsec_unit_test";
  function sign(timestamp: number) {
    return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  }
  it("accepts a fresh signature, including rotating signing keys", async () => {
    expect(await verifyStripeSignature(body, sign(now / 1000), secret, now)).toBe(true);
    expect(
      await verifyStripeSignature(body, `${sign(now / 1000)},v1=${"0".repeat(64)}`, secret, now),
    ).toBe(true);
  });
  it("rejects changed payloads, wrong secrets, expired and future replays, and missing or malformed headers", async () => {
    expect(await verifyStripeSignature(body + " ", sign(now / 1000), secret, now)).toBe(false);
    expect(await verifyStripeSignature(body, sign(now / 1000), "wrong", now)).toBe(false);
    for (const timestamp of [now / 1000 - 301, now / 1000 + 301])
      expect(await verifyStripeSignature(body, sign(timestamp), secret, now)).toBe(false);
    for (const header of ["", "t=bad,v1=bad", `t=${now / 1000},v1=zz`])
      expect(await verifyStripeSignature(body, header, secret, now)).toBe(false);
  });
});

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@capy/backend/convex/_generated/api";
import { startSubscription } from "@/server/billing";
import { FREE_UNTIL } from "@capy/equity/billing";
import Header from "@/components/header";
import "./equity.css";

function useBilling() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const update = () => setTick(Math.floor(Date.now() / 60000));
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, []);
  return useQuery(api.billing.status, { tick });
}
export function BillingPage() {
  const billing = useBilling();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const success =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("checkout") === "success";
  if (billing?.selfHosted)
    return (
      <div className="equity-app eq-auth">
        <Header />
        <main className="eq-billing-page">
          <Link to="/dashboard">← Your companies</Link>
          <section className="eq-panel" style={{ marginTop: 24 }}>
            <h1>Self-hosted Capy</h1>
            <p style={{ marginTop: 16 }}>
              Editing is enabled. This installation does not require a Capy subscription.
            </p>
          </section>
        </main>
      </div>
    );
  return (
    <div className="equity-app eq-auth">
      <Header />
      <main className="eq-billing-page">
        <Link to="/dashboard">← Your companies</Link>
        <section className="eq-panel" style={{ marginTop: 24 }}>
          <h1>Billing</h1>
          <p style={{ margin: "16px 0" }}>
            <strong>$600 / year</strong> · Unlimited stakeholders
          </p>
          {!billing ? (
            <p role="status">Loading your plan…</p>
          ) : (
            <>
              {billing.reservation ? (
                <p>
                  You already reserved Capy with this email.{" "}
                  <a href="mailto:hello@capyinc.com?subject=Connect%20my%20Capy%20reservation">
                    Contact us to connect your reservation
                  </a>
                  . Your existing billing schedule stays the same; you don’t need another
                  subscription.
                </p>
              ) : billing.subscribed ? (
                <p>
                  {billing.cancelAtPeriodEnd
                    ? "Your subscription will end at the close of the current billing period."
                    : billing.status === "trialing"
                      ? `Your plan is set up. Your first charge is ${new Date(billing.trialEnd || FREE_UNTIL).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
                      : billing.status === "active"
                        ? "Your subscription is active."
                        : "Please update your payment details in the billing portal."}
                </p>
              ) : (
                <>
                  {success && (
                    <p className="eq-status" role="status">
                      Thanks! Stripe is confirming your subscription. This page will update
                      automatically.
                    </p>
                  )}
                  <p>
                    {Date.now() < FREE_UNTIL
                      ? "Use Capy free until December 8, 2026. You can add a card whenever you’re ready. Nothing is charged before your free period ends."
                      : "Choose a plan to continue editing. Viewing and exporting your records remain available."}
                  </p>
                  {!success && billing.paidUntil <= Date.now() && (
                    <button
                      className="eq-button eq-primary"
                      style={{ marginTop: 24 }}
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          const result = await startSubscription();
                          window.location.assign(result.url);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Could not open checkout.");
                          setBusy(false);
                        }
                      }}
                    >
                      {busy
                        ? "Opening checkout…"
                        : Date.now() < FREE_UNTIL
                          ? "Set up annual plan"
                          : "Subscribe — $600/year"}
                    </button>
                  )}
                </>
              )}
              {billing.portalUrl &&
                (billing.subscribed || billing.reservation || billing.paidUntil > Date.now()) && (
                  <p style={{ marginTop: 24 }}>
                    <a className="eq-button" href={billing.portalUrl}>
                      Manage billing
                    </a>
                  </p>
                )}
              {billing.paidUntil > Date.now() && (
                <p className="eq-muted" style={{ marginTop: 16 }}>
                  Paid through {new Date(billing.paidUntil).toLocaleDateString()}.
                </p>
              )}
            </>
          )}
          {error && (
            <p className="eq-error" role="alert">
              {error}
            </p>
          )}
          <p className="eq-muted" style={{ marginTop: 24 }}>
            Cancel anytime. Your cap table stays yours to view and export.
          </p>
        </section>
      </main>
    </div>
  );
}
export function BillingNotice() {
  const billing = useBilling();
  if (
    !billing ||
    !billing.remind ||
    (billing.canEdit && (billing.subscribed || billing.reservation))
  )
    return null;
  return (
    <div className="eq-billing-notice">
      {billing.canEdit
        ? "Your free period ends December 8. Choose a plan when you’re ready."
        : "Your account is read-only. You can still view and export your records."}{" "}
      <Link to="/billing">View billing →</Link>
    </div>
  );
}

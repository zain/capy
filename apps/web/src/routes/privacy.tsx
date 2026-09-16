import { createFileRoute } from "@tanstack/react-router";
import { PublicPage } from "@/components/public/page";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy policy \u2013 Capy" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PublicPage variant="legal">
      <h1>
        <a href="/" style={{ textDecoration: "none" }}>
          Capy
        </a>
      </h1>
      <h2>Privacy policy</h2>
      <p>Last updated September 16, 2026.</p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account and billing:</strong> your email, your company name, and the payment
          details you give Stripe. We never see or store full card numbers; Stripe does.
        </li>
        <li>
          <strong>Cap table data:</strong> whatever you put into Capy: stakeholders, securities,
          documents. This is your data and we handle it only to run the service for you.
        </li>
        <li>
          <strong>Website analytics:</strong> we count page views and steps such as account creation
          and completed imports, using PostHog. We do not send cap table contents to analytics. No
          session recording, no cross-site tracking, no advertising pixels.
        </li>
      </ul>

      <h2>Import previews</h2>
      <p>
        Before you sign in, your export is read in your browser. If you continue to create an
        account, the preview is saved on this device so you can pick up where you left off. It
        expires after 24 hours and is cleared when you finish importing or sign out. Your cap table
        is sent to Capy only when you confirm the import after signing in.
      </p>

      <h2>What we don't do</h2>
      <ul>
        <li>We never sell your data.</li>
        <li>
          We never share your cap table with anyone unless you tell us to or the law requires it.
        </li>
        <li>
          We never use your data to market anything to you, your investors, or your employees.
        </li>
      </ul>

      <h2>Who processes it</h2>
      <p>
        Convex for account and cap table storage, Stripe for payments, Cloudflare for hosting and
        email routing, and PostHog for website analytics.
      </p>

      <h2>Your rights</h2>
      <p>
        You can export your data at any time. You can ask us to delete your account and everything
        in it, and we will, within 30 days, except records we're legally required to keep (such as
        invoices). Email <a href="mailto:hello@capyinc.com">hello@capyinc.com</a>.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit and at rest. Access inside the company is limited to the two
        founders and to what's needed to support you.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we'll email you first.</p>
      <footer>
        Capy is a product of Sam Dot Company. Questions:{" "}
        <a href="mailto:hello@capyinc.com">hello@capyinc.com</a>.
      </footer>
    </PublicPage>
  );
}

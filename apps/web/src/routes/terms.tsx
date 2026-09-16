import { createFileRoute } from "@tanstack/react-router";
import { PublicPage } from "@/components/public/page";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of service \u2013 Capy" }] }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <PublicPage variant="legal">
      <h1>
        <a href="/" style={{ textDecoration: "none" }}>
          Capy
        </a>
      </h1>
      <h2>Terms of service</h2>
      <p>
        Last updated September 16, 2026. These are written in plain English on purpose. If anything
        here is unclear, email us and we'll explain it.
      </p>

      <h2>What Capy is</h2>
      <p>
        Capy is cap table management software, operated by Sam Dot Company ("we", "us"). You use it
        to record and manage your company's equity. Your company's own records, board approvals, and
        signed documents remain the legal record of ownership. Capy is a tool for keeping and
        working with that record, not a substitute for it or for legal advice.
      </p>

      <h2>Accounts and billing</h2>
      <ul>
        <li>One plan: $600 per year, unlimited stakeholders, no contracts.</li>
        <li>
          Creating an account does not require a credit card. Editing is free until December 8, 2026
          at noon Eastern time. To continue editing afterward, choose the annual plan in Billing. We
          only charge you after you explicitly subscribe through checkout. Checkout shows your first
          charge date and renewal schedule before you confirm. After your free period, the plan
          renews at $600 once a year until canceled.
        </li>
        <li>
          You can cancel at any time before the first charge and pay nothing. You can cancel at any
          time after that too; the subscription ends at the end of the period you've paid for.
        </li>
        <li>
          If you're unhappy, tell us within 30 days of any charge and we'll refund it in full.
        </li>
        <li>Your price is locked. We will not raise the price on an existing subscription.</li>
      </ul>

      <h2>Your data</h2>
      <ul>
        <li>
          Your cap table data belongs to you. You can export all of it, in the Open Cap Table format
          and in common spreadsheet formats, at any time.
        </li>
        <li>We never sell, share, or use your data to market anything to you or to anyone else.</li>
        <li>
          If you stop paying, your account becomes read-only. We do not lock you out of viewing or
          exporting your own data over a missed payment.
        </li>
      </ul>

      <h2>If we shut down</h2>
      <p>
        You get at least 12 months' notice. The exporter stays online for at least 24 months after.
        The code is open source, so you can run your own copy.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Use Capy for your own company's equity records. Don't use it to break the law, to store data
        you don't have the right to store, or to attack the service.
      </p>

      <h2>Warranty and liability</h2>
      <p>
        Capy is provided as is. We work hard to keep it correct and available, but we don't
        guarantee it will be error-free. To the extent the law allows, our liability to you is
        limited to the amount you paid us in the 12 months before the claim. You're responsible for
        reviewing your cap table and having your counsel sign off on anything that matters.
      </p>

      <h2>Changes</h2>
      <p>
        If we change these terms in a way that matters, we'll email you first. Continuing to use
        Capy after that means you accept the change.
      </p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of the State of Delaware, United States.</p>
      <footer>
        Capy is a product of Sam Dot Company. Questions:{" "}
        <a href="mailto:hello@capyinc.com">hello@capyinc.com</a>.
      </footer>
    </PublicPage>
  );
}

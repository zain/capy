import { createFileRoute } from "@tanstack/react-router";
import { PublicPage } from "@/components/public/page";

const title = "Pulley alternatives after the shutdown";
const description =
  "Pulley shuts down December 8, 2026. What to export before access ends, the migration offers from Carta and other cap table tools, and how Capy compares.";

export const Route = createFileRoute("/pulley-alternative")({
  head: () => ({
    meta: [
      { title: `${title} – Capy` },
      { name: "description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://capyinc.com/pulley-alternative" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:image", content: "https://capyinc.com/og.png?v=2" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: "https://capyinc.com/og.png?v=2" },
    ],
    links: [{ rel: "canonical", href: "https://capyinc.com/pulley-alternative" }],
  }),
  component: PulleyAlternativePage,
});

const offers: { name: string; href?: string; offer: string; note: string }[] = [
  {
    name: "Carta",
    href: "https://pulley.com/guides/faq-what-is-happening-with-pulleys-shutdown",
    offer:
      "Pulley’s official partner. A new 12-month Carta contract at your Pulley price for the first year, with credit for unused prepaid time.",
    note: "Opt in by November 30. Year two is at Carta’s standard price.",
  },
  {
    name: "Capable",
    href: "https://capable.so/migrate-from-pulley",
    offer:
      "Won’t raise your price at renewal while your subscription stays active, migrates you free within 24 hours, and credits unused prepaid Pulley months (up to $3,500).",
    note: "Has a Claude and ChatGPT connector.",
  },
  {
    name: "Cake Equity",
    href: "https://www.cakeequity.com/guides/pulley-alternatives",
    offer:
      "20% off, or credit for the Pulley time you already paid for, whichever suits you, with free migration in as little as 48 hours.",
    note: "Priced by number of stakeholders.",
  },
  {
    name: "Qapita",
    href: "https://www.qapita.com/blog/pulley-shutdown-faqs",
    offer: "Charges the lower of your Pulley price or Qapita’s own.",
    note: "Priced by number of stakeholders.",
  },
  {
    name: "EquityList",
    href: "https://www.equitylist.co/blog-post/migrate-pulley-account-to-equitylist",
    offer:
      "Matches whatever is left on your Pulley contract, and your first 409A valuation is free.",
    note: "Also covers global equity.",
  },
  {
    name: "Capfolder",
    href: "https://capfolder.com/",
    offer: "Free and open source. Your cap table is a file on your own computer.",
    note: "A desktop app rather than a hosted service.",
  },
  {
    name: "A spreadsheet",
    offer: "Free. Fine for a handful of founders and one SAFE.",
    note: "You give up vesting schedules, round modeling and a stakeholder view.",
  },
];

function PulleyAlternativePage() {
  return (
    <PublicPage variant="story" analytics>
      <h1 className="landing-title">
        <a href="/" className="landing-brand" aria-label="Capy home">
          <img className="landing-brand-icon" src="/favicon-32.png" width="20" height="20" alt="" />
        </a>
        <span>Pulley alternatives after the shutdown</span>
      </h1>

      <p className="story-lead">
        Pulley shuts down on December 8, 2026. Here is what to export before you lose access, who is
        offering what, and where Capy fits. Last checked October 26, 2026.
      </p>

      <h2>The dates</h2>
      <ul>
        <li>
          <strong>September 15:</strong> Pulley{" "}
          <a href="https://techcrunch.com/2026/09/16/pulley-a-carta-rival-is-shutting-down/">
            announced it is shutting down
          </a>
          .
        </li>
        <li>
          <strong>November 30:</strong> last day to opt in to Pulley’s move to Carta.
        </li>
        <li>
          <strong>December 8:</strong> Pulley stops operating.
        </li>
        <li>
          <strong>January 31, 2027:</strong> limited access to your data in the Pulley app ends.
        </li>
      </ul>
      <p>
        Pulley has said it won’t help companies move to any provider other than Carta. Source:{" "}
        <a href="https://pulley.com/guides/faq-what-is-happening-with-pulleys-shutdown">
          Pulley’s shutdown FAQ
        </a>
        .
      </p>

      <h2>Export these before you lose access</h2>
      <p>Whatever you choose, keep your own copy. From Pulley, download:</p>
      <ul>
        <li>The full cap table export (Excel), with every security, not just the summary.</li>
        <li>Signed documents: stock purchase agreements, option grants, SAFEs and notes.</li>
        <li>Board consents and stockholder consents.</li>
        <li>409A reports and the stock plan.</li>
        <li>Vesting schedules and any exercise history.</li>
      </ul>
      <p>
        Your signed documents are the legal record of who owns what. Any cap table tool, including
        Capy, is a working copy of them.
      </p>

      <h2>Migration offers</h2>
      <p>These are the offers each company publishes on its own site. Check them for details.</p>
      <ul>
        {offers.map((o) => (
          <li key={o.name}>
            <strong>
              {o.href ? (
                <a href={o.href} target="_blank" rel="noopener noreferrer">
                  {o.name}
                </a>
              ) : (
                o.name
              )}
              :
            </strong>{" "}
            {o.offer} {o.note}
          </li>
        ))}
      </ul>

      <h2>Where Capy fits</h2>
      <p>
        We were Pulley customers too and didn’t want to move to Carta, so we built Capy. It does one
        thing: your cap table.
      </p>
      <ul>
        <li>
          <strong>$600 a year, flat.</strong> Unlimited stakeholders, no contract, free until
          December 8.
        </li>
        <li>
          <strong>One-click Pulley import.</strong> Upload Pulley’s Excel export and check the
          preview before you create an account.
        </li>
        <li>
          <strong>Open source.</strong> The code is on{" "}
          <a href="https://github.com/zain/capy">GitHub</a>. You can run your own copy, so your cap
          table never depends on us staying in business.
        </li>
        <li>
          <strong>Your data leaves when you do.</strong> Export to Excel or CSV at any time.
        </li>
        <li>
          <strong>Works with Claude.</strong> <a href="/ai">Ask about ownership</a>, model a round
          or draft a grant in plain English. Nothing changes until an admin approves it.
        </li>
        <li>
          <strong>SAFEs, options and round modeling,</strong> plus vesting, a stakeholder view of
          their own holdings, and admins you invite by link.
        </li>
      </ul>

      <h2>What Capy doesn’t do</h2>
      <ul>
        <li>No 409A valuations. Use a valuation firm, or a provider that bundles them.</li>
        <li>No e-signatures. Sign documents elsewhere and keep them in Capy’s data room.</li>
        <li>No secondary sales, tender offers or transfer agent services.</li>
        <li>No legal or tax advice. Have your lawyer sign off on anything that matters.</li>
      </ul>
      <p>
        If you need those, Carta or one of the full-suite tools above is a better fit. If you want a
        clean, cheap cap table you control, try Capy.
      </p>

      <p className="landing-cta">
        <a href="/preview">Import your Pulley cap table →</a>
      </p>

      <footer className="landing-footer">
        <div className="landing-footer-note">
          <p>
            Questions? <a href="mailto:hello@capyinc.com">hello@capyinc.com</a>
          </p>
        </div>
        <a
          className="landing-footer-github"
          href="https://github.com/zain/capy"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src="/github.svg" width="16" height="16" alt="" />
          <span>GitHub</span>
        </a>
      </footer>
    </PublicPage>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { PublicPage } from "@/components/public/page";
import { Shot } from "@/components/public/shot";

const title = "Ask Claude about your cap table";
const description =
  "Connect Capy to Claude and ask about your cap table in plain English. Capy does the math. Nothing changes until you approve it.";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: `${title} – Capy` },
      { name: "description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://capyinc.com/ai" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:image", content: "https://capyinc.com/ai/ownership.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: "https://capyinc.com/ai/ownership.webp" },
    ],
    links: [{ rel: "canonical", href: "https://capyinc.com/ai" }],
  }),
  component: AiPage,
});

function AiPage() {
  return (
    <PublicPage variant="story" analytics>
      <h1 className="landing-title">
        <a href="/" className="landing-brand" aria-label="Capy home">
          <img className="landing-brand-icon" src="/favicon-32.png" width="20" height="20" alt="" />
        </a>
        <span>
          <a href="/" className="landing-home">
            Capy
          </a>{" "}
          for Claude
        </span>
      </h1>

      <p className="story-lead">
        Ask about your cap table in plain English. Capy does the math. Nothing changes until you
        approve it.
      </p>
      <p>
        Every screenshot below is real: Claude talking to Capy about Northwind Robotics, a made-up
        company.
      </p>

      <h2>“Who owns what?”</h2>
      <Shot
        src="/ai/ownership.webp"
        width={1566}
        height={1060}
        site="claude.ai"
        alt="Claude showing Capy's ownership table for Northwind Robotics: 11,876,184 fully diluted shares, founders 58.94%, investors 27.59%."
      >
        Exact numbers from Capy, not an AI estimate.
      </Shot>

      <h2>“What needs fixing before the board meeting?”</h2>
      <Shot
        src="/ai/health-check.webp"
        width={1600}
        height={1108}
        site="claude.ai"
        alt="Claude's answer to a cap table health check: a low option pool, an unsigned consent, an expiring 409A, and a former employee's options still outstanding after the exercise window closed."
      >
        Capy catches what founders usually find too late.
      </Shot>

      <h2>“Model a $15M Series B at $80M pre.”</h2>
      <Shot
        src="/ai/round-model.webp"
        width={1566}
        height={1320}
        site="claude.ai"
        alt="Capy's round model in Claude: $6.51 per share, $95M post-money, SAFEs converting, founders going from 29.47% to 23.99%."
      >
        SAFEs convert, everyone's dilution shows up. Change the numbers right there.
      </Shot>

      <h2>“Draft a refresh grant for Priya.”</h2>
      <Shot
        src="/ai/draft.webp"
        width={1566}
        height={1235}
        site="claude.ai"
        alt="Claude's drafted grant card for Priya Natarajan, marked 'Draft · not applied yet', with before and after numbers."
      >
        Claude drafts it…
      </Shot>
      <Shot
        src="/ai/review.webp"
        width={1600}
        height={1413}
        site="capyinc.com"
        alt="The same change on Capy's review page, with who drafted it and why, before and after numbers, and Reject and Apply change buttons."
      >
        …you approve it in Capy. The AI can't change your cap table on its own.
      </Shot>

      <h2>You choose what it sees</h2>
      <Shot
        src="/ai/consent.webp"
        width={979}
        height={1577}
        site="capyinc.com"
        size="narrow"
        alt="Capy's consent screen: Connect Claude to Capy? with a company picker and an Allow drafting changes for review checkbox."
      >
        Pick the companies. Drafting is off unless you turn it on.
      </Shot>

      <h2>Set it up in 30 seconds</h2>
      <p>
        In Claude, go to <strong>Customize → Connectors → Add custom connector</strong> and paste{" "}
        <code>https://capyinc.com/mcp</code>.
      </p>
      <Shot
        src="/ai/add-connector.webp"
        width={1136}
        height={964}
        site="claude.ai"
        size="narrow"
        alt="Claude's Add custom connector dialog with the name Capy and the URL https://capyinc.com/mcp."
      />
      <p>
        <a href="/docs/mcp">Setup guide</a> · <a href="/preview">Import from Pulley →</a>
      </p>

      <footer className="landing-footer">
        <div className="landing-footer-note">
          <p>Open source. $600/yr, free until Dec 8.</p>
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

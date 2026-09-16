import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import copy from "../../../../copy.md?raw";
import { PublicPage } from "@/components/public/page";

const title = copy.trim().split("\n")[0]!.replace(/^# /, "");
const [landingBody, landingFooter] = copy.split("\n---\n");
const description =
  "We were Pulley customers too. Capy does one thing well: your cap table. Open source, exportable, $600/yr, free until Dec 8.";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      {
        name: "description",
        content:
          "Cap table management for founders. Open source, self-hostable, and exportable. Import from Pulley in one click.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://capyinc.com/" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:image", content: "https://capyinc.com/og.png?v=2" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: "https://capyinc.com/og.png?v=2" },
    ],
    links: [{ rel: "canonical", href: "https://capyinc.com/" }],
  }),
  component: Home,
});

// copy.md remains the authored landing page; React escapes all literal text.
function inline(text: string): ReactNode[] {
  return text.split(/(\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    return link ? (
      <a key={index} href={link[2]}>
        {link[1]}
      </a>
    ) : (
      part
    );
  });
}
export function LandingCopy({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  let items: ReactNode[] = [];
  const closeList = () => {
    if (items.length) blocks.push(<ul key={blocks.length}>{items}</ul>);
    items = [];
  };
  for (const raw of source.trim().split("\n")) {
    const line = raw.trim();
    if (line.startsWith("- ")) {
      items.push(<li key={items.length}>{inline(line.slice(2))}</li>);
      continue;
    }
    closeList();
    if (!line) continue;
    const key = blocks.length;
    if (line.startsWith("# "))
      blocks.push(
        <h1 className="landing-title" key={key}>
          <img className="landing-brand-icon" src="/favicon-32.png" width="20" height="20" alt="" />
          <span>{inline(line.slice(2))}</span>
        </h1>,
      );
    else if (line.startsWith("## ")) blocks.push(<h2 key={key}>{inline(line.slice(3))}</h2>);
    else if (line === "---") blocks.push(<hr key={key} />);
    else blocks.push(<p key={key}>{inline(line)}</p>);
  }
  closeList();
  return blocks;
}
function Home() {
  return (
    <PublicPage variant="landing" analytics>
      <LandingCopy source={landingBody!} />
      <footer className="landing-footer">
        <div className="landing-footer-note">
          <LandingCopy source={landingFooter || "Built for founders."} />
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

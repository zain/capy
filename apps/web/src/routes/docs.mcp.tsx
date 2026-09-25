import { createFileRoute } from "@tanstack/react-router";
import source from "../../../../docs/MCP.md?raw";
import { Markdown } from "@/components/public/markdown";
import { PublicPage } from "@/components/public/page";

const title = source.trim().split("\n")[0]!.replace(/^# /, "");
const description =
  "Connect Capy to Claude, ChatGPT, Cursor, VS Code or another AI app with its MCP server: setup, permissions, drafted changes and limits.";
// docs/MCP.md is written for GitHub; its links to other repository docs point there on the site.
const repoDocs = "https://github.com/zain/capy/blob/main/docs/";
const href = (h: string) => (/^[A-Za-z_]+\.md(#.*)?$/.test(h) ? repoDocs + h : h);

export const Route = createFileRoute("/docs/mcp")({
  head: () => ({
    meta: [
      { title: "MCP setup guide – Capy" },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: "https://capyinc.com/docs/mcp" },
    ],
    links: [{ rel: "canonical", href: "https://capyinc.com/docs/mcp" }],
  }),
  component: McpDocsPage,
});

function McpDocsPage() {
  return (
    <PublicPage variant="docs" analytics>
      <h1>
        <a href="/" style={{ textDecoration: "none" }}>
          Capy
        </a>
      </h1>
      <Markdown source={source} href={href} />
      <footer>
        <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> ·{" "}
        <a href="https://github.com/zain/capy/blob/main/docs/MCP.md">Edit on GitHub</a>. Questions:{" "}
        <a href="mailto:hello@capyinc.com">hello@capyinc.com</a>.
      </footer>
    </PublicPage>
  );
}

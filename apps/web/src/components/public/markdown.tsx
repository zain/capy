import type { ReactNode } from "react";

// A small renderer for Capy's own docs: headings, paragraphs, lists, tables, code blocks,
// **bold**, `code` and [links](…). React escapes all text; no HTML is passed through.

export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[`*]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

type Href = (href: string) => string;

function inline(text: string, href: Href): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1)
      return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={i}>{inline(part.slice(2, -2), href)}</strong>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const url = href(link[2]!);
      const external = /^https?:/.test(url);
      return (
        <a key={i} href={url} {...(external ? { rel: "noopener noreferrer" } : {})}>
          {inline(link[1]!, href)}
        </a>
      );
    }
    return part;
  });
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

/** Renders markdown headings one level down (# → h2), under the page's own h1. */
export function Markdown({ source, href = (h) => h }: { source: string; href?: Href }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const key = blocks.length;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i]!.startsWith("```"); i++) code.push(lines[i]!);
      i++;
      blocks.push(
        <pre key={key}>
          <code {...(lang ? { "data-lang": lang } : {})}>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,3}) (.*)$/.exec(line);
    if (heading) {
      const text = heading[2]!;
      const Tag = (["h2", "h3", "h4"] as const)[heading[1]!.length - 1]!;
      blocks.push(
        <Tag key={key} id={slug(text)}>
          {inline(text, href)}
        </Tag>,
      );
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      for (; i < lines.length && lines[i]!.startsWith("|"); i++)
        if (!/^\|[\s:|-]+\|$/.test(lines[i]!.trim())) rows.push(cells(lines[i]!));
      const [head, ...body] = rows;
      blocks.push(
        <div className="docs-table" key={key}>
          <table>
            <thead>
              <tr>
                {head!.map((c, j) => (
                  <th key={j}>{inline(c, href)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k}>
                  {r.map((c, j) => (
                    <td key={j}>{inline(c, href)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const item = /^(-|\d+\.) /;
    if (item.test(line)) {
      const ordered = line[0] !== "-";
      const items: ReactNode[] = [];
      for (; i < lines.length && item.test(lines[i]!); i++)
        items.push(<li key={items.length}>{inline(lines[i]!.replace(item, ""), href)}</li>);
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
      continue;
    }
    const text: string[] = [];
    for (
      ;
      i < lines.length && lines[i]!.trim() && !/^(```|#{1,3} |\||- |\d+\. )/.test(lines[i]!);
      i++
    )
      text.push(lines[i]!.trim());
    blocks.push(<p key={key}>{inline(text.join(" "), href)}</p>);
  }
  return blocks;
}

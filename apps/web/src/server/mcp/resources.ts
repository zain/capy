// capy:// resources (document files, company summaries) and the ui:// MCP Apps views.
import { RESOURCE_MIME_TYPE, registerAppResource } from "@modelcontextprotocol/ext-apps/server";
import {
  ResourceNotFoundError,
  ResourceTemplate,
  type McpServer,
  type ReadResourceTemplateCallback,
} from "@modelcontextprotocol/server";
import { api } from "@capy/backend/convex/_generated/api";
import type { Capy } from "./context";
import { Refused, toolError } from "./convex";
import { lines, link, money, percent, shares, table } from "./format";
import { OWNERSHIP_WIDGET } from "./tools/captable";
import { CHANGE_WIDGET } from "./tools/changes";
import { ROUND_WIDGET } from "./tools/planning";
import changeView from "./widgets/change.html?mcp-app";
import ownershipView from "./widgets/ownership.html?mcp-app";
import roundView from "./widgets/round.html?mcp-app";

/** Files up to this size are returned inline by resources/read. */
export const MAX_INLINE_BYTES = 8 * 1024 * 1024;
const textTypes = /^(text\/|application\/(json|xml|csv|x-yaml|yaml)\b)/i;

function base64(bytes: Uint8Array) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}
const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/**
 * A missing, forbidden or malformed resource is a resource-not-found error, not an internal one;
 * only outages stay internal errors.
 */
function reading(read: ReadResourceTemplateCallback): ReadResourceTemplateCallback {
  return async (uri, vars, ctx) => {
    try {
      return await read(uri, vars, ctx);
    } catch (error) {
      if (error instanceof Refused) throw new ResourceNotFoundError(uri.href, error.message);
      throw error;
    }
  };
}

export async function companySummary(capy: Capy, companyId: string) {
  const r = capy.absolute(
    await capy.convex.query(api.mcp.capTableSummary, { companyId, groupBy: "relationship" }),
  );
  const t = r.totals;
  return lines(
    `# ${r.company} cap table`,
    `Snapshot ${r.asOf}. [Open in Capy](${r.link})`,
    table(
      ["Total", "Shares"],
      [
        ["Outstanding stock", shares(t.outstandingStock)],
        ["Outstanding options, RSUs and warrants", shares(t.outstandingAwards)],
        ["Available in equity plans", shares(t.available)],
        ["**Fully diluted**", `**${shares(t.fullyDiluted)}**`],
      ],
    ),
    `Capital raised: ${money(t.capital)}. Unconverted SAFEs and notes: ${r.convertibles.outstanding} (${money(r.convertibles.principalOutstanding)} principal), not in fully diluted.`,
    "## Ownership by group",
    table(
      ["Group", "Shares", "% FD"],
      r.breakdown.rows.map((x) => [x.name, shares(x.shares), percent(x.percent)]),
    ),
    "## Top holders",
    table(
      ["Holder", "Shares", "% FD"],
      r.topHolders.map((h) => [link(h.name, h.link), shares(h.shares), percent(h.percent)]),
    ),
    r.classes.length > 0 && "## Share classes",
    table(
      ["Class", "Kind", "Authorized", "Outstanding", "% FD"],
      r.classes.map((c) => [
        link(c.name, c.link),
        c.kind,
        shares(c.authorized),
        shares(c.outstanding),
        percent(c.percent),
      ]),
    ),
    r.plans.length > 0 && "## Equity plans",
    table(
      ["Plan", "Authorized", "Available", "Outstanding awards", "Status"],
      r.plans.map((p) => [
        link(p.name, p.link),
        shares(p.authorized),
        shares(p.available),
        shares(p.outstandingAwards),
        p.status ?? "—",
      ]),
    ),
  );
}

export function registerResources(server: McpServer, capy: Capy) {
  const companyIds = () => capy.session.companies.map((c) => c.companyId);
  const complete = {
    companyId: (value: string) => companyIds().filter((id) => id.startsWith(value)),
  };

  server.registerResource(
    "company_summary",
    new ResourceTemplate("capy://companies/{companyId}/summary", {
      list: async () => ({
        resources: capy.session.companies.map((c) => ({
          uri: `capy://companies/${c.companyId}/summary`,
          name: `${c.name} cap table`,
          title: `${c.name} cap table summary`,
          mimeType: "text/markdown",
        })),
      }),
      complete,
    }),
    {
      title: "Cap table summary",
      description:
        "A markdown overview of one company's cap table: fully diluted totals, ownership by group, top holders, share classes and equity plans.",
      mimeType: "text/markdown",
    },
    reading(async (uri, vars) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: await companySummary(capy, capy.companyId(one(vars.companyId))),
        },
      ],
    })),
  );

  server.registerResource(
    "document",
    new ResourceTemplate("capy://companies/{companyId}/documents/{documentId}", {
      list: undefined,
      complete,
    }),
    {
      title: "Data room document",
      description:
        "A file from a company's data room. Find documents with search_documents. Files up to 8 MB are returned inline (text as text, others base64); larger files return a 15-minute download link.",
    },
    reading(async (uri, vars) => {
      const companyId = capy.companyId(one(vars.companyId));
      const documentId = one(vars.documentId);
      const d = await capy.convex.mutation(api.mcp.documentLink, { companyId, documentId });
      const mimeType = d.contentType || "application/octet-stream";
      const tooLarge = (size: number) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: `${d.filename} is ${Math.ceil(size / 1024 / 1024)} MB, too large to return here. Download it within 15 minutes: ${capy.url(d.path)}`,
          },
        ],
      });
      if (d.size !== null && d.size > MAX_INLINE_BYTES) return tooLarge(d.size);
      let file: { url: string };
      try {
        file = await capy.convex.client.query(api.mcp.redeemDownload, {
          code: d.code,
          now: Date.now(),
        });
      } catch (error) {
        throw toolError(error);
      }
      const response = await fetch(file.url);
      if (!response.ok) throw new Error("Capy couldn’t read that file. Try again in a moment.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > MAX_INLINE_BYTES) return tooLarge(bytes.length);
      return {
        contents: [
          textTypes.test(mimeType)
            ? { uri: uri.href, mimeType, text: new TextDecoder().decode(bytes) }
            : { uri: uri.href, mimeType, blob: base64(bytes) },
        ],
      };
    }),
  );

  const views: [string, string, string, string][] = [
    [
      "Ownership chart",
      OWNERSHIP_WIDGET,
      ownershipView,
      "Ownership chart and class/plan table for cap_table_summary.",
    ],
    ["Round model", ROUND_WIDGET, roundView, "Interactive priced-round model for model_round."],
    [
      "Change review",
      CHANGE_WIDGET,
      changeView,
      "Before/after card for a change drafted with draft_change.",
    ],
  ];
  for (const [name, uri, html, description] of views)
    registerAppResource(
      server,
      name,
      uri,
      { description, mimeType: RESOURCE_MIME_TYPE },
      async () => ({
        contents: [
          {
            uri,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            // No network access: every view renders only the tool result it is given.
            _meta: {
              ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: true },
            },
          },
        ],
      }),
    );
}

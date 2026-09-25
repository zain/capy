// The data room, other company records (approvals, 409As, offers…) and the activity log.
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { api } from "@capy/backend/convex/_generated/api";
import { recordKindSchema } from "@capy/equity/changes";
import type { Capy } from "../context";
import { lines, link, paging, table } from "../format";
import { asOf, companyId, limit, o, offset, page, readOnly, tool, url } from "./shared";

const recordKinds = recordKindSchema.options.filter((k) => k !== "document") as [
  string,
  ...string[],
];
const documentOut = o({
  documentId: z.string(),
  title: z.string(),
  category: z.string(),
  certificates: z.array(z.string()).describe("Certificate labels the document covers"),
  size: z.number().nullable().describe("Bytes"),
  contentType: z.string().nullable(),
  addedAt: z.string(),
  resourceUri: z.string().describe("capy:// resource that returns the file"),
  link: url,
});
export const documentUri = (companyId: string, documentId: string) =>
  `capy://companies/${companyId}/documents/${documentId}`;
const kb = (size: number | null) =>
  size === null
    ? "—"
    : size < 1024
      ? `${size} B`
      : `${Math.round(size / 1024).toLocaleString("en-US")} KB`;

/** The actor applied or rejected a draft; the app only drafted it. */
const draftOutcome = (description: string) =>
  description.startsWith("Rejected a drafted change")
    ? "rejected a draft from"
    : "applied a draft from";

export function registerRecordTools(server: McpServer, capy: Capy) {
  const { convex } = capy;

  tool(
    server,
    "search_documents",
    {
      title: "Search documents",
      description:
        "Searches a company's data room (certificates, grant agreements, board consents, SAFEs, 409A reports…) by title words, category or certificate label. Returns metadata only: documentId, category, the certificate labels each document covers, size and a capy:// resource URI, plus the category list with counts. Use get_document to get a download link or read the file.",
      input: z.object({
        companyId,
        query: z
          .string()
          .max(200)
          .optional()
          .describe("Words that must all appear in the title, category or certificates"),
        category: z
          .string()
          .max(200)
          .optional()
          .describe("Exact category name, such as Stock Certificates"),
        certificate: z.string().max(100).optional().describe("Certificate label, such as ES-12"),
        limit: limit(25, 100),
        offset,
      }),
      output: o({
        asOf,
        ...page,
        categories: z.array(o({ name: z.string(), count: z.number() })),
        documents: z.array(documentOut),
        link: url,
      }),
    },
    async (a) => {
      const r = capy.absolute(
        await convex.query(api.mcp.documents, { ...a, companyId: capy.companyId(a.companyId) }),
      );
      return {
        data: r,
        text: lines(
          r.total ? `${r.total} document${r.total === 1 ? "" : "s"} match.` : "No documents match.",
          table(
            ["Title", "documentId", "Category", "Certificates", "Size", "Added"],
            r.documents.map((d) => [
              d.title,
              d.documentId,
              d.category,
              d.certificates.join(", ") || "—",
              kb(d.size),
              d.addedAt.slice(0, 10),
            ]),
          ),
          paging(r.documents.length, r.total, r.nextOffset),
          !a.category &&
            r.categories.length > 0 &&
            "Categories: " +
              r.categories.map((c) => `${c.name || "Uncategorized"} (${c.count})`).join(", "),
          `Data room: ${r.link}`,
        ),
      };
    },
  );

  tool(
    server,
    "get_document",
    {
      title: "Get document",
      description:
        "Gets one data room document: its filename, type and size, a download URL that works for 15 minutes without signing in (give it to the user; don't fetch it yourself unless asked), and a capy:// resource link. Read the resource to get the file contents (files up to 8 MB).",
      input: z.object({
        companyId,
        documentId: z
          .string()
          .min(1)
          .describe("From search_documents, get_stakeholder or get_security"),
      }),
      output: o({
        companyId: z.string(),
        documentId: z.string(),
        filename: z.string(),
        contentType: z.string().nullable(),
        size: z.number().nullable().describe("Bytes"),
        downloadUrl: z.string().describe("Works without signing in until downloadExpiresAt"),
        downloadExpiresAt: z.string(),
        resourceUri: z.string(),
        link: url.describe("The company's data room in Capy"),
      }),
      annotations: { ...readOnly, idempotentHint: false },
    },
    async (a) => {
      const id = capy.companyId(a.companyId);
      const r = await convex.mutation(api.mcp.documentLink, {
        companyId: id,
        documentId: a.documentId,
      });
      const data = {
        companyId: id,
        documentId: a.documentId,
        filename: r.filename,
        contentType: r.contentType,
        size: r.size,
        downloadUrl: capy.url(r.path),
        downloadExpiresAt: r.expiresAt ?? "",
        resourceUri: documentUri(id, a.documentId),
        link: capy.url(`/companies/${id}/data_room`),
      };
      return {
        data,
        text: lines(
          `**${data.filename}** (${data.contentType ?? "unknown type"}, ${kb(data.size)}).`,
          `Download (expires ${data.downloadExpiresAt}): ${data.downloadUrl}`,
          `Read the file contents from the resource ${data.resourceUri}.`,
        ),
        extra: capy.resourceLinks
          ? [
              {
                type: "resource_link" as const,
                uri: data.resourceUri,
                name: data.filename,
                ...(data.contentType ? { mimeType: data.contentType } : {}),
                ...(data.size !== null ? { size: data.size } : {}),
              },
            ]
          : [],
      };
    },
  );

  tool(
    server,
    "list_records",
    {
      title: "List company records",
      description:
        "Lists a company's other records by kind: approval (board approvals), consent (stockholder consents), valuation (409A reports), offer (offer letters), fundraising (saved round scenarios), contact (external contacts such as lawyers), communication, vesting, template, draft, service or liquidity. Each record has a title, status (Draft, Recorded or Archived) and its fields (long values are clipped to 2,000 characters; truncated is true when any was). Use search_documents for files.",
      input: z.object({
        companyId,
        kind: z.enum(recordKinds).describe("Which kind of record"),
        status: z.string().max(50).optional().describe("Draft, Recorded or Archived"),
        query: z
          .string()
          .max(200)
          .optional()
          .describe("Words that must all appear in the title or fields"),
        limit: limit(25, 100),
        offset,
      }),
      output: o({
        asOf,
        kind: z.string(),
        ...page,
        records: z.array(
          o({
            recordId: z.string(),
            title: z.string(),
            status: z.string(),
            addedAt: z.string(),
            fields: z.record(z.string(), z.string()),
            truncated: z.boolean(),
          }),
        ),
        link: url,
      }),
    },
    async (a) => {
      const r = capy.absolute(
        await convex.query(api.mcp.records, { ...a, companyId: capy.companyId(a.companyId) }),
      );
      return {
        data: r,
        text: lines(
          r.total
            ? `${r.total} ${r.kind} record${r.total === 1 ? "" : "s"}.`
            : `No ${r.kind} records match.`,
          ...r.records.map((x) =>
            lines(
              `**${x.title}** · ${x.status} · added ${x.addedAt.slice(0, 10)} (recordId ${x.recordId})`,
              Object.entries(x.fields)
                .map(([k, v]) => `- ${k}: ${v.length > 300 ? v.slice(0, 299) + "…" : v}`)
                .join("\n"),
            ),
          ),
          paging(r.records.length, r.total, r.nextOffset),
          `Open in Capy: ${r.link}`,
        ),
      };
    },
  );

  tool(
    server,
    "get_activity",
    {
      title: "Get activity log",
      description:
        "The company's activity log, newest first: who changed what and when, including imports and edits. Drafts from connected AI apps that a person applied or rejected in Capy are marked via mcp with the app's name; the actor is that person, not the app. Page with the returned cursor.",
      input: z.object({
        companyId,
        limit: limit(25, 100),
        cursor: z
          .string()
          .max(2000)
          .optional()
          .describe("From a previous result, to get older entries"),
      }),
      output: o({
        asOf,
        entries: z.array(
          o({
            at: z.string(),
            actor: z.string(),
            description: z.string(),
            via: z
              .string()
              .optional()
              .describe(
                '"mcp" when the entry applied or rejected a draft from a connected AI app. The actor is the person who applied or rejected it; the app only drafted it',
              ),
            changeId: z.unknown().optional(),
            clientName: z.unknown().optional().describe("The app that drafted the change"),
          }),
        ),
        cursor: z
          .string()
          .nullable()
          .describe("Pass to get older entries; null when there are none"),
        link: url,
      }),
    },
    async (a) => {
      const r = capy.absolute(
        await convex.query(api.mcp.activity, { ...a, companyId: capy.companyId(a.companyId) }),
      );
      return {
        data: r,
        text: lines(
          table(
            ["When", "Who", "What"],
            r.entries.map((e) => [
              e.at.slice(0, 16).replace("T", " "),
              e.actor +
                (e.via ? ` (${draftOutcome(e.description)} ${e.clientName ?? "an AI app"})` : ""),
              e.description,
            ]),
          ) || "No activity yet.",
          r.cursor && `For older entries, pass cursor: ${r.cursor}`,
          link("Activity log in Capy", r.link),
        ),
      };
    },
  );
}

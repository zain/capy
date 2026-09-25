// Drafted changes: the model proposes, an admin reviews and applies in Capy. There is no apply tool.
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { api } from "@capy/backend/convex/_generated/api";
import type { Capy } from "../context";
import type { PreviewUnit } from "@capy/equity/changes";
import { lines, link, money, percent, price, shares, table } from "../format";
import { asOf, companyId, day, limit, o, tool, url } from "./shared";

export const CHANGE_WIDGET = "ui://capy/change.html";

const amount = (what: string) =>
  z.union([z.string().max(40), z.number().nonnegative()]).describe(what);
const optionGrant = z.strictObject({
  kind: z.literal("option_grant").describe("Grant options or RSUs from an equity plan"),
  stakeholderKey: z
    .string()
    .min(1)
    .describe(
      "Recipient, from find_stakeholders. Must already be in Capy: for a new hire, draft a stakeholder_update first and have an admin apply it",
    ),
  planName: z.string().min(1).describe("Exact equity plan name, from cap_table_summary"),
  shares: amount("Number of shares"),
  exercisePrice: amount("Exercise price per share in USD (use the current 409A price); 0 for RSUs"),
  grantType: z.enum(["ISO", "NSO", "RSU"]).optional(),
  issuedOn: day.describe("Grant date, YYYY-MM-DD"),
  vestingStart: day.optional().describe("Vesting commencement date; defaults to the grant date"),
  vestingSchedule: z
    .string()
    .max(200)
    .optional()
    .describe('Such as "1/48 monthly, 25% vest at 12 month cliff"'),
  certificate: z
    .string()
    .max(100)
    .optional()
    .describe("Certificate label; defaults to the next free one in the series, such as ES-13"),
  expirationDate: day.optional(),
  earlyExercise: z.boolean().optional(),
  boardApprovalDate: day.optional(),
});
const exercise = z.strictObject({
  kind: z.literal("exercise").describe("Exercise vested (or early-exercisable) options into stock"),
  securityKey: z.string().min(1).describe("The option's securityKey"),
  shares: amount("Number of options to exercise"),
  date: day.describe("Exercise date"),
  certificate: z
    .string()
    .min(1)
    .max(100)
    .describe("Label for the new stock certificate, such as CS-10"),
});
const cancellation = z.strictObject({
  kind: z.literal("cancellation").describe("Cancel some or all of a security"),
  securityKey: z.string().min(1),
  shares: amount("Number of shares to cancel"),
  date: day.describe("Cancellation date"),
});
const stakeholderUpdate = z.strictObject({
  kind: z
    .literal("stakeholder_update")
    .describe(
      "Update a stakeholder's details, or add a new stakeholder when stakeholderKey is omitted",
    ),
  stakeholderKey: z.string().min(1).optional().describe("Omit to add a new stakeholder"),
  patch: z.strictObject({
    name: z.string().min(1).max(300).optional().describe("Required for a new stakeholder"),
    email: z.string().max(300).optional(),
    relationship: z.string().max(100).optional().describe("Founder, Employee, Investor, Advisor…"),
    fields: z
      .record(z.string().max(200), z.string().max(20000).nullable())
      .optional()
      .describe(
        'Other fields, such as {"Title": "CTO", "Termination Date": "2026-10-01"}; null clears one',
      ),
  }),
});
const boardConsent = z.strictObject({
  kind: z.literal("board_consent").describe("Save a draft board consent to Board Approvals"),
  title: z.string().min(1).max(300),
  effectiveDate: day.optional(),
  boardMembers: z.string().max(2000).optional().describe("Directors who need to sign"),
  text: z.string().min(1).max(100000).describe("The consent's resolutions"),
});
const roundScenario = z.strictObject({
  kind: z
    .literal("round_scenario")
    .describe("Save a round model to Fundraising; the cap table does not change"),
  preMoney: amount("Pre-money valuation, USD"),
  investment: amount("Investment, USD"),
  title: z.string().min(1).max(300).optional(),
});
export const changeInput = z.discriminatedUnion("kind", [
  optionGrant,
  exercise,
  cancellation,
  stakeholderUpdate,
  boardConsent,
  roundScenario,
]);

const totals = o({
  outstandingStock: z.string(),
  outstandingAwards: z.string(),
  available: z.string(),
  fullyDiluted: z.string(),
  capital: z.string(),
  stakeholdersWithSecurities: z.number(),
});
const pct2 = z.string().describe("Percent of fully diluted shares, 0–100");
const units = ["shares", "usd", "price", "text"] as const satisfies readonly PreviewUnit[];
const preview = o({
  title: z.string(),
  summary: z.string(),
  values: z
    .array(
      o({
        label: z.string(),
        before: z.string().optional().describe("Absent when the change adds something new"),
        after: z.string(),
        unit: z.enum(units).describe("shares, usd, price (USD per share) or text"),
      }),
    )
    .describe("The values the change sets, before and after"),
  totalsBefore: totals,
  totalsAfter: totals,
  ownership: z
    .array(o({ name: z.string(), before: pct2, after: pct2 }))
    .optional()
    .describe("Percent of fully diluted shares before and after, for affected holders"),
  warnings: z.array(z.string()),
});
const status = z.enum(["pending", "applied", "rejected", "expired", "failed"]);

type Preview = z.infer<typeof preview>;
/** Drafts saved before previews had typed values show no value table. */
const normalize = (p: unknown) => ({ ...(p as Preview), values: (p as Preview).values ?? [] });
function shown(v: string | undefined, unit: PreviewUnit) {
  if (!v) return "—";
  if (unit === "text" || !/^-?\d+(\.\d+)?$/.test(v)) return v;
  return unit === "usd" ? money(v) : unit === "price" ? price(v) : shares(v);
}
function describe(p: Preview) {
  const hasBefore = p.values.some((x) => x.before !== undefined);
  return lines(
    p.summary,
    p.values.length &&
      (hasBefore
        ? table(
            ["", "Before", "After"],
            p.values.map((x) => [x.label, shown(x.before, x.unit), shown(x.after, x.unit)]),
          )
        : table(
            ["", "Value"],
            p.values.map((x) => [x.label, shown(x.after, x.unit)]),
          )),
    p.ownership?.length &&
      table(
        ["Holder", "% FD before", "% FD after"],
        p.ownership.map((x) => [x.name, percent(x.before), percent(x.after)]),
      ),
    p.totalsBefore.fullyDiluted !== p.totalsAfter.fullyDiluted &&
      `Fully diluted: ${shares(p.totalsBefore.fullyDiluted)} → ${shares(p.totalsAfter.fullyDiluted)} shares.`,
    p.warnings.length && "Warnings:\n" + p.warnings.map((w) => `- ${w}`).join("\n"),
  );
}

export function registerChangeTools(server: McpServer, capy: Capy) {
  const { convex } = capy;

  tool(
    server,
    "draft_change",
    {
      title: "Draft a change for review",
      description:
        "Drafts a cap table change for a company admin to review and apply in Capy: an option or RSU grant, an option exercise, a cancellation, a stakeholder update or new stakeholder, a draft board consent, or a saved round scenario. Capy validates it against the current cap table with the same rules as its editor and returns a preview (before/after values, fully diluted totals, ownership impact, warnings) and a review link. NOTHING CHANGES until an admin applies it in Capy. Tell the user it is drafted and share the review link; never say the change was made. Validation errors list every problem at once. Look up keys first (find_stakeholders, get_stakeholder, cap_table_summary for plan names). An option_grant needs an existing stakeholderKey: for someone not in Capy yet, draft a stakeholder_update without stakeholderKey, and ask an admin to apply it before drafting the grant. Drafting must be turned on for this connection and the user must be an admin (list_companies shows canDraft); if it is off, tell the user to turn it on in Capy under Account → Connected apps.",
      input: z.object({
        companyId,
        change: changeInput.describe("The change, by kind"),
        rationale: z
          .string()
          .min(1)
          .max(5000)
          .describe(
            "Why this change is being made and its source (e.g. the offer letter or board approval), shown to the reviewer",
          ),
      }),
      output: o({
        companyId: z.string(),
        changeId: z.string(),
        title: z.string(),
        status,
        preview,
        expiresAt: z.string().nullable().describe("A pending draft expires after 7 days"),
        reviewPath: url,
        link: url.describe("Where an admin reviews and applies the change"),
        asOf,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      widget: CHANGE_WIDGET,
    },
    async (a) => {
      const id = capy.companyId(a.companyId);
      const r = capy.absolute(
        await convex.mutation(api.mcp.draftChange, {
          companyId: id,
          input: a.change,
          rationale: a.rationale,
        }),
      );
      return {
        data: { companyId: id, ...r, preview: normalize(r.preview) },
        text: lines(
          `Drafted for review. Nothing on the cap table has changed yet: an admin must review and apply it in Capy.`,
          `**${r.title}** (changeId ${r.changeId})`,
          describe(normalize(r.preview)),
          `Review and apply: ${r.link}${r.expiresAt ? ` (expires ${r.expiresAt.slice(0, 10)})` : ""}`,
        ),
      };
    },
  );

  tool(
    server,
    "list_changes",
    {
      title: "List drafted changes",
      description:
        "Lists changes drafted for review in a company, newest first, with status: pending (waiting for an admin in Capy), applied, rejected, expired (pending for 7 days) or failed (the cap table changed so it no longer applies). Use get_change for the preview and outcome.",
      input: z.object({
        companyId,
        status: status.optional().describe("Only changes with this status"),
        limit: limit(25, 100),
      }),
      output: o({
        asOf,
        changes: z.array(
          o({
            changeId: z.string(),
            kind: z.string(),
            title: z.string(),
            status,
            draftedBy: z.string(),
            clientName: z.string().nullable(),
            draftedAt: z.string().nullable(),
            expiresAt: z.string().nullable(),
            reviewedAt: z.string().nullable(),
            error: z.string().nullable(),
            link: url,
          }),
        ),
        link: url,
      }),
    },
    async (a) => {
      const r = capy.absolute(
        await convex.query(api.mcp.changes, { ...a, companyId: capy.companyId(a.companyId) }),
      );
      return {
        data: r,
        text:
          table(
            ["Change", "changeId", "Status", "Drafted", "By"],
            r.changes.map((c) => [
              link(c.title, c.link),
              c.changeId,
              c.status + (c.error ? ` (${c.error})` : ""),
              c.draftedAt?.slice(0, 10),
              c.draftedBy + (c.clientName ? ` via ${c.clientName}` : ""),
            ]),
          ) || "No drafted changes.",
      };
    },
  );

  tool(
    server,
    "get_change",
    {
      title: "Get drafted change",
      description:
        "One drafted change: its input, the rationale, the preview (from when it was drafted, or of what was written once applied), and for pending changes a preview recomputed against today's cap table (current), whether the cap table changed since (stale), and whether it can still be applied. For applied, rejected or failed changes, who reviewed it and the result, rejection reason or error.",
      input: z.object({
        companyId,
        changeId: z.string().min(1).describe("From draft_change or list_changes"),
      }),
      output: o({
        asOf,
        changeId: z.string(),
        kind: z.string(),
        title: z.string(),
        status,
        rationale: z.string(),
        input: z.unknown(),
        draftedBy: z.string(),
        clientName: z.string().nullable(),
        draftedAt: z.string().nullable(),
        expiresAt: z.string().nullable(),
        preview,
        current: o({
          ok: z.boolean(),
          preview: preview.optional(),
          errors: z.array(z.string()).optional(),
        }).nullable(),
        stale: z.boolean(),
        staleReason: z.string().nullable(),
        canApply: z.boolean().describe("Whether an admin could apply it in Capy now"),
        reviewedBy: z.string().nullable(),
        reviewedAt: z.string().nullable(),
        result: z.unknown(),
        error: z.string().nullable(),
        link: url,
      }),
    },
    async (a) => {
      const r = capy.absolute(
        await convex.query(api.mcp.change, { ...a, companyId: capy.companyId(a.companyId) }),
      );
      const raw = r.current as { ok: boolean; preview?: unknown; errors?: string[] } | null;
      const current: { ok: boolean; preview?: Preview; errors?: string[] } | null = raw && {
        ok: raw.ok,
        ...(raw.preview ? { preview: normalize(raw.preview) } : {}),
        ...(raw.errors ? { errors: raw.errors } : {}),
      };
      const reason = r.status === "rejected" && (r.result as { reason?: string } | null)?.reason;
      return {
        data: { ...r, preview: normalize(r.preview), current },
        text: lines(
          `**${link(r.title, r.link)}** · ${r.status} · drafted ${r.draftedAt?.slice(0, 10) ?? ""} by ${r.draftedBy}${r.clientName ? ` via ${r.clientName}` : ""}`,
          `Rationale: ${r.rationale}`,
          describe(current?.ok && current.preview ? current.preview : normalize(r.preview)),
          current &&
            !current.ok &&
            "It no longer applies:\n" + (current.errors ?? []).map((e) => `- ${e}`).join("\n"),
          r.stale && r.staleReason,
          r.status === "pending" &&
            (r.canApply
              ? `An admin can apply it in Capy: ${r.link}`
              : `It can’t be applied as is. Review it in Capy: ${r.link}`),
          r.reviewedBy && `Reviewed by ${r.reviewedBy} on ${r.reviewedAt?.slice(0, 10)}.`,
          reason && `Reason: ${reason}`,
          r.error && `Error: ${r.error}`,
        ),
      };
    },
  );
}

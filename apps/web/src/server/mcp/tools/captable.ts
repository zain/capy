// Companies, the cap table overview, stakeholders, securities and convertibles.
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { api } from "@capy/backend/convex/_generated/api";
import type { Capy } from "../context";
import { money, lines, link, paging, percent, price, shares, table } from "../format";
import { asOf, companyId, dec, limit, o, offset, page, pct, tool, url } from "./shared";

export const OWNERSHIP_WIDGET = "ui://capy/ownership.html";

const totals = o({
  outstandingStock: dec("Issued and outstanding stock (shares)"),
  outstandingAwards: dec("Outstanding options, RSUs, warrants and profits interests (shares)"),
  available: dec("Shares still available to grant under equity plans"),
  fullyDiluted: dec(
    "Stock + awards + available plan shares. Excludes unconverted SAFEs and notes.",
  ),
  capital: dec("Capital raised in USD, including outstanding convertible principal"),
  stakeholdersWithSecurities: z.number(),
});
const documentOut = o({
  documentId: z.string(),
  title: z.string(),
  category: z.string(),
  certificates: z.array(z.string()),
  size: z.number().nullable().describe("Bytes"),
  contentType: z.string().nullable(),
  addedAt: z.string(),
  resourceUri: z.string().describe("capy:// resource to read the file"),
  link: url,
});
const holdingOut = o({
  securityKey: z.string().describe("Unique key; use with get_security"),
  certificate: z.string().describe("Certificate label. Not unique across classes."),
  kind: z.string().describe("share, option, rsa, rsu, warrant, safe, note or piu"),
  className: z.string(),
  planName: z.string(),
  status: z.string(),
  issued: dec("Shares, or USD principal for SAFEs and notes"),
  outstanding: dec("Shares, or USD principal for SAFEs and notes"),
  price: z.string().nullable().describe("Price or exercise price per share, USD"),
  vested: z.string().nullable().describe("Vested shares on vestedAsOf; null when unknown"),
  vestedAsOf: z.string().nullable(),
  issuedOn: z.string(),
  vestingStart: z.string(),
  vestingSchedule: z.string(),
  link: url,
});
const postTermination = o({
  deadline: z.string().nullable().describe("Last day to exercise after termination (YYYY-MM-DD)"),
  basis: z.string(),
});

const kinds: Record<string, string> = {
  share: "Stock",
  option: "Option",
  rsa: "RSA",
  rsu: "RSU",
  warrant: "Warrant",
  safe: "SAFE",
  note: "Note",
  piu: "Profits interest",
};
export const kindLabel = (kind: string) => kinds[kind] ?? kind;
const convertible = (kind: string) => kind === "safe" || kind === "note";
const amount = (kind: string, value: string | null) =>
  convertible(kind) ? money(value) : shares(value);

export function registerCapTableTools(server: McpServer, capy: Capy) {
  const { convex } = capy;

  tool(
    server,
    "list_companies",
    {
      title: "List companies",
      description:
        "Lists the companies this connection can see, with the user's role, whether drafting changes is allowed, and each cap table's snapshot date. Call this first when you need a companyId. Other tools accept companyId optionally when there is only one company.",
      input: z.object({}),
      output: o({
        user: o({ name: z.string(), email: z.string() }),
        connection: o({
          clientName: z.string().nullable(),
          allowDrafts: z
            .boolean()
            .describe("True when draft_change is available for at least one company"),
        }),
        companies: z.array(
          o({
            companyId: z.string(),
            name: z.string(),
            role: z.string().describe("admin or viewer"),
            isOwner: z.boolean(),
            canEdit: z.boolean().describe("False when the account is read-only (billing)"),
            canDraft: z.boolean(),
            asOf,
            link: url,
          }),
        ),
      }),
    },
    async () => {
      // Fresh, not the Worker's cached session, so a revoked connection lists nothing.
      const s = await capy.convex.query(api.mcp.session, {});
      const companies = capy.absolute(s.companies);
      return {
        data: {
          user: s.user,
          connection: { clientName: s.clientName, allowDrafts: s.allowDrafts },
          companies,
        },
        text: lines(
          `Signed in as ${s.user.name || s.user.email}.`,
          companies.length
            ? table(
                ["Company", "companyId", "Role", "Snapshot", "Can draft"],
                companies.map((c) => [
                  link(c.name, c.link),
                  c.companyId,
                  c.role,
                  c.asOf,
                  c.canDraft ? "yes" : "no",
                ]),
              )
            : "No companies with a cap table are shared with this connection. The user can add one in Capy under Account → Connected apps.",
        ),
      };
    },
  );

  tool(
    server,
    "cap_table_summary",
    {
      title: "Cap table summary",
      description:
        "Fully diluted totals and an ownership breakdown for one company: by relationship group (default), share class, equity plan or stakeholder, plus share classes, equity plans with available shares, and the top holders. Share counts and USD amounts are decimal strings; percents are of fully diluted shares. Unconverted SAFEs and notes are reported separately and are not in fully diluted. Use this for 'who owns what', pool size and dilution questions.",
      input: z.object({
        companyId,
        groupBy: z
          .enum(["relationship", "class", "plan", "stakeholder"])
          .optional()
          .describe(
            "How to break down ownership: relationship group (Founders, Employees, Investors…), share class, equity plan, or each stakeholder. Default relationship.",
          ),
        limit: limit(25, 200),
      }),
      output: o({
        companyId: z.string(),
        company: z.string(),
        asOf,
        totals,
        convertibles: o({
          outstanding: z.number().describe("Unconverted SAFEs and notes"),
          principalOutstanding: dec("USD"),
          note: z.string(),
        }),
        groupBy: z.string(),
        breakdown: o({
          rows: z.array(
            o({
              key: z.string(),
              name: z.string(),
              shares: dec("Fully diluted shares"),
              percent: pct,
              link: url.nullable(),
            }),
          ),
          total: z.number(),
        }),
        classes: z.array(
          o({
            name: z.string(),
            kind: z.string(),
            authorized: z.string().nullable(),
            outstanding: dec("Outstanding shares of this class"),
            reportedOutstanding: z.string().nullable(),
            percent: pct,
            link: url,
          }),
        ),
        classCount: z.number(),
        plans: z.array(
          o({
            name: z.string(),
            className: z.string(),
            authorized: dec("Shares reserved"),
            available: dec("Shares still available to grant"),
            outstandingAwards: dec("Outstanding awards granted from the plan"),
            issuedFromPlan: dec("Authorized minus available, including exercised shares"),
            availablePercentOfPlan: z.string(),
            status: z.string().nullable(),
            percent: pct,
            link: url,
          }),
        ),
        planCount: z.number(),
        topHolders: z.array(
          o({
            kind: z.enum(["stakeholder", "plan"]),
            key: z.string(),
            name: z.string(),
            shares: dec("Fully diluted shares"),
            percent: pct,
            link: url,
          }),
        ),
        link: url,
      }),
      widget: OWNERSHIP_WIDGET,
    },
    async (a) => {
      const r = capy.absolute(
        await convex.query(api.mcp.capTableSummary, {
          ...a,
          companyId: capy.companyId(a.companyId),
        }),
      );
      const t = r.totals;
      const label = { relationship: "Group", class: "Class", plan: "Plan", stakeholder: "Holder" }[
        r.groupBy
      ];
      return {
        data: r,
        text: lines(
          `**${link(r.company, r.link)}** cap table, snapshot ${r.asOf}.`,
          `Fully diluted: ${shares(t.fullyDiluted)} shares (stock ${shares(t.outstandingStock)}, awards ${shares(t.outstandingAwards)}, available in plans ${shares(t.available)}). Capital raised ${money(t.capital)}.`,
          r.convertibles.outstanding > 0 &&
            `${r.convertibles.outstanding} unconverted SAFEs/notes with ${money(r.convertibles.principalOutstanding)} principal are not in fully diluted.`,
          table(
            [label ?? "Row", "Shares", "% FD"],
            r.breakdown.rows.map((x) => [
              link(x.name, x.link),
              shares(x.shares),
              percent(x.percent),
            ]),
          ),
          r.breakdown.rows.length < r.breakdown.total &&
            `${paging(r.breakdown.rows.length, r.breakdown.total)} ${
              r.groupBy === "stakeholder"
                ? "Pass a higher limit (max 200), or page through everyone with find_stakeholders and offset."
                : "Pass a higher limit (max 200) for more."
            }`,
          r.plans.length &&
            table(
              ["Plan", "Authorized", "Available", "Outstanding awards", "Status"],
              r.plans.map((p) => [
                p.name,
                shares(p.authorized),
                `${shares(p.available)} (${percent(p.availablePercentOfPlan)} of plan)`,
                shares(p.outstandingAwards),
                p.status ?? "—",
              ]),
            ),
          r.groupBy !== "stakeholder" &&
            r.topHolders.length &&
            "Top holders:\n\n" +
              table(
                ["Holder", "Key", "Shares", "% FD"],
                r.topHolders.map((h) => [
                  link(h.name, h.link),
                  h.kind === "plan" ? "(plan pool)" : h.key,
                  shares(h.shares),
                  percent(h.percent),
                ]),
              ),
        ),
      };
    },
  );

  tool(
    server,
    "find_stakeholders",
    {
      title: "Find stakeholders",
      description:
        "Searches a company's stakeholders by name, email or external ID, optionally filtered by relationship (Founder, Employee, Investor, Advisor… or a group such as 'Former Employees') and whether they hold anything outstanding. Returns each match's stakeholderKey, fully diluted shares and percent, sorted by shares. Use it to get the stakeholderKey for get_stakeholder or draft_change.",
      input: z.object({
        companyId,
        query: z
          .string()
          .max(200)
          .optional()
          .describe("Words that must all appear in the name, email, external ID or key"),
        relationship: z
          .string()
          .max(100)
          .optional()
          .describe("Relationship or group, such as Employee, Investor, Former Employees"),
        hasHoldings: z
          .boolean()
          .optional()
          .describe("true: only people holding outstanding securities; false: only people without"),
        limit: limit(25, 100),
        offset,
      }),
      output: o({
        asOf,
        ...page,
        stakeholders: z.array(
          o({
            stakeholderKey: z.string(),
            name: z.string(),
            email: z.string().nullable(),
            relationship: z.string(),
            group: z.string(),
            entityType: z.string().nullable(),
            fullyDilutedShares: dec("Fully diluted shares"),
            percent: pct,
            outstandingSecurities: z.number(),
            link: url,
          }),
        ),
      }),
    },
    async (a) => {
      const r = capy.absolute(
        await convex.query(api.mcp.findStakeholders, {
          ...a,
          companyId: capy.companyId(a.companyId),
        }),
      );
      return {
        data: r,
        text: lines(
          r.total
            ? `${r.total} stakeholder${r.total === 1 ? "" : "s"} match.`
            : "No stakeholders match.",
          table(
            ["Name", "stakeholderKey", "Relationship", "Email", "FD shares", "% FD"],
            r.stakeholders.map((p) => [
              link(p.name, p.link),
              p.stakeholderKey,
              p.relationship || p.group,
              p.email,
              shares(p.fullyDilutedShares),
              percent(p.percent),
            ]),
          ),
          paging(r.stakeholders.length, r.total, r.nextOffset),
        ),
      };
    },
  );

  tool(
    server,
    "get_stakeholder",
    {
      title: "Get stakeholder",
      description:
        "One stakeholder's profile, contact details, employment and termination dates, ownership, every holding (with vested shares today, and the post-termination exercise deadline for options), and documents that list their certificates. Get the stakeholderKey from find_stakeholders.",
      input: z.object({
        companyId,
        stakeholderKey: z.string().min(1).describe("From find_stakeholders"),
      }),
      output: o({
        asOf,
        stakeholderKey: z.string(),
        name: z.string(),
        email: z.string().nullable(),
        relationship: z.string(),
        group: z.string(),
        entityType: z.string().nullable(),
        externalId: z.string().nullable(),
        contact: o({
          phone: z.string().nullable(),
          address: z.string().nullable(),
          title: z.string().nullable(),
          department: z.string().nullable(),
        }),
        employment: o({
          hireDate: z.string().nullable(),
          terminationDate: z.string().nullable(),
          terminationType: z.string().nullable(),
        }),
        fields: z.record(z.string(), z.string()).describe("Other imported fields, clipped"),
        ownership: o({
          fullyDilutedShares: dec("Fully diluted shares"),
          percent: pct,
          outstandingStock: dec("Shares"),
          outstandingAwards: dec("Shares"),
          convertiblePrincipal: dec("USD"),
        }),
        holdings: z.array(
          holdingOut.extend({
            postTermination: postTermination.optional(),
            terms: o({}).optional(),
          }),
        ),
        holdingCount: z.number(),
        documents: z.array(documentOut),
        documentCount: z.number(),
        link: url,
      }),
    },
    async (a) => {
      const r = capy.absolute(
        await convex.query(api.mcp.stakeholder, { ...a, companyId: capy.companyId(a.companyId) }),
      );
      const deadlines = r.holdings.filter(
        (h) => "postTermination" in h && h.postTermination?.deadline,
      );
      return {
        data: r,
        text: lines(
          `**${link(r.name, r.link)}** (${r.stakeholderKey}) · ${r.relationship || r.group}${r.email ? ` · ${r.email}` : ""}`,
          `Holds ${shares(r.ownership.fullyDilutedShares)} fully diluted shares (${percent(r.ownership.percent)}): stock ${shares(r.ownership.outstandingStock)}, awards ${shares(r.ownership.outstandingAwards)}${r.ownership.convertiblePrincipal !== "0" ? `, convertible principal ${money(r.ownership.convertiblePrincipal)}` : ""}. Snapshot ${r.asOf}.`,
          (r.employment.hireDate || r.employment.terminationDate) &&
            [
              r.employment.hireDate && `Hired ${r.employment.hireDate}.`,
              r.employment.terminationDate &&
                `Terminated ${r.employment.terminationDate}${r.employment.terminationType ? ` (${r.employment.terminationType})` : ""}.`,
            ]
              .filter(Boolean)
              .join(" "),
          table(
            [
              "Certificate",
              "securityKey",
              "Kind",
              "Class / plan",
              "Outstanding",
              "Vested",
              "Price",
              "Status",
            ],
            r.holdings.map((h) => [
              link(h.certificate || "—", h.link),
              h.securityKey,
              kindLabel(h.kind),
              h.planName || h.className,
              amount(h.kind, h.outstanding),
              h.vested === null ? "—" : `${shares(h.vested)} on ${h.vestedAsOf}`,
              price(h.price),
              h.status,
            ]),
          ),
          paging(r.holdings.length, r.holdingCount),
          deadlines.length &&
            deadlines
              .map(
                (h) =>
                  `${h.certificate}: exercise by ${h.postTermination!.deadline} (${h.postTermination!.basis}).`,
              )
              .join("\n"),
          r.documents.length &&
            "Documents:\n" +
              r.documents.map((d) => `- ${d.title} (documentId ${d.documentId})`).join("\n"),
        ),
      };
    },
  );

  tool(
    server,
    "get_security",
    {
      title: "Get security",
      description:
        "Full detail for one security (stock certificate, option, RSU, warrant, SAFE or note): holder, amounts, price, vesting schedule, vested shares today, vesting events (first, next and last 12), SAFE/note terms, the post-termination exercise deadline for options, imported fields and linked documents. Pass securityKey when you have it. Certificate labels are not unique, so a certificate lookup returns every match.",
      input: z.object({
        companyId,
        securityKey: z
          .string()
          .optional()
          .describe("Unique security key from get_stakeholder or other results"),
        certificate: z.string().optional().describe("Certificate label such as ES-12 or CS-3"),
      }),
      output: o({
        asOf,
        total: z.number().describe("Securities matching; up to 20 are returned"),
        note: z.string().optional(),
        securities: z.array(
          holdingOut.extend({
            capital: z.string().nullable(),
            recordedVested: z.string().nullable(),
            balanceAsOf: z.string(),
            holder: o({
              stakeholderKey: z.string(),
              name: z.string().nullable(),
              link: url.nullable(),
            }),
            terms: o({}).optional().describe("SAFE and note terms"),
            postTermination: postTermination.optional(),
            vestEvents: o({
              count: z.number(),
              totalShares: z.string(),
              first: z.array(o({ date: z.string(), shares: z.string() })),
              next: z.array(o({ date: z.string(), shares: z.string() })),
              last: z.array(o({ date: z.string(), shares: z.string() })),
            }).nullable(),
            fields: z.record(z.string(), z.string()),
            documents: z.array(documentOut),
            documentCount: z.number(),
          }),
        ),
      }),
    },
    async (a) => {
      const r = capy.absolute(
        await convex.query(api.mcp.security, { ...a, companyId: capy.companyId(a.companyId) }),
      );
      const blocks = r.securities.map((s) => {
        const facts: [string, unknown][] = [
          ["securityKey", s.securityKey],
          [
            "Holder",
            s.holder.name
              ? `${s.holder.name} (${s.holder.stakeholderKey})`
              : s.holder.stakeholderKey,
          ],
          ["Kind", kindLabel(s.kind)],
          ["Class", s.className || "—"],
          ["Plan", s.planName || "—"],
          ["Status", s.status],
          ["Issued", `${amount(s.kind, s.issued)} on ${s.issuedOn || "—"}`],
          ["Outstanding", amount(s.kind, s.outstanding)],
          ["Price per share", price(s.price)],
        ];
        if (!convertible(s.kind)) {
          facts.push([
            "Vested",
            s.vested === null ? "unknown" : `${shares(s.vested)} on ${s.vestedAsOf}`,
          ]);
          if (s.vestingSchedule)
            facts.push(["Vesting", `${s.vestingSchedule} from ${s.vestingStart || "—"}`]);
        }
        if (s.postTermination?.deadline)
          facts.push(["Exercise by", `${s.postTermination.deadline} (${s.postTermination.basis})`]);
        if (s.terms)
          for (const [k, v] of Object.entries(s.terms as Record<string, unknown>))
            if (v !== null && k !== "principal" && k !== "outstanding") facts.push([k, v]);
        if (s.vestEvents?.next.length)
          facts.push([
            "Next vesting",
            s.vestEvents.next
              .slice(0, 6)
              .map((e) => `${e.date}: ${shares(e.shares)}`)
              .join(", "),
          ]);
        const fields = Object.entries(s.fields);
        return lines(
          `### ${link(s.certificate || s.securityKey, s.link)}`,
          table(["Field", "Value"], facts),
          fields.length &&
            "Imported fields: " +
              fields
                .map(([k, v]) => `${k}: ${v}`)
                .join("; ")
                .slice(0, 1500),
          s.documents.length &&
            "Documents: " +
              s.documents.map((d) => `${d.title} (documentId ${d.documentId})`).join("; "),
        );
      });
      return {
        data: r,
        text: lines(
          r.note,
          ...blocks,
          r.total > r.securities.length && `Showing ${r.securities.length} of ${r.total} matches.`,
        ),
      };
    },
  );

  tool(
    server,
    "list_convertibles",
    {
      title: "List SAFEs and notes",
      description:
        "Lists a company's SAFEs and convertible notes with holder, principal and outstanding amounts in USD, valuation cap (null when the cap is text such as 'Uncapped'; see valuationCapText), discount, post/pre-money type, interest, maturity, MFN and pro rata. Unconverted SAFEs and notes are not part of fully diluted shares; use model_round to see how they would convert.",
      input: z.object({
        companyId,
        status: z
          .string()
          .max(50)
          .optional()
          .describe("Filter by status, such as Outstanding or Converted"),
        limit: limit(50, 200),
        offset,
      }),
      output: o({
        asOf,
        summary: o({
          outstanding: z.number(),
          principalOutstanding: dec("USD"),
          note: z.string(),
        }),
        ...page,
        convertibles: z.array(
          o({
            securityKey: z.string(),
            certificate: z.string(),
            kind: z.string(),
            holder: z.string().nullable(),
            stakeholderKey: z.string(),
            status: z.string(),
            issuedOn: z.string(),
            principal: dec("USD"),
            outstanding: dec("USD"),
            interestOutstanding: z.string().nullable(),
            valuationCap: z.string().nullable().describe("USD; null when not a number"),
            valuationCapText: z.string().nullable(),
            discountPercent: z.string().nullable(),
            conversionType: z.string().nullable(),
            interestRate: z.string().nullable(),
            maturityDate: z.string().nullable(),
            mfn: z.string().nullable(),
            proRata: z.string().nullable(),
            link: url,
          }),
        ),
        link: url,
      }),
    },
    async (a) => {
      const r = capy.absolute(
        await convex.query(api.mcp.convertibles, { ...a, companyId: capy.companyId(a.companyId) }),
      );
      return {
        data: r,
        text: lines(
          `${r.summary.outstanding} outstanding SAFEs/notes, ${money(r.summary.principalOutstanding)} principal. They are not in fully diluted shares.`,
          table(
            [
              "Certificate",
              "securityKey",
              "Holder",
              "Kind",
              "Outstanding",
              "Cap",
              "Discount",
              "Type",
              "Issued",
              "Status",
            ],
            r.convertibles.map((c) => [
              link(c.certificate, c.link),
              c.securityKey,
              c.holder,
              kindLabel(c.kind),
              money(c.outstanding),
              c.valuationCap ? money(c.valuationCap) : (c.valuationCapText ?? "—"),
              c.discountPercent ? `${c.discountPercent}%` : "—",
              c.conversionType,
              c.issuedOn,
              c.status,
            ]),
          ),
          paging(r.convertibles.length, r.total, r.nextOffset),
        ),
      };
    },
  );
}

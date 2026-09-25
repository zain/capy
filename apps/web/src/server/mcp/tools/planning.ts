// Forward-looking tools: vesting forecasts, round modeling and the cap table health check.
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { api } from "@capy/backend/convex/_generated/api";
import type { Capy } from "../context";
import { lines, link, money, paging, percent, price, shares, table, whole } from "../format";
import { asOf, companyId, dec, day, o, pct, tool, url } from "./shared";

export const ROUND_WIDGET = "ui://capy/round.html";

const usd = z
  .union([z.string().max(40), z.number().nonnegative()])
  .describe('USD amount, such as 20000000 or "20,000,000"');

function yearFromToday() {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function registerPlanningTools(server: McpServer, capy: Capy) {
  const { convex } = capy;

  tool(
    server,
    "vesting_forecast",
    {
      title: "Vesting forecast",
      description:
        "Projects vested and unvested shares from today to a future date, month by month or quarter by quarter, for the whole company, one stakeholder or one equity plan. Also lists the next vesting events after today (the first 50 in date order, with who vests how many shares when, plus upcomingCount, the total in the range) and securities whose schedule Capy can't project. Vesting stops at a holder's termination date. Share amounts are decimal strings. Dates before the cap table snapshot can't be rebuilt, so the forecast never starts before it.",
      input: z.object({
        companyId,
        to: day
          .optional()
          .describe("End date, YYYY-MM-DD. Default one year from today. At most 20 years out."),
        from: day
          .optional()
          .describe("Start date, YYYY-MM-DD. Default today; never earlier than the snapshot date."),
        interval: z.enum(["month", "quarter"]).optional().describe("Point spacing; default month"),
        stakeholderKey: z.string().optional().describe("Only this stakeholder's securities"),
        planName: z.string().optional().describe("Only awards from this equity plan"),
      }),
      output: o({
        asOf,
        from: z.string(),
        to: z.string(),
        interval: z.string(),
        points: z.array(o({ date: z.string(), vested: dec("Shares"), unvested: dec("Shares") })),
        upcoming: z.array(
          o({
            date: z.string(),
            stakeholderKey: z.string(),
            name: z.string(),
            securityKey: z.string(),
            certificate: z.string(),
            shares: dec("Shares vesting on this date"),
            link: url,
          }),
        ),
        upcomingCount: z.number().describe("Vesting events in the range, before the 50-event cap"),
        unprojectable: z.array(
          o({ securityKey: z.string(), certificate: z.string(), schedule: z.string() }),
        ),
        unprojectableCount: z.number(),
        link: url,
      }),
    },
    async (a) => {
      const r = capy.absolute(
        await convex.query(api.mcp.vestingForecast, {
          ...a,
          to: a.to ?? yearFromToday(),
          companyId: capy.companyId(a.companyId),
        }),
      );
      const today = new Date().toISOString().slice(0, 10),
        after = today > r.from ? today : r.from,
        shown = Math.min(20, r.upcoming.length);
      return {
        data: r,
        text: lines(
          `Vesting from ${r.from} to ${r.to} by ${r.interval} (snapshot ${r.asOf}).`,
          table(
            ["Date", "Vested", "Unvested"],
            r.points.map((p) => [p.date, shares(p.vested), shares(p.unvested)]),
          ),
          r.upcoming.length &&
            `Next vesting events after ${after}:\n\n` +
              table(
                ["Date", "Holder", "Certificate", "securityKey", "Shares"],
                r.upcoming
                  .slice(0, 20)
                  .map((u) => [
                    u.date,
                    link(u.name, u.link),
                    u.certificate,
                    u.securityKey,
                    shares(u.shares),
                  ]),
              ),
          r.upcomingCount > shown &&
            (r.upcomingCount > r.upcoming.length
              ? `Showing ${shown} of ${r.upcomingCount} vesting events up to ${r.to}; the structured result lists the first ${r.upcoming.length}. For the rest, narrow from and to, or pass stakeholderKey or planName.`
              : `Showing ${shown} of ${r.upcomingCount} vesting events up to ${r.to}; the structured result lists all of them.`),
          r.unprojectableCount > 0 &&
            `Capy can't project ${r.unprojectableCount} schedule${r.unprojectableCount === 1 ? "" : "s"}, so they stay at their snapshot vested amount: ${r.unprojectable
              .slice(0, 10)
              .map((u) => `${u.certificate} ("${u.schedule}")`)
              .join(", ")}.`,
        ),
      };
    },
  );

  tool(
    server,
    "model_round",
    {
      title: "Model a priced round",
      description:
        "Models a priced equity round at a pre-money valuation and investment amount: price per share, new investor shares, how outstanding SAFEs and notes convert, and each holder's ownership before, after conversion and after the round. Nothing is saved. Assumes no option pool increase, pro rata, MFN or liquidation preferences. To save the scenario for the team, use draft_change with kind round_scenario.",
      input: z.object({
        companyId,
        preMoney: usd.describe('Pre-money valuation in USD, such as 20000000 or "20,000,000"'),
        investment: usd.describe("New money invested in the round, USD"),
      }),
      output: o({
        companyId: z.string(),
        asOf,
        preMoney: dec("USD"),
        investment: dec("USD"),
        postMoney: dec("USD"),
        pricePerShare: dec("USD per share"),
        newShares: dec("Shares issued to new investors"),
        fullyDilutedBefore: dec("Shares"),
        afterConversion: dec("Fully diluted shares after SAFEs and notes convert"),
        afterRound: dec("Fully diluted shares after the round"),
        convertedShares: dec("Shares issued to converting SAFEs and notes"),
        convertibles: z.number().describe("Outstanding SAFEs and notes that convert"),
        rows: z.array(
          o({
            key: z.string(),
            name: z.string(),
            before: dec("Shares before"),
            converted: dec("Shares from converting SAFEs and notes"),
            afterRound: dec("Shares after the round"),
            beforePercent: pct,
            afterConversionPercent: pct,
            afterRoundPercent: pct,
          }),
        ),
        rowCount: z.number(),
        assumptions: z.string(),
        link: url,
      }),
      widget: ROUND_WIDGET,
    },
    async (a) => {
      const id = capy.companyId(a.companyId);
      const r = capy.absolute(
        await convex.query(api.mcp.modelRound, {
          companyId: id,
          preMoney: String(a.preMoney),
          investment: String(a.investment),
        }),
      );
      return {
        data: { companyId: id, ...r },
        text: lines(
          `At ${money(r.preMoney)} pre-money and ${money(r.investment)} invested (${money(r.postMoney)} post-money), the price is ${price(r.pricePerShare)} per share. New investors get ${whole(r.newShares)} shares; ${r.convertibles} SAFEs/notes convert into ${whole(r.convertedShares)} shares. Fully diluted goes from ${shares(r.fullyDilutedBefore)} to ${whole(r.afterRound)}.`,
          table(
            ["Holder", "Before", "After round", "% before", "% after conversion", "% after round"],
            r.rows
              .slice(0, 15)
              .map((x) => [
                x.name,
                whole(x.before),
                whole(x.afterRound),
                percent(x.beforePercent),
                percent(x.afterConversionPercent),
                percent(x.afterRoundPercent),
              ]),
          ),
          paging(Math.min(15, r.rows.length), r.rowCount),
          r.assumptions,
          `Open the round model in Capy: ${r.link}`,
        ),
      };
    },
  );

  tool(
    server,
    "health_check",
    {
      title: "Cap table health check",
      description:
        "Checks a company's cap table for problems and loose ends, most severe first: data inconsistencies (critical), expiring exercise windows, expired options, a low or expired option pool, missing 409A, unsigned approvals, missing emails, unprojectable vesting, possible missing 83(b) elections, outstanding SAFEs and notes, and more. Each issue has a code, severity, explanation, count and up to 25 affected items with links. Issues marked unknown mean Capy lacks the data to decide, not that there is a problem.",
      input: z.object({ companyId }),
      output: o({
        asOf,
        checkedOn: z.string(),
        counts: o({ critical: z.number(), warning: z.number(), info: z.number() }),
        issues: z.array(
          o({
            severity: z.enum(["critical", "warning", "info"]),
            code: z.string(),
            title: z.string(),
            detail: z.string(),
            count: z.number(),
            unknown: z.boolean().optional(),
            items: z.array(
              o({
                label: z.string(),
                kind: z.string(),
                key: z.string().optional(),
                link: url.nullable(),
              }),
            ),
          }),
        ),
        link: url,
      }),
    },
    async (a) => {
      const r = capy.absolute(
        await convex.query(api.mcp.healthCheck, { companyId: capy.companyId(a.companyId) }),
      );
      const c = r.counts;
      return {
        data: r,
        text: lines(
          `Health check on ${r.checkedOn} (snapshot ${r.asOf}): ${c.critical} critical, ${c.warning} warnings, ${c.info} notes.`,
          ...r.issues.map((i) => {
            const shown = i.items.slice(0, 5);
            return (
              `**${i.severity.toUpperCase()}${i.unknown ? " (unknown)" : ""}: ${i.title}** (${i.code}, ${i.count})\n${i.detail}` +
              (shown.length
                ? "\n" +
                  shown.map((x) => `- ${link(x.label, x.link)}`).join("\n") +
                  (i.count > shown.length ? `\n- …and ${i.count - shown.length} more` : "")
                : "")
            );
          }),
          !r.issues.length && "No issues found.",
        ),
      };
    },
  );
}

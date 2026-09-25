// Capy's MCP tools, called by the Worker with the connected app's OAuth access token.
// Every function resolves token → user → grant → live membership in the same transaction.
import { v } from "convex/values";
import { D, isConvertible, percentage, sum, totals } from "@capy/equity";
import type { Security, Stakeholder } from "@capy/equity";
import { recordKindSchema } from "@capy/equity/changes";
import { healthCheck as checkHealth, type HealthRecord } from "@capy/equity/health";
import { modelRound as roundModel } from "@capy/equity/modeling";
import {
  ownershipGroups,
  relationshipGroup,
  stakeholderHoldings,
  topHolders,
} from "@capy/equity/ownership";
import { postTerminationDeadline, vestingForecast as forecast } from "@capy/equity/vesting";
import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";
import { accessForUser } from "./billing";
import { createChangeAs, describeChange, listChanges } from "./changes";
import { findGrant } from "./connections";
import { loadCompany, type AuthUser } from "./equity";
import {
  amount,
  bound,
  certificateList,
  clip,
  compactFields,
  convertibleTerms,
  day,
  fail,
  fold,
  holding,
  mailingAddress,
  matches,
  page,
  paths,
  vestEventSummary,
  type Paths,
} from "./mcpFormat";

type Ctx = QueryCtx | MutationCtx;
const auth = { token: v.string(), now: v.number() };
const reconnect = "This Capy connection expired or was removed. Reconnect Capy.";
const skew = 5 * 60_000;
const downloadLifetime = 15 * 60_000;
const touchEvery = 10 * 60_000;
const maxPendingDrafts = 50;
const awardKinds = new Set(["option", "rsu", "warrant", "piu"]);

// ---------------------------------------------------------------- access

type TokenRow = {
  userId?: string | null;
  clientId?: string | null;
  accessTokenExpiresAt?: number | null;
};
/** The user and grant behind an access token, or `unauthorized` so the client refreshes or reconnects. */
async function resolve(ctx: Ctx, a: { token: string; now: number }) {
  if (!Number.isFinite(a.now) || Math.abs(a.now - Date.now()) > skew)
    throw fail("unauthorized", "The request clock is out of sync. Retry the request.");
  if (!a.token || a.token.length > 512) throw fail("unauthorized", reconnect);
  const t = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "oauthAccessToken",
    where: [{ field: "accessToken", value: a.token }],
  })) as TokenRow | null;
  if (!t?.userId || !t.clientId || !t.accessTokenExpiresAt || t.accessTokenExpiresAt <= Date.now())
    throw fail("unauthorized", reconnect);
  const [u, grant] = await Promise.all([
    authComponent.getAnyUserById(ctx, t.userId),
    findGrant(ctx, t.userId, t.clientId),
  ]);
  if (!u || !grant) throw fail("unauthorized", reconnect);
  return { user: u as AuthUser, grant, clientId: t.clientId, expiresAt: t.accessTokenExpiresAt };
}
type Session = Awaited<ReturnType<typeof resolve>>;

/** The company if this connection may see it and the user is still a member; drafting also needs admin. */
async function company(ctx: Ctx, s: Session, companyId: string, draft = false) {
  const id = ctx.db.normalizeId("companies", companyId);
  if (!id || !s.grant.companyIds.includes(id))
    throw fail(
      "forbidden",
      "This connection can’t see that company. Call list_companies for the ones it can, or add it in Capy under Account → Connected apps.",
    );
  const m = await ctx.db
    .query("memberships")
    .withIndex("by_company_user", (q) => q.eq("companyId", id).eq("userId", s.user._id))
    .unique();
  if (!m) throw fail("forbidden", "You are no longer a member of this company.");
  if (draft && !s.grant.allowDrafts)
    throw fail(
      "forbidden",
      "This connection can’t draft changes. Turn on drafting in Capy under Account → Connected apps.",
    );
  if (draft && m.role !== "admin")
    throw fail("forbidden", "Only company admins can draft changes.");
  const c = await ctx.db.get(id);
  const imp = c?.activeImport ? await ctx.db.get(c.activeImport) : null;
  if (!c || !imp) throw fail("not_found", "This company has no cap table yet.");
  return {
    companyId: id,
    company: c,
    imp,
    role: m.role,
    asOf: String(imp.metadata.asOf ?? ""),
    to: paths(id),
  };
}

async function open(ctx: Ctx, a: { token: string; now: number; companyId: string }) {
  const s = await resolve(ctx, a);
  return { s, c: await company(ctx, s, a.companyId) };
}

// ---------------------------------------------------------------- shared shapes

function documentInfo(r: Doc<"records">, to: Paths) {
  const d = (r.data ?? {}) as Record<string, unknown>;
  const size = Number(d.size);
  return {
    documentId: r._id,
    title: r.title,
    category: String(d.category ?? ""),
    certificates: certificateList(d),
    size: d.size !== undefined && Number.isFinite(size) ? size : null,
    contentType: String(d.contentType ?? "") || null,
    addedAt: new Date(r._creationTime).toISOString(),
    resourceUri: to.documentUri(r._id),
    link: to.record("document"),
  };
}
async function documentRows(ctx: Ctx, companyId: Id<"companies">) {
  return await ctx.db
    .query("records")
    .withIndex("by_company_kind", (q) => q.eq("companyId", companyId).eq("kind", "document"))
    .order("desc")
    .collect();
}
/** Documents that list any of these certificate labels. Labels are not unique across classes. */
function linkedDocuments(docs: Doc<"records">[], certificates: string[], to: Paths, limit = 25) {
  const wanted = new Set(certificates);
  const found = docs.filter((r) => certificateList(r.data ?? {}).some((x) => wanted.has(x)));
  return { total: found.length, items: found.slice(0, limit).map((r) => documentInfo(r, to)) };
}
const iso = (ms: number | undefined | null) => (ms ? new Date(ms).toISOString() : null);

// ---------------------------------------------------------------- session

/** Who the token belongs to and the companies this connection may use. */
export const session = query({
  args: auth,
  handler: async (ctx, a) => {
    const s = await resolve(ctx, a);
    const companies = [];
    for (const id of s.grant.companyIds) {
      const [c, m] = await Promise.all([
        ctx.db.get(id),
        ctx.db
          .query("memberships")
          .withIndex("by_company_user", (q) => q.eq("companyId", id).eq("userId", s.user._id))
          .unique(),
      ]);
      const imp = c?.activeImport ? await ctx.db.get(c.activeImport) : null;
      if (!c || !m || !imp) continue;
      companies.push({
        companyId: c._id,
        name: c.name,
        role: m.role,
        isOwner: c.ownerId === s.user._id,
        canEdit: (await accessForUser(ctx, c.ownerId)).canEdit,
        canDraft: s.grant.allowDrafts && m.role === "admin",
        asOf: String(imp.metadata.asOf ?? ""),
        link: paths(c._id).page("dashboard"),
      });
    }
    return {
      user: { name: s.user.name, email: s.user.email },
      clientId: s.clientId,
      clientName: s.grant.clientName ?? null,
      allowDrafts: companies.some((c) => c.canDraft),
      expiresAt: s.expiresAt,
      companies,
    };
  },
});

/** Records when the connection was last used, at most every 10 minutes. */
export const touch = mutation({
  args: auth,
  handler: async (ctx, a) => {
    const s = await resolve(ctx, a);
    const now = Date.now();
    if (!s.grant.lastUsedAt || now - s.grant.lastUsedAt >= touchEvery)
      await ctx.db.patch(s.grant._id, { lastUsedAt: now });
    return null;
  },
});

// ---------------------------------------------------------------- reads

export const capTableSummary = query({
  args: {
    ...auth,
    companyId: v.string(),
    groupBy: v.optional(
      v.union(
        v.literal("class"),
        v.literal("plan"),
        v.literal("relationship"),
        v.literal("stakeholder"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const { c } = await open(ctx, a);
    const { data } = await loadCompany(ctx, c.companyId);
    const t = totals(data),
      holdings = stakeholderHoldings(data),
      to = c.to,
      by = a.groupBy ?? "relationship";
    const stock = data.securities.filter((s) => s.kind === "share");
    const classes = data.classes.map((cls) => {
      const outstanding = sum(
        stock.filter((s) => s.className === cls.name).map((s) => s.outstanding),
      );
      return {
        name: cls.name,
        kind: cls.kind,
        authorized: cls.authorized,
        outstanding,
        reportedOutstanding: cls.reportedOutstanding,
        percent: percentage(outstanding, t.fullyDiluted),
        link: to.shareClass(cls.name),
      };
    });
    const plans = data.plans.map((p) => {
      const awards = sum(
        data.securities
          .filter((s) => s.planName === p.name && awardKinds.has(s.kind))
          .map((s) => s.outstanding),
      );
      return {
        name: p.name,
        className: p.className,
        authorized: p.authorized,
        available: p.available,
        outstandingAwards: awards,
        // Exercised shares count as issued from the plan, so this can exceed outstanding awards.
        issuedFromPlan: D(p.authorized).minus(p.available).toFixed(),
        availablePercentOfPlan: percentage(p.available, p.authorized, 2),
        status: p.status ?? null,
        percent: percentage(D(awards).plus(p.available).toFixed(), t.fullyDiluted),
        link: to.plan(p.name),
      };
    });
    type Row = { key: string; name: string; shares: string; percent: string; link: string | null };
    let rows: Row[];
    if (by === "relationship")
      rows = ownershipGroups(data, holdings)
        .filter((g) => D(g.shares).gt(0))
        .map((g) => ({
          key: g.group,
          name: g.group,
          shares: g.shares,
          percent: g.percent,
          link: null,
        }));
    else if (by === "stakeholder")
      rows = data.stakeholders
        .map((p) => ({ key: p.key, name: p.name, shares: holdings.get(p.key) ?? "0" }))
        .filter((r) => D(r.shares).gt(0))
        .sort((x, y) => D(y.shares).cmp(x.shares) || x.name.localeCompare(y.name))
        .map((r) => ({
          ...r,
          percent: percentage(r.shares, t.fullyDiluted),
          link: to.stakeholder(r.key),
        }));
    else if (by === "class")
      rows = classes.map((x) => ({
        key: x.name,
        name: x.name,
        shares: x.outstanding,
        percent: x.percent,
        link: x.link,
      }));
    else
      rows = plans.map((p) => ({
        key: p.name,
        name: p.name,
        shares: D(p.outstandingAwards).plus(p.available).toFixed(),
        percent: p.percent,
        link: p.link,
      }));
    const breakdown = page(rows, { limit: a.limit }, 25, 200);
    const convertibles = data.securities.filter((s) => isConvertible(s) && D(s.outstanding).gt(0));
    return {
      companyId: c.companyId,
      company: c.company.name,
      asOf: c.asOf,
      totals: t,
      convertibles: {
        outstanding: convertibles.length,
        principalOutstanding: sum(convertibles.map((s) => s.outstanding)),
        note: "Unconverted SAFEs and notes are not part of fully diluted shares.",
      },
      groupBy: by,
      breakdown: { rows: breakdown.items, total: breakdown.total },
      classes: classes.slice(0, 50),
      classCount: classes.length,
      plans: plans.slice(0, 50),
      planCount: plans.length,
      topHolders: topHolders(data, 10, holdings)
        .filter((h) => D(h.shares).gt(0))
        .map((h) => ({
          ...h,
          link: h.kind === "plan" ? to.plan(h.key) : to.stakeholder(h.key),
        })),
      link: to.page("captable"),
    };
  },
});

export const findStakeholders = query({
  args: {
    ...auth,
    companyId: v.string(),
    query: v.optional(v.string()),
    relationship: v.optional(v.string()),
    hasHoldings: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const { c } = await open(ctx, a);
    const { data } = await loadCompany(ctx, c.companyId);
    const t = totals(data),
      holdings = stakeholderHoldings(data);
    const live = new Map<string, number>();
    for (const s of data.securities)
      if (D(s.outstanding).gt(0)) live.set(s.stakeholderKey, (live.get(s.stakeholderKey) ?? 0) + 1);
    const wanted = fold(a.relationship);
    const found = data.stakeholders
      .filter(
        (p) =>
          matches(a.query, [p.name, p.email, p.externalId, p.key]) &&
          (!wanted ||
            fold(p.relationship) === wanted ||
            fold(relationshipGroup(p.relationship)).startsWith(wanted)) &&
          (a.hasHoldings === undefined || (live.get(p.key) ?? 0) > 0 === a.hasHoldings),
      )
      .map((p) => ({ p, shares: holdings.get(p.key) ?? "0" }))
      .sort((x, y) => D(y.shares).cmp(x.shares) || x.p.name.localeCompare(y.p.name));
    const result = page(found, a, 25, 100);
    return {
      asOf: c.asOf,
      total: result.total,
      offset: result.offset,
      nextOffset: result.nextOffset,
      stakeholders: result.items.map(({ p, shares }) => ({
        stakeholderKey: p.key,
        name: p.name,
        email: p.email || null,
        relationship: p.relationship,
        group: relationshipGroup(p.relationship),
        entityType: p.entityType || null,
        fullyDilutedShares: shares,
        percent: percentage(shares, t.fullyDiluted),
        outstandingSecurities: live.get(p.key) ?? 0,
        link: c.to.stakeholder(p.key),
      })),
    };
  },
});

export const stakeholder = query({
  args: { ...auth, companyId: v.string(), stakeholderKey: v.string() },
  handler: async (ctx, a) => {
    const { c } = await open(ctx, a);
    const { data } = await loadCompany(ctx, c.companyId);
    const p = data.stakeholders.find((x) => x.key === a.stakeholderKey);
    if (!p) throw fail("not_found", "No stakeholder with that key. Use find_stakeholders.");
    const today = day(a.now),
      to = c.to,
      f = p.fields ?? {};
    const mine = data.securities
      .filter((s) => s.stakeholderKey === p.key)
      .sort(
        (x, y) =>
          Number(D(y.outstanding).gt(0)) - Number(D(x.outstanding).gt(0)) ||
          x.issuedOn.localeCompare(y.issuedOn),
      );
    const t = totals(data),
      shares = stakeholderHoldings({ securities: mine }).get(p.key) ?? "0";
    const docs = linkedDocuments(
      await documentRows(ctx, c.companyId),
      [...new Set(mine.map((s) => s.certificate))],
      to,
    );
    return {
      asOf: c.asOf,
      stakeholderKey: p.key,
      name: p.name,
      email: p.email || null,
      relationship: p.relationship,
      group: relationshipGroup(p.relationship),
      entityType: p.entityType || null,
      externalId: p.externalId || null,
      contact: {
        phone: f["Phone"] || null,
        address: mailingAddress(f),
        title: f["Title"] || null,
        department: f["Department"] || null,
      },
      employment: {
        hireDate: f["Hire Date"] || null,
        terminationDate: f["Termination Date"] || null,
        terminationType: f["Termination Type"] || null,
      },
      fields: compactFields(f),
      ownership: {
        fullyDilutedShares: shares,
        percent: percentage(shares, t.fullyDiluted),
        outstandingStock: sum(mine.filter((s) => s.kind === "share").map((s) => s.outstanding)),
        outstandingAwards: sum(
          mine.filter((s) => awardKinds.has(s.kind)).map((s) => s.outstanding),
        ),
        convertiblePrincipal: sum(mine.filter(isConvertible).map((s) => s.outstanding)),
      },
      holdings: mine.slice(0, 100).map((s) => ({
        ...holding(s, c.asOf, today, to, p),
        ...(s.kind === "option" && D(s.outstanding).gt(0)
          ? { postTermination: postTerminationDeadline(s, p) }
          : {}),
        ...(isConvertible(s) ? { terms: convertibleTerms(s) } : {}),
      })),
      holdingCount: mine.length,
      documents: docs.items,
      documentCount: docs.total,
      link: to.stakeholder(p.key),
    };
  },
});

export const security = query({
  args: {
    ...auth,
    companyId: v.string(),
    securityKey: v.optional(v.string()),
    certificate: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const { c } = await open(ctx, a);
    if (!a.securityKey && !a.certificate?.trim())
      throw fail("invalid", "Pass a securityKey or a certificate label.");
    let found: Security[];
    if (a.securityKey) {
      const key = a.securityKey;
      const row = await ctx.db
        .query("securities")
        .withIndex("by_import_key", (q) => q.eq("importId", c.imp._id).eq("key", key))
        .unique();
      found = row ? [row.data as Security] : [];
    } else {
      const wanted = a.certificate!.trim().toLowerCase();
      const { data } = await loadCompany(ctx, c.companyId);
      found = data.securities.filter((s) => s.certificate.trim().toLowerCase() === wanted);
    }
    if (!found.length)
      throw fail(
        "not_found",
        "No security matches. Use get_stakeholder to list someone’s holdings.",
      );
    const today = day(a.now),
      to = c.to,
      docs = await documentRows(ctx, c.companyId);
    const securities = await Promise.all(
      found.slice(0, 20).map(async (s) => {
        const row = await ctx.db
          .query("stakeholders")
          .withIndex("by_import_key", (q) =>
            q.eq("importId", c.imp._id).eq("key", s.stakeholderKey),
          )
          .unique();
        const holder = (row?.data as Stakeholder | undefined) ?? null;
        const linked = linkedDocuments(docs, [s.certificate], to, 10);
        return {
          ...holding(s, c.asOf, today, to, holder),
          capital: s.capital,
          recordedVested: s.vested,
          balanceAsOf: s.balanceAsOf || c.asOf,
          holder: holder
            ? { stakeholderKey: holder.key, name: holder.name, link: to.stakeholder(holder.key) }
            : { stakeholderKey: s.stakeholderKey, name: null, link: null },
          ...(isConvertible(s) ? { terms: convertibleTerms(s) } : {}),
          ...(s.kind === "option" ? { postTermination: postTerminationDeadline(s, holder) } : {}),
          vestEvents: vestEventSummary(s, today),
          fields: compactFields(s.fields),
          documents: linked.items,
          documentCount: linked.total,
        };
      }),
    );
    return {
      asOf: c.asOf,
      total: found.length,
      ...(found.length > 1
        ? { note: "Certificate labels are not unique; every match is listed." }
        : {}),
      securities,
    };
  },
});

export const vestingForecast = query({
  args: {
    ...auth,
    companyId: v.string(),
    from: v.optional(v.string()),
    to: v.string(),
    interval: v.optional(v.union(v.literal("month"), v.literal("quarter"))),
    stakeholderKey: v.optional(v.string()),
    planName: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const { c } = await open(ctx, a);
    const { data } = await loadCompany(ctx, c.companyId);
    if (a.stakeholderKey && !data.stakeholders.some((p) => p.key === a.stakeholderKey))
      throw fail("not_found", "No stakeholder with that key. Use find_stakeholders.");
    if (a.planName && !data.plans.some((p) => p.name === a.planName))
      throw fail(
        "not_found",
        `No equity plan named “${clip(a.planName, 100)}”. Plans: ${data.plans.map((p) => p.name).join(", ") || "none"}.`,
      );
    let result: ReturnType<typeof forecast>;
    try {
      result = forecast(data, {
        to: a.to,
        today: day(a.now),
        ...(a.from ? { from: a.from } : {}),
        ...(a.interval ? { interval: a.interval } : {}),
        ...(a.stakeholderKey ? { stakeholderKey: a.stakeholderKey } : {}),
        ...(a.planName ? { planName: a.planName } : {}),
      });
    } catch (e) {
      throw fail("invalid", e instanceof Error ? e.message : String(e));
    }
    return {
      ...result,
      upcoming: result.upcoming.map((u) => ({ ...u, link: c.to.stakeholder(u.stakeholderKey) })),
      unprojectable: result.unprojectable.slice(0, 50),
      unprojectableCount: result.unprojectable.length,
      link: c.to.page("vesting_schedules"),
    };
  },
});

export const convertibles = query({
  args: {
    ...auth,
    companyId: v.string(),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const { c } = await open(ctx, a);
    const { data } = await loadCompany(ctx, c.companyId);
    const names = new Map(data.stakeholders.map((p) => [p.key, p.name]));
    const wanted = fold(a.status);
    const all = data.securities.filter(isConvertible);
    const found = all
      .filter((s) => !wanted || fold(s.status) === wanted)
      .sort(
        (x, y) =>
          Number(D(y.outstanding).gt(0)) - Number(D(x.outstanding).gt(0)) ||
          x.issuedOn.localeCompare(y.issuedOn),
      );
    const result = page(found, a, 50, 200);
    const live = all.filter((s) => D(s.outstanding).gt(0));
    return {
      asOf: c.asOf,
      summary: {
        outstanding: live.length,
        principalOutstanding: sum(live.map((s) => s.outstanding)),
        note: "Unconverted SAFEs and notes are not part of fully diluted shares. valuationCap is null when the cap is text such as “Uncapped”; see valuationCapText.",
      },
      total: result.total,
      offset: result.offset,
      nextOffset: result.nextOffset,
      convertibles: result.items.map((s) => ({
        securityKey: s.key,
        certificate: s.certificate,
        kind: s.kind,
        holder: names.get(s.stakeholderKey) ?? null,
        stakeholderKey: s.stakeholderKey,
        status: s.status,
        issuedOn: s.issuedOn,
        ...convertibleTerms(s),
        link: c.to.security(s),
      })),
      link: c.to.page("fundraising"),
    };
  },
});

/** Document metadata only. Files are fetched with documentLink, never by storage URL. */
export const documents = query({
  args: {
    ...auth,
    companyId: v.string(),
    query: v.optional(v.string()),
    category: v.optional(v.string()),
    certificate: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const { c } = await open(ctx, a);
    const all = await documentRows(ctx, c.companyId);
    const categoryOf = (r: Doc<"records">) => String(r.data?.category ?? "");
    const counts = new Map<string, number>();
    for (const r of all) counts.set(categoryOf(r), (counts.get(categoryOf(r)) ?? 0) + 1);
    const category = a.category?.trim().toLowerCase(),
      certificate = a.certificate?.trim().toLowerCase();
    const found = all.filter(
      (r) =>
        matches(a.query, [r.title, categoryOf(r), String(r.data?.certificates ?? "")]) &&
        (!category || categoryOf(r).toLowerCase() === category) &&
        (!certificate ||
          certificateList(r.data ?? {}).some((x) => x.toLowerCase() === certificate)),
    );
    const result = page(found, a, 25, 100);
    return {
      asOf: c.asOf,
      total: result.total,
      offset: result.offset,
      nextOffset: result.nextOffset,
      categories: [...counts]
        .sort((x, y) => y[1] - x[1])
        .slice(0, 50)
        .map(([name, count]) => ({ name, count })),
      documents: result.items.map((r) => documentInfo(r, c.to)),
      link: c.to.record("document"),
    };
  },
});

export const records = query({
  args: {
    ...auth,
    companyId: v.string(),
    kind: v.string(),
    status: v.optional(v.string()),
    query: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const { c } = await open(ctx, a);
    const kind = recordKindSchema.safeParse(a.kind);
    if (!kind.success)
      throw fail("invalid", `kind must be one of: ${recordKindSchema.options.join(", ")}.`);
    if (kind.data === "document") throw fail("invalid", "Use search_documents for documents.");
    const status = a.status?.trim().toLowerCase();
    const all = await ctx.db
      .query("records")
      .withIndex("by_company_kind", (q) => q.eq("companyId", c.companyId).eq("kind", kind.data))
      .order("desc")
      .collect();
    const valuesOf = (r: Doc<"records">) =>
      Object.entries((r.data ?? {}) as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === "string" && e[1] !== "",
      );
    const found = all.filter(
      (r) =>
        (!status || r.status.toLowerCase() === status) &&
        matches(a.query, [r.title, ...valuesOf(r).map(([, value]) => value)]),
    );
    const result = page(found, a, 25, 100);
    return {
      asOf: c.asOf,
      kind: kind.data,
      total: result.total,
      offset: result.offset,
      nextOffset: result.nextOffset,
      records: result.items.map((r) => {
        const values = valuesOf(r);
        return {
          recordId: r._id,
          title: r.title,
          status: r.status,
          addedAt: new Date(r._creationTime).toISOString(),
          fields: Object.fromEntries(values.map(([k, value]) => [k, clip(value, 2000)])),
          truncated: values.some(([, value]) => value.length > 2000),
        };
      }),
      link: c.to.record(kind.data),
    };
  },
});

export const activity = query({
  args: {
    ...auth,
    companyId: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, a) => {
    const { c } = await open(ctx, a);
    let result;
    try {
      result = await ctx.db
        .query("activity")
        .withIndex("by_company", (q) => q.eq("companyId", c.companyId))
        .order("desc")
        .paginate({ numItems: bound(a.limit, 25, 100), cursor: a.cursor ?? null });
    } catch {
      throw fail("invalid", "That cursor is not valid. Start again without one.");
    }
    return {
      asOf: c.asOf,
      entries: result.page.map((r) => {
        const d = (r.details ?? {}) as Record<string, unknown>;
        return {
          at: new Date(r._creationTime).toISOString(),
          actor: r.actor,
          description: clip(r.description, 500),
          ...(d.via === "mcp"
            ? { via: "mcp", changeId: d.changeId ?? null, clientName: d.clientName ?? null }
            : {}),
        };
      }),
      cursor: result.isDone ? null : result.continueCursor,
      link: c.to.page("auditLog"),
    };
  },
});

export const modelRound = query({
  args: { ...auth, companyId: v.string(), preMoney: v.string(), investment: v.string() },
  handler: async (ctx, a) => {
    const { c } = await open(ctx, a);
    const preMoney = amount(a.preMoney, "preMoney"),
      investment = amount(a.investment, "investment");
    const { data } = await loadCompany(ctx, c.companyId);
    let model: ReturnType<typeof roundModel>;
    try {
      model = roundModel(data, preMoney, investment);
    } catch (e) {
      throw fail("invalid", e instanceof Error ? e.message : String(e));
    }
    const rows = model.rows
      .filter((r) => D(r.before).gt(0) || D(r.afterRound).gt(0))
      .sort((x, y) => D(y.afterRound).cmp(x.afterRound));
    return {
      asOf: c.asOf,
      preMoney,
      investment,
      postMoney: D(preMoney).plus(investment).toFixed(),
      pricePerShare: model.price,
      newShares: model.newShares,
      fullyDilutedBefore: model.before,
      afterConversion: model.afterSafes,
      afterRound: model.afterRound,
      convertedShares: model.safeShares,
      convertibles: data.securities.filter((s) => isConvertible(s) && D(s.outstanding).gt(0))
        .length,
      rows: rows.slice(0, 50).map((r) => ({
        key: r.key,
        name: r.name,
        before: r.before,
        converted: r.converted,
        afterRound: r.afterRound,
        beforePercent: r.beforePercent,
        afterConversionPercent: r.safePercent,
        afterRoundPercent: r.roundPercent,
      })),
      rowCount: rows.length,
      assumptions:
        "Converts every outstanding SAFE and note at the lower of the round price (after any discount) and its cap price. No option pool increase, pro rata, MFN or liquidation preferences.",
      link: c.to.page("fundraising"),
    };
  },
});

const healthKinds = ["document", "approval", "consent", "offer", "valuation"];
export const healthCheck = query({
  args: { ...auth, companyId: v.string() },
  handler: async (ctx, a) => {
    const { c } = await open(ctx, a);
    const [{ data }, billing, ...byKind] = await Promise.all([
      loadCompany(ctx, c.companyId),
      accessForUser(ctx, c.company.ownerId),
      ...healthKinds.map((kind) =>
        ctx.db
          .query("records")
          .withIndex("by_company_kind", (q) => q.eq("companyId", c.companyId).eq("kind", kind))
          .collect(),
      ),
    ]);
    const rows = byKind.flat();
    const records: HealthRecord[] = rows.map((r) => ({
      _id: r._id,
      kind: r.kind,
      title: r.title,
      status: r.status,
      data: (r.data ?? {}) as Record<string, unknown>,
    }));
    const kinds = new Map<string, string>(rows.map((r) => [r._id, r.kind]));
    const securities = new Map(data.securities.map((s) => [s.key, s]));
    const to = c.to;
    const link = (code: string, item: { kind: string; key?: string }) => {
      if (item.kind === "company")
        return to.page(code === "import_warnings" ? "imports" : "profile");
      if (!item.key) return null;
      if (item.kind === "stakeholder") return to.stakeholder(item.key);
      if (item.kind === "plan") return to.plan(item.key);
      if (item.kind === "class") return to.shareClass(item.key);
      if (item.kind === "security") {
        const s = securities.get(item.key);
        return s ? to.security(s) : null;
      }
      const kind = kinds.get(item.key);
      return kind ? to.record(kind) : null;
    };
    const issues = checkHealth({
      data,
      records,
      now: a.now,
      billing,
      profile: (c.company.profile ?? {}) as Record<string, string>,
    }).map((issue) => ({
      ...issue,
      items: issue.items.map((item) => ({ ...item, link: link(issue.code, item) })),
    }));
    const count = (severity: string) => issues.filter((i) => i.severity === severity).length;
    return {
      asOf: c.asOf,
      checkedOn: day(a.now),
      counts: { critical: count("critical"), warning: count("warning"), info: count("info") },
      issues,
      link: to.page("dashboard"),
    };
  },
});

// ---------------------------------------------------------------- drafted changes

export const changes = query({
  args: {
    ...auth,
    companyId: v.string(),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("applied"),
        v.literal("rejected"),
        v.literal("expired"),
        v.literal("failed"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const { c } = await open(ctx, a);
    const rows = await listChanges(ctx, c.companyId, a.status, bound(a.limit, 25, 100));
    return {
      asOf: c.asOf,
      changes: rows.map((r) => ({
        changeId: r._id,
        kind: r.kind,
        title: r.title,
        status: r.status,
        draftedBy: r.draftedBy,
        clientName: r.clientName ?? null,
        draftedAt: iso(r._creationTime),
        expiresAt: iso(r.expiresAt),
        reviewedAt: iso(r.reviewedAt),
        error: r.error ?? null,
        link: r.link,
      })),
      link: c.to.page("changes"),
    };
  },
});

export const change = query({
  args: { ...auth, companyId: v.string(), changeId: v.string() },
  handler: async (ctx, a) => {
    const { s, c } = await open(ctx, a);
    const id = ctx.db.normalizeId("changes", a.changeId);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.companyId !== c.companyId)
      throw fail("not_found", "No drafted change with that ID in this company.");
    const d = await describeChange(ctx, row, s.user, a.now);
    return {
      asOf: c.asOf,
      changeId: d._id,
      kind: d.kind,
      title: d.title,
      status: d.status,
      rationale: d.rationale,
      input: (d.payload as { input?: unknown } | undefined)?.input ?? null,
      draftedBy: d.draftedBy,
      clientName: d.clientName ?? null,
      draftedAt: iso(d._creationTime),
      expiresAt: iso(d.expiresAt),
      preview: d.preview,
      current: d.current,
      stale: d.stale,
      staleReason: d.staleReason,
      canApply: d.canApply,
      reviewedBy: d.reviewedByName ?? null,
      reviewedAt: iso(d.reviewedAt),
      result: d.result ?? null,
      error: d.error ?? null,
      link: d.link,
    };
  },
});

/** Drafts a change for an admin to review in Capy. Nothing on the cap table changes here. */
export const draftChange = mutation({
  args: { ...auth, companyId: v.string(), input: v.any(), rationale: v.string() },
  handler: async (ctx, a) => {
    const s = await resolve(ctx, a);
    const c = await company(ctx, s, a.companyId, true);
    const pending = await ctx.db
      .query("changes")
      .withIndex("by_company_status", (q) => q.eq("companyId", c.companyId).eq("status", "pending"))
      .take(maxPendingDrafts);
    if (pending.length >= maxPendingDrafts)
      throw fail(
        "invalid",
        `This company already has ${maxPendingDrafts} drafted changes waiting for review. Ask an admin to review them in Capy first.`,
      );
    const created = await createChangeAs(ctx, s.user, {
      companyId: c.companyId,
      input: a.input,
      rationale: a.rationale,
      clientId: s.clientId,
      ...(s.grant.clientName ? { clientName: s.grant.clientName } : {}),
    });
    return {
      ...created,
      asOf: c.asOf,
      expiresAt: iso(created.expiresAt),
      link: created.reviewPath,
    };
  },
});

// ---------------------------------------------------------------- downloads

function downloadCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** A 15-minute code for `/mcp/files/<code>`, which the Worker redeems and streams. */
export const documentLink = mutation({
  args: { ...auth, companyId: v.string(), documentId: v.string() },
  handler: async (ctx, a) => {
    const { s, c } = await open(ctx, a);
    const id = ctx.db.normalizeId("records", a.documentId);
    const r = id ? await ctx.db.get(id) : null;
    if (!r || r.companyId !== c.companyId || r.kind !== "document")
      throw fail("not_found", "No document with that ID in this company. Use search_documents.");
    if (!r.data?.storageId) throw fail("not_found", "This document has no file.");
    const code = downloadCode(),
      expiresAt = Date.now() + downloadLifetime;
    await ctx.db.insert("mcpDownloads", {
      code,
      userId: s.user._id,
      companyId: c.companyId,
      recordId: r._id,
      expiresAt,
    });
    const info = documentInfo(r, c.to);
    return {
      code,
      path: `/mcp/files/${code}`,
      expiresAt: iso(expiresAt),
      filename: r.title,
      contentType: info.contentType,
      size: info.size,
    };
  },
});

/** The file behind a download code. The code is the credential; it works for 15 minutes. */
export const redeemDownload = query({
  args: { code: v.string(), now: v.number() },
  handler: async (ctx, a) => {
    const gone = () => fail("not_found", "This download link expired. Ask for a new one.");
    if (!Number.isFinite(a.now) || Math.abs(a.now - Date.now()) > skew) throw gone();
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(a.code)) throw gone();
    const d = await ctx.db
      .query("mcpDownloads")
      .withIndex("by_code", (q) => q.eq("code", a.code))
      .unique();
    if (!d || d.expiresAt <= Date.now()) throw gone();
    const [m, r] = await Promise.all([
      ctx.db
        .query("memberships")
        .withIndex("by_company_user", (q) => q.eq("companyId", d.companyId).eq("userId", d.userId))
        .unique(),
      ctx.db.get(d.recordId),
    ]);
    if (!m || !r || r.companyId !== d.companyId || r.kind !== "document" || !r.data?.storageId)
      throw gone();
    const url = await ctx.storage.getUrl(r.data.storageId);
    if (!url) throw gone();
    return {
      url,
      filename: r.title,
      contentType: String(r.data.contentType ?? "") || "application/octet-stream",
      size: Number(r.data.size) || null,
    };
  },
});

// ---------------------------------------------------------------- cleanup (crons.ts)

/** Hourly: drops expired download codes, expires stale drafts, and deletes dead OAuth rows. */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const downloads = await ctx.db
      .query("mcpDownloads")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(1000);
    for (const d of downloads) await ctx.db.delete(d._id);
    const stale = await ctx.db
      .query("changes")
      .withIndex("by_status_expires", (q) => q.eq("status", "pending").lt("expiresAt", now))
      .take(500);
    for (const c of stale) await ctx.db.patch(c._id, { status: "expired" });
    const claims = await ctx.db
      .query("mcpRefreshClaims")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(1000);
    for (const c of claims) await ctx.db.delete(c._id);
    // Access tokens last an hour, so a refresh-expired row is always access-expired too. The
    // adapter treats a missing value as "less than", so each row's own expiry decides.
    const tokens: {
      page: {
        _id: string;
        accessTokenExpiresAt?: number | null;
        refreshTokenExpiresAt?: number | null;
      }[];
    } = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "oauthAccessToken",
      where: [{ field: "accessTokenExpiresAt", operator: "lt", value: now }],
      paginationOpts: { numItems: 500, cursor: null },
    });
    const dead = tokens.page
      .filter((t) => (t.refreshTokenExpiresAt ?? t.accessTokenExpiresAt ?? 0) < now)
      .map((t) => t._id);
    if (dead.length)
      await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
        input: {
          model: "oauthAccessToken",
          where: [{ field: "_id", operator: "in", value: dead }],
        },
        paginationOpts: { numItems: dead.length, cursor: null },
      });
    // Consent codes that were never used, and other expired one-time codes.
    const verifications: { count?: number } = await ctx.runMutation(
      components.betterAuth.adapter.deleteMany,
      {
        input: {
          model: "verification",
          where: [{ field: "expiresAt", operator: "lt", value: now }],
        },
        paginationOpts: { numItems: 500, cursor: null },
      },
    );
    return {
      downloads: downloads.length,
      expiredChanges: stale.length,
      tokens: dead.length,
      verifications: verifications.count ?? 0,
    };
  },
});

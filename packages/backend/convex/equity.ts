import { requireEditing, accessForUser } from "./billing";
import { v, ConvexError } from "convex/values";
import { z } from "zod";
import {
  Decimal,
  D,
  classSchema,
  planSchema,
  decimalSchema,
  importSchema,
  securitySchema,
  stakeholderSchema,
  totals,
  sum,
} from "@capy/equity";
import type { EquityImport, Security, Stakeholder } from "@capy/equity";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authComponent } from "./auth";
import { projectedVested } from "@capy/equity/modeling";

async function user(ctx: QueryCtx | MutationCtx) {
  const u = await authComponent.safeGetAuthUser(ctx);
  if (!u) throw new ConvexError("Sign in to access your company.");
  return u;
}
export type AuthUser = Awaited<ReturnType<typeof user>>;
export async function member(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">,
  write = false,
  editing = write,
) {
  return await memberAs(ctx, await user(ctx), companyId, write, editing);
}
/** Access check for a known user, so internal operator functions can act on their behalf. */
export async function memberAs(
  ctx: QueryCtx | MutationCtx,
  u: AuthUser,
  companyId: Id<"companies">,
  write = false,
  editing = write,
) {
  const m = await ctx.db
    .query("memberships")
    .withIndex("by_company_user", (q) => q.eq("companyId", companyId).eq("userId", u._id))
    .unique();
  if (!m || (write && m.role !== "admin"))
    throw new ConvexError("You don’t have access to this company.");
  if (editing) {
    const company = await ctx.db.get(companyId);
    if (company) await requireEditing(ctx, company.ownerId);
  }
  return u;
}
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ConvexError(
      result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .slice(0, 5)
        .join("; "),
    );
  return result.data;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export const companies = query({
  args: {},
  handler: async (ctx) => {
    const u = await user(ctx);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", u._id))
      .collect();
    const companies = await Promise.all(memberships.map((m) => ctx.db.get(m.companyId)));
    return companies.filter((c) => c?.activeImport);
  },
});
const startArgs = {
  filename: v.string(),
  metadata: v.any(),
  people: v.number(),
  securities: v.number(),
  companyId: v.optional(v.id("companies")),
};
export const startImport = mutation({
  args: startArgs,
  handler: async (ctx, args) => await startImportAs(ctx, await user(ctx), args),
});
export async function startImportAs(
  ctx: MutationCtx,
  u: AuthUser,
  args: {
    filename: string;
    metadata: unknown;
    people: number;
    securities: number;
    companyId?: Id<"companies">;
  },
) {
  await requireEditing(ctx, u._id);
  const data = parse(importSchema, {
    ...(args.metadata as object),
    stakeholders: [],
    securities: [],
  });
  if (!z.iso.date().safeParse(data.asOf).success) throw new ConvexError("Set a valid export date.");
  if (
    !Number.isInteger(args.people) ||
    !Number.isInteger(args.securities) ||
    args.people < 1 ||
    args.securities < 1 ||
    args.people > 5000 ||
    args.securities > 5000
  )
    throw new ConvexError(
      "Imports currently support up to 5,000 stakeholders and 5,000 securities.",
    );
  let companyId = args.companyId;
  if (companyId) {
    await memberAs(ctx, u, companyId, true);
    const company = await ctx.db.get(companyId);
    const prior = company?.activeImport ? await ctx.db.get(company.activeImport) : null;
    if (
      !prior ||
      prior.filename ||
      prior.people ||
      prior.securities ||
      prior.metadata.classes.length ||
      prior.metadata.plans.length
    )
      throw new ConvexError(
        "This company already has equity records. Import into a new company to keep those records intact.",
      );
  } else {
    companyId = await ctx.db.insert("companies", {
      name: data.name,
      ownerId: u._id,
      profile: {},
    });
    await ctx.db.insert("memberships", { companyId, userId: u._id, role: "admin" });
  }
  const importId = await ctx.db.insert("imports", {
    companyId,
    filename: args.filename.slice(0, 300),
    status: "staging",
    metadata: data,
    expectedPeople: args.people,
    expectedSecurities: args.securities,
    people: 0,
    securities: 0,
  });
  return { companyId, importId };
}
export const appendImport = mutation({
  args: { importId: v.id("imports"), stakeholders: v.any(), securities: v.any() },
  handler: async (ctx, args) => await appendImportAs(ctx, await user(ctx), args),
});
export async function appendImportAs(
  ctx: MutationCtx,
  u: AuthUser,
  args: { importId: Id<"imports">; stakeholders: unknown; securities: unknown },
) {
  const imp = await ctx.db.get(args.importId);
  if (!imp) throw new ConvexError("Import not found.");
  await memberAs(ctx, u, imp.companyId, true);
  const people = parse(z.array(stakeholderSchema).max(50), args.stakeholders);
  const securities = parse(z.array(securitySchema).max(50), args.securities);
  let addedPeople = 0,
    addedSecurities = 0;
  for (const p of people) {
    const existing = await ctx.db
      .query("stakeholders")
      .withIndex("by_import_key", (q) => q.eq("importId", imp._id).eq("key", p.key))
      .unique();
    if (existing) {
      if (canonical(existing.data) !== canonical(p))
        throw new ConvexError("Conflicting stakeholder in retried import.");
      continue;
    }
    if (imp.status === "complete") throw new ConvexError("This import is already complete.");
    await ctx.db.insert("stakeholders", {
      companyId: imp.companyId,
      importId: imp._id,
      key: p.key,
      data: p,
      revision: 1,
    });
    addedPeople++;
  }
  for (const s of securities) {
    const existing = await ctx.db
      .query("securities")
      .withIndex("by_import_key", (q) => q.eq("importId", imp._id).eq("key", s.key))
      .unique();
    if (existing) {
      if (canonical(existing.data) !== canonical(s))
        throw new ConvexError("Conflicting security in retried import.");
      continue;
    }
    if (imp.status === "complete") throw new ConvexError("This import is already complete.");
    const person = await ctx.db
      .query("stakeholders")
      .withIndex("by_import_key", (q) => q.eq("importId", imp._id).eq("key", s.stakeholderKey))
      .unique();
    if (!person) throw new ConvexError("Import stakeholders before their securities.");
    await ctx.db.insert("securities", {
      companyId: imp.companyId,
      importId: imp._id,
      key: s.key,
      stakeholderKey: s.stakeholderKey,
      data: s,
      revision: 1,
    });
    addedSecurities++;
  }
  if (
    imp.people + addedPeople > imp.expectedPeople ||
    imp.securities + addedSecurities > imp.expectedSecurities
  )
    throw new ConvexError("Import record counts exceeded the preview.");
  await ctx.db.patch(imp._id, {
    people: imp.people + addedPeople,
    securities: imp.securities + addedSecurities,
  });
}
export const completeImport = mutation({
  args: { importId: v.id("imports") },
  handler: async (ctx, { importId }) => await completeImportAs(ctx, await user(ctx), importId),
});
export async function completeImportAs(ctx: MutationCtx, u: AuthUser, importId: Id<"imports">) {
  const imp = await ctx.db.get(importId);
  if (!imp) throw new ConvexError("Import not found.");
  await memberAs(ctx, u, imp.companyId, true);
  if (imp.status === "complete") return imp.companyId;
  if (imp.people !== imp.expectedPeople || imp.securities !== imp.expectedSecurities)
    throw new ConvexError("Import is incomplete. Retry the remaining records.");
  const securities = await ctx.db
    .query("securities")
    .withIndex("by_import", (q) => q.eq("importId", imp._id))
    .collect();
  for (const cls of (imp.metadata as EquityImport).classes) {
    const outstanding = sum(
      securities
        .filter((s) => s.data.kind === "share" && s.data.className === cls.name)
        .map((s) => s.data.outstanding),
    );
    if (cls.reportedOutstanding !== null && !D(outstanding).eq(cls.reportedOutstanding))
      throw new ConvexError(
        `${cls.name}: imported shares do not match the summary. Upload a complete export.`,
      );
  }
  await ctx.db.patch(imp._id, { status: "complete" });
  const company = await ctx.db.get(imp.companyId);
  if (company?.activeImport && company.activeImport !== imp._id) {
    const prior = await ctx.db.get(company.activeImport);
    const oldPerson = await ctx.db
      .query("stakeholders")
      .withIndex("by_import", (q) => q.eq("importId", company.activeImport!))
      .first();
    const oldSecurity = await ctx.db
      .query("securities")
      .withIndex("by_import", (q) => q.eq("importId", company.activeImport!))
      .first();
    if (
      prior?.filename ||
      oldPerson ||
      oldSecurity ||
      prior?.metadata.classes.length ||
      prior?.metadata.plans.length
    )
      throw new ConvexError(
        "This company changed while importing. Its records were kept intact. Contact us to finish your import.",
      );
  }
  await ctx.db.patch(imp.companyId, { activeImport: imp._id, name: imp.metadata.name });
  await ctx.db.insert("activity", {
    companyId: imp.companyId,
    actor: u.name || u.email,
    description: `Imported ${imp.securities} securities and ${imp.people} stakeholders from ${imp.filename}`,
  });
  return imp.companyId;
}
export const company = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    await member(ctx, companyId);
    const c = await ctx.db.get(companyId);
    if (!c?.activeImport) throw new ConvexError("Company import is not complete.");
    const imp = await ctx.db.get(c.activeImport);
    if (!imp) throw new ConvexError("Import missing.");
    const [people, securities, activity] = await Promise.all([
      ctx.db
        .query("stakeholders")
        .withIndex("by_import", (q) => q.eq("importId", imp._id))
        .collect(),
      ctx.db
        .query("securities")
        .withIndex("by_import", (q) => q.eq("importId", imp._id))
        .collect(),
      ctx.db
        .query("activity")
        .withIndex("by_company", (q) => q.eq("companyId", companyId))
        .order("desc")
        .take(100),
    ]);
    const data: EquityImport = {
      ...imp.metadata,
      name: c.name,
      stakeholders: people.map((p) => p.data as Stakeholder),
      securities: securities.map((s) => s.data as Security),
    };
    return {
      company: c,
      billing: await accessForUser(ctx, c.ownerId),
      data,
      totals: totals(data),
      people: people.map((p) => ({ ...p, data: p.data as Stakeholder })),
      securities: securities.map((s) => ({ ...s, data: s.data as Security })),
      activity,
    };
  },
});
export const saveStakeholder = mutation({
  args: {
    companyId: v.id("companies"),
    id: v.optional(v.id("stakeholders")),
    revision: v.optional(v.number()),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const u = await member(ctx, args.companyId, true);
    const c = await ctx.db.get(args.companyId);
    if (!c?.activeImport) throw new ConvexError("Company unavailable.");
    const p = parse(stakeholderSchema, args.data);
    if (args.id) {
      const prior = await ctx.db.get(args.id);
      if (!prior || prior.companyId !== c._id || prior.importId !== c.activeImport)
        throw new ConvexError("Stakeholder not found.");
      if (prior.revision !== args.revision)
        throw new ConvexError("This stakeholder changed. Refresh and try again.");
      p.key = prior.key;
      await ctx.db.patch(prior._id, { data: p, revision: prior.revision + 1 });
    } else {
      p.key = crypto.randomUUID();
      await ctx.db.insert("stakeholders", {
        companyId: c._id,
        importId: c.activeImport,
        key: p.key,
        data: p,
        revision: 1,
      });
    }
    await ctx.db.insert("activity", {
      companyId: c._id,
      actor: u.name || u.email,
      description: `${args.id ? "Updated" : "Added"} stakeholder ${p.name}`,
    });
    return p.key;
  },
});
export const mergeContacts = mutation({
  args: { companyId: v.id("companies"), contacts: v.any() },
  handler: async (ctx, args) => {
    const u = await member(ctx, args.companyId, true);
    const c = await ctx.db.get(args.companyId);
    if (!c?.activeImport) throw new ConvexError("Company unavailable.");
    const contacts = parse(z.array(stakeholderSchema).max(100), args.contacts);
    const people = await ctx.db
      .query("stakeholders")
      .withIndex("by_import", (q) => q.eq("importId", c.activeImport!))
      .collect();
    const keys = new Set<string>(),
      externalIds = new Set<string>();
    for (const contact of contacts) {
      const name = contact.name.trim().toLocaleLowerCase("en-US");
      if (keys.has(name))
        throw new ConvexError(
          `Duplicate contact name: ${contact.name}. Resolve it before importing.`,
        );
      keys.add(name);
      if (contact.externalId) {
        if (externalIds.has(contact.externalId))
          throw new ConvexError("Duplicate external ID in contact import.");
        externalIds.add(contact.externalId);
      }
      const matches = people.filter(
        (p) =>
          (contact.externalId && p.data.externalId === contact.externalId) ||
          p.data.name.trim().toLocaleLowerCase("en-US") === name,
      );
      if (matches.length > 1)
        throw new ConvexError(
          `Multiple stakeholders match ${contact.name}. Update this person individually.`,
        );
      const prior = matches[0];
      const merged = { ...prior?.data, ...contact, key: prior?.key || crypto.randomUUID() };
      if (prior) await ctx.db.patch(prior._id, { data: merged, revision: prior.revision + 1 });
      else
        await ctx.db.insert("stakeholders", {
          companyId: c._id,
          importId: c.activeImport,
          key: merged.key,
          data: merged,
          revision: 1,
        });
    }
    await ctx.db.insert("activity", {
      companyId: c._id,
      actor: u.name || u.email,
      description: `Imported contact details for ${contacts.length} stakeholders`,
    });
    return contacts.length;
  },
});

export const saveProfile = mutation({
  args: { companyId: v.id("companies"), name: v.string(), profile: v.any() },
  handler: async (ctx, args) => {
    const u = await member(ctx, args.companyId, true);
    const name = parse(z.string().trim().min(1).max(300), args.name);
    const profile = parse(z.record(z.string().max(100), z.string().max(3000)), args.profile);
    await ctx.db.patch(args.companyId, { name, profile });
    await ctx.db.insert("activity", {
      companyId: args.companyId,
      actor: u.name || u.email,
      description: "Updated company profile",
    });
  },
});

export const saveConfiguration = mutation({
  args: {
    companyId: v.id("companies"),
    kind: v.union(v.literal("class"), v.literal("plan")),
    originalName: v.optional(v.string()),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const u = await member(ctx, args.companyId, true);
    const c = await ctx.db.get(args.companyId);
    if (!c?.activeImport) throw new ConvexError("Company unavailable.");
    const imp = await ctx.db.get(c.activeImport);
    if (!imp) throw new ConvexError("Import missing.");
    const metadata = imp.metadata as EquityImport;
    const item =
      args.kind === "class" ? parse(classSchema, args.data) : parse(planSchema, args.data);
    if (!item.name.trim()) throw new ConvexError("Enter a name.");
    if (args.originalName && item.name !== args.originalName)
      throw new ConvexError("Keep the existing name to preserve linked securities.");
    if (args.kind === "class") {
      const list = [...metadata.classes];
      const index = list.findIndex((c) => c.name === item.name);
      if (index >= 0 && !args.originalName)
        throw new ConvexError("A share class with this name already exists.");
      const value = parse(classSchema, item);
      if (index >= 0) list[index] = value;
      else list.push(value);
      metadata.classes = list;
    } else {
      const value = parse(planSchema, item);
      if (D(value.available).gt(value.authorized))
        throw new ConvexError("Available shares cannot exceed plan size.");
      if (!metadata.classes.some((c) => c.name === value.className))
        throw new ConvexError("Choose an existing share class.");
      const list = [...metadata.plans];
      const index = list.findIndex((p) => p.name === item.name);
      if (index >= 0 && !args.originalName)
        throw new ConvexError("A plan with this name already exists.");
      if (index >= 0) list[index] = value;
      else list.push(value);
      metadata.plans = list;
    }
    await ctx.db.patch(imp._id, { metadata });
    await ctx.db.insert("activity", {
      companyId: c._id,
      actor: u.name || u.email,
      description: `${args.originalName ? "Updated" : "Added"} ${args.kind} ${item.name}`,
    });
  },
});

export const saveSecurity = mutation({
  args: {
    companyId: v.id("companies"),
    id: v.optional(v.id("securities")),
    revision: v.optional(v.number()),
    data: v.any(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const u = await member(ctx, args.companyId, true);
    const c = await ctx.db.get(args.companyId);
    if (!c?.activeImport) throw new ConvexError("Company unavailable.");
    const imp = await ctx.db.get(c.activeImport);
    if (!imp) throw new ConvexError("Import missing.");
    const s = parse(securitySchema, args.data),
      metadata = imp.metadata as EquityImport;
    if (!args.reason.trim()) throw new ConvexError("Enter a reason for the recorded change.");
    if (D(s.outstanding).gt(s.issued) || D(s.vested).gt(s.outstanding))
      throw new ConvexError(
        "Outstanding cannot exceed issued, and vested cannot exceed outstanding.",
      );
    if (!z.iso.date().safeParse(s.issuedOn).success)
      throw new ConvexError("Enter a valid issue date.");
    if (
      s.balanceAsOf &&
      (!z.iso.date().safeParse(s.balanceAsOf).success || s.balanceAsOf < s.issuedOn)
    )
      throw new ConvexError("Balance date must be on or after the issue date.");
    const holder = await ctx.db
      .query("stakeholders")
      .withIndex("by_import_key", (q) => q.eq("importId", imp._id).eq("key", s.stakeholderKey))
      .unique();
    if (!holder) throw new ConvexError("Select an existing stakeholder.");
    const previous = args.id ? await ctx.db.get(args.id) : null;
    if (args.id && (!previous || previous.companyId !== c._id || previous.importId !== imp._id))
      throw new ConvexError("Security not found.");
    if (previous && previous.revision !== args.revision)
      throw new ConvexError("This security changed. Refresh and try again.");
    const old = previous?.data as Security | undefined;
    if (
      old &&
      (old.kind !== s.kind || old.planName !== s.planName || old.className !== s.className)
    )
      throw new ConvexError("Security type, class and plan are fixed after creation.");
    const convertible = s.kind === "safe" || s.kind === "note";
    const shareClass = metadata.classes.find((c) => c.name === s.className);
    if (!convertible && !shareClass) throw new ConvexError("Select an existing share class.");
    if (s.planName && !old && s.kind === "share")
      throw new ConvexError("Record plan stock by exercising its option grant.");
    if (s.planName && s.kind !== "share") {
      const plan = metadata.plans.find((p) => p.name === s.planName);
      if (!plan || plan.className !== s.className)
        throw new ConvexError("Select a plan for this share class.");
      const delta = D(s.issued).minus(old?.issued || 0);
      const available = D(plan.available).minus(delta);
      if (available.lt(0) || available.gt(plan.authorized))
        throw new ConvexError("The plan does not have enough available shares for this change.");
      plan.available = available.toFixed();
    }
    if (s.kind === "share" && shareClass) {
      if (shareClass.capital !== null)
        shareClass.capital = D(shareClass.capital)
          .plus(D(s.capital).minus(old?.capital || 0))
          .toFixed();
      if (shareClass.reportedOutstanding !== null)
        shareClass.reportedOutstanding = D(shareClass.reportedOutstanding)
          .plus(D(s.outstanding).minus(old?.outstanding || 0))
          .toFixed();
      if (
        shareClass.authorized !== null &&
        shareClass.reportedOutstanding !== null &&
        D(shareClass.reportedOutstanding).gt(shareClass.authorized)
      )
        throw new ConvexError("This issuance exceeds the share class authorization.");
    }
    s.key = old?.key || crypto.randomUUID();
    s.sourceSheet = old?.sourceSheet || "Recorded in Capy";
    s.sourceRow = old?.sourceRow || 0;
    if (previous)
      await ctx.db.patch(previous._id, {
        data: s,
        stakeholderKey: s.stakeholderKey,
        revision: previous.revision + 1,
      });
    else
      await ctx.db.insert("securities", {
        companyId: c._id,
        importId: imp._id,
        key: s.key,
        stakeholderKey: s.stakeholderKey,
        data: s,
        revision: 1,
      });
    await ctx.db.patch(imp._id, { metadata });
    await ctx.db.insert("activity", {
      companyId: c._id,
      actor: u.name || u.email,
      description: `${previous ? "Updated" : "Recorded"} ${s.certificate}: ${args.reason}`,
      details: { before: old || null, after: s },
    });
    return s.key;
  },
});

export const securityEvent = mutation({
  args: {
    companyId: v.id("companies"),
    id: v.id("securities"),
    revision: v.number(),
    event: v.union(v.literal("cancel"), v.literal("exercise")),
    quantity: v.string(),
    date: v.string(),
    reason: v.string(),
    certificate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const u = await member(ctx, args.companyId, true);
    const c = await ctx.db.get(args.companyId),
      record = await ctx.db.get(args.id);
    if (
      !c?.activeImport ||
      !record ||
      record.companyId !== c._id ||
      record.importId !== c.activeImport
    )
      throw new ConvexError("Security not found.");
    if (record.revision !== args.revision)
      throw new ConvexError("This security changed. Refresh and try again.");
    const qty = D(parse(decimalSchema, args.quantity));
    const s = record.data as Security;
    if (qty.lte(0) || qty.gt(s.outstanding))
      throw new ConvexError("Enter a positive quantity no greater than the outstanding balance.");
    if (!z.iso.date().safeParse(args.date).success || !args.reason.trim())
      throw new ConvexError("Enter the event date and reason.");
    const imp = await ctx.db.get(c.activeImport);
    if (!imp) throw new ConvexError("Import missing.");
    const meta = imp.metadata as EquityImport;
    if (args.date < (s.balanceAsOf || meta.asOf) || (s.issuedOn && args.date < s.issuedOn))
      throw new ConvexError(
        "Record events on or after the imported snapshot and issue date. Use Edit to correct historical data.",
      );
    const before = { ...s, fields: { ...s.fields } };
    const vestedAtEvent = projectedVested(s, meta.asOf, args.date);
    if (vestedAtEvent !== null) s.vested = vestedAtEvent;
    const plan = meta.plans.find((p) => p.name === s.planName),
      cls = meta.classes.find((c) => c.name === s.className);
    let createdKey: string | null = null;
    if (args.event === "exercise") {
      if (s.kind !== "option") throw new ConvexError("Only options can be exercised here.");
      if (!args.certificate?.trim() || !cls || s.price === null)
        throw new ConvexError(
          "Enter a certificate label and ensure the option has an exercise price and share class.",
        );
      if (s.fields["Early Exercise"] !== "Yes" && (s.vested === null || qty.gt(s.vested)))
        throw new ConvexError("Exercise exceeds the vested balance. Confirm vesting first.");
      if (
        cls.authorized !== null &&
        cls.reportedOutstanding !== null &&
        D(cls.reportedOutstanding).plus(qty).gt(cls.authorized)
      )
        throw new ConvexError("This exercise would exceed the share class authorization.");
      const paid = qty.mul(s.price).toFixed();
      createdKey = crypto.randomUUID();
      const share: Security = {
        ...s,
        key: createdKey,
        certificate: args.certificate,
        kind: "share",
        issued: qty.toFixed(),
        outstanding: qty.toFixed(),
        vested: s.vested === null ? null : Decimal.min(s.vested, qty).toFixed(),
        capital: paid,
        issuedOn: args.date,
        balanceAsOf: args.date,
        status: "Outstanding",
        sourceSheet: "Recorded in Capy",
        sourceRow: 0,
        fields: {
          Source: `Exercised from ${s.certificate}`,
          "Exercise Date": args.date,
          Comments: args.reason,
        },
      };
      await ctx.db.insert("securities", {
        companyId: c._id,
        importId: imp._id,
        key: share.key,
        stakeholderKey: s.stakeholderKey,
        data: share,
        revision: 1,
      });
      s.fields["Exercised/Settled"] = D(s.fields["Exercised/Settled"]).plus(qty).toFixed();
      s.fields["Dates of Exercise/Settlements"] = [
        s.fields["Dates of Exercise/Settlements"],
        `${qty.toFixed()} options exercised on ${args.date}`,
      ]
        .filter(Boolean)
        .join("; ");
      if (s.vested !== null) s.vested = Decimal.max(0, D(s.vested).minus(qty)).toFixed();
      if (cls.capital !== null) cls.capital = D(cls.capital).plus(paid).toFixed();
      if (cls.reportedOutstanding !== null)
        cls.reportedOutstanding = D(cls.reportedOutstanding).plus(qty).toFixed();
    } else {
      const field = s.kind === "share" ? "Shares Cancelled" : "Amount Cancelled";
      s.fields[field] = D(s.fields[field]).plus(qty).toFixed();
      s.fields["Cancellation Date"] = args.date;
      s.fields["Cancellation Reason"] = args.reason;
      if (plan && s.kind !== "share") plan.available = D(plan.available).plus(qty).toFixed();
      if (cls && s.kind === "share" && cls.reportedOutstanding !== null)
        cls.reportedOutstanding = D(cls.reportedOutstanding).minus(qty).toFixed();
      if (s.vested !== null)
        s.vested = Decimal.min(s.vested, D(s.outstanding).minus(qty)).toFixed();
    }
    s.outstanding = D(s.outstanding).minus(qty).toFixed();
    s.balanceAsOf = args.date;
    if (D(s.outstanding).eq(0)) s.status = args.event === "exercise" ? "Exercised" : "Cancelled";
    await ctx.db.patch(record._id, { data: s, revision: record.revision + 1 });
    await ctx.db.patch(imp._id, { metadata: meta });
    await ctx.db.insert("activity", {
      companyId: c._id,
      actor: u.name || u.email,
      description: `Recorded ${args.event} of ${qty.toFixed()} from ${s.certificate} on ${args.date}: ${args.reason}`,
      details: { before, after: s },
    });
    return createdKey;
  },
});

export const createCompany = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const u = await user(ctx);
    await requireEditing(ctx, u._id);
    const data = parse(importSchema, {
      name: name.trim(),
      asOf: new Date().toISOString().slice(0, 10),
      stakeholders: [],
      securities: [],
      classes: [],
      plans: [],
      sheets: [],
      warnings: [],
    });
    const companyId = await ctx.db.insert("companies", {
      name: data.name,
      ownerId: u._id,
      profile: {},
    });
    await ctx.db.insert("memberships", { companyId, userId: u._id, role: "admin" });
    const importId = await ctx.db.insert("imports", {
      companyId,
      filename: "",
      status: "complete",
      metadata: data,
      expectedPeople: 0,
      expectedSecurities: 0,
      people: 0,
      securities: 0,
    });
    await ctx.db.patch(companyId, { activeImport: importId });
    await ctx.db.insert("activity", {
      companyId,
      actor: u.name || u.email,
      description: "Created company",
    });
    return companyId;
  },
});

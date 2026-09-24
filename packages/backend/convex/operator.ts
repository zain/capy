// Internal functions for the Capy team to run assisted imports with `convex run`.
// None of these are callable from the browser.
import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { appendImportAs, completeImportAs, parse, startImportAs, type AuthUser } from "./equity";

const importedBy = "Capy import team";

async function userByEmail(ctx: QueryCtx | MutationCtx, email: string) {
  const u = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: email.trim().toLowerCase() }],
  })) as AuthUser | null;
  if (!u) throw new ConvexError(`No Capy account for ${email}.`);
  return u;
}

export const findUser = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const u = await userByEmail(ctx, email);
    return { id: u._id, email: u.email, name: u.name };
  },
});

export const startImport = internalMutation({
  args: {
    ownerEmail: v.string(),
    filename: v.string(),
    metadata: v.any(),
    people: v.number(),
    securities: v.number(),
  },
  handler: async (ctx, { ownerEmail, ...args }) =>
    await startImportAs(ctx, await userByEmail(ctx, ownerEmail), args),
});

export const appendImport = internalMutation({
  args: {
    ownerEmail: v.string(),
    importId: v.id("imports"),
    stakeholders: v.any(),
    securities: v.any(),
  },
  handler: async (ctx, { ownerEmail, ...args }) =>
    await appendImportAs(ctx, await userByEmail(ctx, ownerEmail), args),
});

export const completeImport = internalMutation({
  args: { ownerEmail: v.string(), importId: v.id("imports") },
  handler: async (ctx, { ownerEmail, importId }) => {
    const u = await userByEmail(ctx, ownerEmail);
    return await completeImportAs(ctx, { ...u, name: importedBy }, importId);
  },
});

export const uploadUrls = internalMutation({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    if (!Number.isInteger(count) || count < 1 || count > 100)
      throw new ConvexError("Request between 1 and 100 upload URLs.");
    return await Promise.all(Array.from({ length: count }, () => ctx.storage.generateUploadUrl()));
  },
});

const documentSchema = z.object({
  source: z.string().max(200).optional(),
  storageId: z.string(),
  filename: z.string().min(1).max(300),
  category: z.string().min(1).max(100),
  certificates: z.array(z.string().max(100)).max(200),
});
export const attachDocuments = internalMutation({
  // Pass `total` with the last batch to log one activity entry for the whole upload.
  args: { companyId: v.id("companies"), documents: v.any(), total: v.optional(v.number()) },
  handler: async (ctx, { companyId, documents, total }) => {
    const files = parse(z.array(documentSchema).max(100), documents);
    for (const f of files) {
      const storageId = f.storageId as Id<"_storage">;
      const meta = await ctx.db.system.get(storageId);
      if (!meta) throw new ConvexError(`Upload missing for ${f.filename}.`);
      await ctx.db.insert("records", {
        companyId,
        kind: "document",
        title: f.filename,
        status: "Recorded",
        data: {
          storageId,
          category: f.category,
          certificates: f.certificates.join(", "),
          ...(f.source ? { source: f.source } : {}),
          size: String(meta.size),
          contentType: meta.contentType || "",
          uploadedBy: importedBy,
        },
        revision: 1,
      });
    }
    if (total)
      await ctx.db.insert("activity", {
        companyId,
        actor: importedBy,
        description: `Added ${total} documents from Pulley`,
      });
  },
});

const recordSchema = z.object({
  kind: z.enum(["approval", "valuation", "contact"]),
  title: z.string().min(1).max(300),
  status: z.enum(["Draft", "Recorded"]),
  data: z.record(z.string().max(100), z.string().max(100000)),
});
export const addRecords = internalMutation({
  args: { companyId: v.id("companies"), records: v.any() },
  handler: async (ctx, { companyId, records }) => {
    const items = parse(z.array(recordSchema).max(500), records);
    for (const r of items) await ctx.db.insert("records", { companyId, ...r, revision: 1 });
    await ctx.db.insert("activity", {
      companyId,
      actor: importedBy,
      description: `Added ${items.length} approvals, valuations and contacts from Pulley`,
    });
  },
});

/** The company's stored cap table, for checking a finished import against its source. */
export const companySnapshot = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const company = await ctx.db.get(companyId);
    if (!company?.activeImport) throw new ConvexError("This company has no completed import.");
    const imp = await ctx.db.get(company.activeImport);
    const stakeholders = await ctx.db
      .query("stakeholders")
      .withIndex("by_import", (q) => q.eq("importId", company.activeImport!))
      .collect();
    const securities = await ctx.db
      .query("securities")
      .withIndex("by_import", (q) => q.eq("importId", company.activeImport!))
      .collect();
    const records = await ctx.db
      .query("records")
      .withIndex("by_company_kind", (q) => q.eq("companyId", companyId))
      .collect();
    return {
      ...imp!.metadata,
      stakeholders: stakeholders.map((s) => s.data),
      securities: securities.map((s) => s.data),
      records: records.map((r) => ({
        kind: r.kind,
        title: r.title,
        status: r.status,
        source: r.data?.source ?? null,
      })),
    };
  },
});

/** Fills company profile fields that are still blank. */
export const setProfile = internalMutation({
  args: { companyId: v.id("companies"), profile: v.any() },
  handler: async (ctx, { companyId, profile }) => {
    const values = parse(z.record(z.string().max(100), z.string().max(3000)), profile);
    const company = await ctx.db.get(companyId);
    if (!company) throw new ConvexError("Company not found.");
    const merged = { ...company.profile };
    for (const [k, value] of Object.entries(values)) if (!merged[k]) merged[k] = value;
    await ctx.db.patch(companyId, { profile: merged });
  },
});

const fieldUpdates = z
  .array(
    z.object({ key: z.string(), fields: z.record(z.string().max(200), z.string().max(20000)) }),
  )
  .max(500);
/** Adds fields to already imported stakeholders and securities, keeping existing values. */
export const mergeFields = internalMutation({
  args: { companyId: v.id("companies"), stakeholders: v.any(), securities: v.any() },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company?.activeImport) throw new ConvexError("This company has no completed import.");
    let changed = 0;
    for (const [table, updates] of [
      ["stakeholders", parse(fieldUpdates, args.stakeholders)],
      ["securities", parse(fieldUpdates, args.securities)],
    ] as const)
      for (const u of updates) {
        const row = await ctx.db
          .query(table)
          .withIndex("by_import_key", (q) =>
            q.eq("importId", company.activeImport!).eq("key", u.key),
          )
          .unique();
        if (!row) throw new ConvexError(`No ${table} record ${u.key}.`);
        const fields = { ...row.data.fields };
        for (const [k, value] of Object.entries(u.fields)) if (!fields[k]) fields[k] = value;
        await ctx.db.patch(row._id, { data: { ...row.data, fields }, revision: row.revision + 1 });
        changed++;
      }
    await ctx.db.insert("activity", {
      companyId: args.companyId,
      actor: importedBy,
      description: `Added details from Pulley to ${changed} records`,
    });
  },
});

/** Gives a user admin access. With `owner`, also moves ownership (and billing) to them. */
export const shareCompany = internalMutation({
  args: { companyId: v.id("companies"), email: v.string(), owner: v.boolean() },
  handler: async (ctx, { companyId, email, owner }) => {
    const u = await userByEmail(ctx, email);
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_company_user", (q) => q.eq("companyId", companyId).eq("userId", u._id))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { role: "admin" });
    else await ctx.db.insert("memberships", { companyId, userId: u._id, role: "admin" });
    if (owner) await ctx.db.patch(companyId, { ownerId: u._id });
    await ctx.db.insert("activity", {
      companyId,
      actor: importedBy,
      description: `Gave ${u.email} admin access${owner ? " and ownership" : ""}`,
    });
  },
});

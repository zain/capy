import { v, ConvexError } from "convex/values";
import { z } from "zod";
import {
  recordDataSchema,
  recordKindSchema,
  recordStatusSchema,
  recordTitleSchema,
} from "@capy/equity/changes";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { member, memberAs, parse, user, type AuthUser, type ChangeMeta } from "./equity";

export const list = query({
  args: { companyId: v.id("companies"), kind: v.string() },
  handler: async (ctx, args) => {
    await member(ctx, args.companyId);
    parse(recordKindSchema, args.kind);
    return await ctx.db
      .query("records")
      .withIndex("by_company_kind", (q) => q.eq("companyId", args.companyId).eq("kind", args.kind))
      .order("desc")
      .collect();
  },
});
export const save = mutation({
  args: {
    companyId: v.id("companies"),
    id: v.optional(v.id("records")),
    revision: v.optional(v.number()),
    kind: v.string(),
    title: v.string(),
    status: v.string(),
    data: v.any(),
  },
  handler: async (ctx, args) => await saveRecordAs(ctx, await user(ctx), args),
});
export async function saveRecordAs(
  ctx: MutationCtx,
  u: AuthUser,
  args: {
    companyId: Id<"companies">;
    id?: Id<"records">;
    revision?: number;
    kind: string;
    title: string;
    status: string;
    data: unknown;
  },
  meta?: ChangeMeta,
) {
  await memberAs(ctx, u, args.companyId, true);
  parse(recordKindSchema, args.kind);
  const title = parse(recordTitleSchema, args.title),
    status = parse(recordStatusSchema, args.status);
  const data = parse(recordDataSchema, args.data);
  const previous = args.id ? await ctx.db.get(args.id) : null;
  if (
    args.id &&
    (!previous || previous.companyId !== args.companyId || previous.kind !== args.kind)
  )
    throw new ConvexError("Record not found.");
  if (previous && previous.revision !== args.revision)
    throw new ConvexError("This record changed. Refresh and try again.");
  const value = {
    companyId: args.companyId,
    kind: args.kind,
    title,
    status,
    data,
    revision: (previous?.revision || 0) + 1,
  };
  const id = previous
    ? (await ctx.db.patch(previous._id, value), previous._id)
    : await ctx.db.insert("records", value);
  await ctx.db.insert("activity", {
    companyId: args.companyId,
    actor: u.name || u.email,
    description: `${previous ? "Updated" : "Added"} ${args.kind}: ${title}`,
    ...(meta && Object.keys(meta).length ? { details: meta } : {}),
  });
  return id;
}
export const uploadUrl = mutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    await member(ctx, companyId, true);
    return await ctx.storage.generateUploadUrl();
  },
});
export const attach = mutation({
  args: {
    companyId: v.id("companies"),
    storageId: v.id("_storage"),
    filename: v.string(),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const u = await member(ctx, args.companyId, true);
    const meta = await ctx.db.system.get(args.storageId);
    if (!meta || meta.size > 30 * 1024 * 1024) throw new ConvexError("Choose a file under 30 MB.");
    const filename = parse(z.string().min(1).max(300), args.filename);
    const id = await ctx.db.insert("records", {
      companyId: args.companyId,
      kind: "document",
      title: filename,
      status: "Recorded",
      data: {
        storageId: args.storageId,
        category: args.category.slice(0, 100),
        size: String(meta.size),
        contentType: meta.contentType || "",
        uploadedBy: u.name,
      },
      revision: 1,
    });
    await ctx.db.insert("activity", {
      companyId: args.companyId,
      actor: u.name || u.email,
      description: `Uploaded ${filename}`,
    });
    return id;
  },
});
export const download = query({
  args: { id: v.id("records") },
  handler: async (ctx, { id }) => {
    const record = await ctx.db.get(id);
    if (!record) throw new ConvexError("File not found.");
    await member(ctx, record.companyId);
    if (record.kind !== "document" || !record.data.storageId)
      throw new ConvexError("This record has no file.");
    return await ctx.storage.getUrl(record.data.storageId);
  },
});

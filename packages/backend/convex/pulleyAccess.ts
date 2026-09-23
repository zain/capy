import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation } from "./_generated/server";

// Credentials are deleted after the import, and never kept longer than this.
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function clean(value: string | undefined, max: number, label: string, required = true) {
  const text = value?.trim() ?? "";
  if ((required && !text) || text.length > max) throw new Error(`Please check ${label}.`);
  return text || undefined;
}

export const submit = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    company: v.string(),
    method: v.union(v.literal("password"), v.literal("invite")),
    pulleyEmail: v.optional(v.string()),
    encryptedPassword: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = clean(args.email, 254, "your email")!;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please check your email.");
    const password = args.method === "password";
    const encryptedPassword = password
      ? clean(args.encryptedPassword, 1024, "your Pulley password")
      : undefined;
    const id = await ctx.db.insert("pulleyAccessRequests", {
      name: clean(args.name, 120, "your name")!,
      email,
      company: clean(args.company, 160, "your company name")!,
      method: args.method,
      pulleyEmail: password ? clean(args.pulleyEmail, 254, "your Pulley email") : undefined,
      encryptedPassword,
      notes: clean(args.notes, 2000, "your notes", false),
    });
    if (encryptedPassword)
      await ctx.scheduler.runAfter(RETENTION_MS, internal.pulleyAccess.forget, { id });
    return id;
  },
});

/** Operator-only. Read with `bun scripts/pulley-access.ts`, which decrypts locally. */
export const list = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("pulleyAccessRequests").order("desc").take(50),
});

/** Deletes a stored password. Run after the import, and automatically after 30 days. */
export const forget = internalMutation({
  args: { id: v.id("pulleyAccessRequests") },
  handler: async (ctx, { id }) => {
    const request = await ctx.db.get(id);
    if (request?.encryptedPassword) await ctx.db.patch(id, { encryptedPassword: undefined });
  },
});

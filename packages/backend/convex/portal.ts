import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { member } from "./equity";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { Security } from "@capy/equity";

async function holdings(ctx: QueryCtx, companyId: Id<"companies">, key: string) {
  const company = await ctx.db.get(companyId);
  if (!company?.activeImport) throw new ConvexError("Company unavailable.");
  const person = await ctx.db
    .query("stakeholders")
    .withIndex("by_import_key", (q) => q.eq("importId", company.activeImport!).eq("key", key))
    .unique();
  if (!person) throw new ConvexError("Stakeholder unavailable.");
  const all = await ctx.db
    .query("securities")
    .withIndex("by_import", (q) => q.eq("importId", company.activeImport!))
    .collect();
  const imp = await ctx.db.get(company.activeImport);
  return {
    companyName: company.name,
    name: person.data.name,
    asOf: imp?.metadata.asOf as string,
    securities: all
      .filter((s) => s.stakeholderKey === key)
      .map(({ data }: { data: Security }) => ({
        key: data.key,
        certificate: data.certificate,
        kind: data.kind,
        className: data.className,
        planName: data.planName,
        issued: data.issued,
        outstanding: data.outstanding,
        price: data.price,
        vested: data.vested,
        issuedOn: data.issuedOn,
        balanceAsOf: data.balanceAsOf || (imp?.metadata.asOf as string),
        vestingStart: data.vestingStart,
        vestingSchedule: data.vestingSchedule,
        status: data.status,
      })),
  };
}
export const list = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await member(ctx, args.companyId, true, false);
    const grants = await ctx.db
      .query("portalGrants")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
    return grants.map(({ token: _token, ...g }) => g);
  },
});
export const invite = mutation({
  args: { companyId: v.id("companies"), stakeholderKey: v.string() },
  handler: async (ctx, args) => {
    const u = await member(ctx, args.companyId, true);
    const data = await holdings(ctx, args.companyId, args.stakeholderKey);
    const token = crypto.randomUUID() + crypto.randomUUID();
    await ctx.db.insert("portalGrants", {
      ...args,
      token,
      expiresAt: Date.now() + 7 * 86400000,
      revoked: false,
    });
    await ctx.db.insert("activity", {
      companyId: args.companyId,
      actor: u.name || u.email,
      description: `Created a private portal invitation for ${data.name}`,
    });
    return token;
  },
});
export const revoke = mutation({
  args: { grantId: v.id("portalGrants") },
  handler: async (ctx, args) => {
    const g = await ctx.db.get(args.grantId);
    if (!g) throw new ConvexError("Invitation unavailable.");
    const u = await member(ctx, g.companyId, true, false);
    await ctx.db.patch(g._id, { revoked: true });
    await ctx.db.insert("activity", {
      companyId: g.companyId,
      actor: u.name || u.email,
      description: "Revoked stakeholder portal access",
    });
  },
});
export const claim = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const u = await authComponent.safeGetAuthUser(ctx);
    if (!u) throw new ConvexError("Sign in to accept this invitation.");
    const g = await ctx.db
      .query("portalGrants")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!g || g.revoked || (!g.userId && g.expiresAt < Date.now()))
      throw new ConvexError(
        "This invitation has expired or been revoked. Ask your company for a new link.",
      );
    if (g.userId && g.userId !== u._id)
      throw new ConvexError("This invitation has already been accepted by another account.");
    await ctx.db.patch(g._id, { userId: u._id });
    return g._id;
  },
});
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const u = await authComponent.safeGetAuthUser(ctx);
    if (!u) return [];
    const grants = await ctx.db
      .query("portalGrants")
      .withIndex("by_user", (q) => q.eq("userId", u._id))
      .collect();
    return await Promise.all(
      grants
        .filter((g) => !g.revoked)
        .map(async (g) => ({
          id: g._id,
          name: (await ctx.db.get(g.companyId))?.name || "Company",
        })),
    );
  },
});
export const view = query({
  args: { grantId: v.id("portalGrants") },
  handler: async (ctx, args) => {
    const u = await authComponent.safeGetAuthUser(ctx),
      g = await ctx.db.get(args.grantId);
    if (!u || !g || g.revoked || g.userId !== u._id)
      throw new ConvexError("This portal is unavailable to your account.");
    return holdings(ctx, g.companyId, g.stakeholderKey);
  },
});
export const preview = query({
  args: { companyId: v.id("companies"), stakeholderKey: v.string() },
  handler: async (ctx, args) => {
    await member(ctx, args.companyId, true, false);
    return holdings(ctx, args.companyId, args.stakeholderKey);
  },
});

import { v, ConvexError } from "convex/values";
import { z } from "zod";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authComponent } from "./auth";
import { member, user } from "./equity";
import { acceptProblem, invitationDays, isPending, normalizeEmail } from "./teamRules";

export const list = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const u = await member(ctx, companyId, true, false);
    const company = await ctx.db.get(companyId);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_company_user", (q) => q.eq("companyId", companyId))
      .collect();
    const members = await Promise.all(
      memberships.map(async (m) => {
        const person = await authComponent.getAnyUserById(ctx, m.userId);
        return {
          userId: m.userId,
          name: person?.name || "",
          email: person?.email || "Unknown account",
          role: m.role,
          owner: m.userId === company?.ownerId,
          you: m.userId === u._id,
        };
      }),
    );
    const now = Date.now();
    const invitations = (
      await ctx.db
        .query("adminInvitations")
        .withIndex("by_company", (q) => q.eq("companyId", companyId))
        .collect()
    )
      .filter((i) => isPending(i, now))
      .map(({ _id, email, invitedBy, expiresAt }) => ({ _id, email, invitedBy, expiresAt }));
    members.sort((x, y) => Number(y.owner) - Number(x.owner) || x.email.localeCompare(y.email));
    return { members, invitations };
  },
});

export const invite = mutation({
  args: { companyId: v.id("companies"), email: v.string() },
  handler: async (ctx, args) => {
    const u = await member(ctx, args.companyId, true, false);
    return await createInvitation(ctx, args.companyId, args.email, u.name || u.email);
  },
});

/** Makes an admin invitation for `email` and returns its token. */
export async function createInvitation(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  rawEmail: string,
  invitedBy: string,
) {
  const email = normalizeEmail(rawEmail);
  if (!z.email().safeParse(email).success) throw new ConvexError("Enter a valid email address.");
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_company_user", (q) => q.eq("companyId", companyId))
    .collect();
  for (const m of memberships)
    if (
      m.role === "admin" &&
      normalizeEmail((await authComponent.getAnyUserById(ctx, m.userId))?.email || "") === email
    )
      throw new ConvexError(`${email} is already an admin of this company.`);
  // One live link per email, so an older forwarded link stops working.
  const now = Date.now();
  for (const old of await ctx.db
    .query("adminInvitations")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect())
    if (old.email === email && isPending(old, now)) await ctx.db.patch(old._id, { revoked: true });
  const token = crypto.randomUUID() + crypto.randomUUID();
  await ctx.db.insert("adminInvitations", {
    companyId,
    email,
    token,
    invitedBy,
    expiresAt: now + invitationDays * 86400000,
    revoked: false,
  });
  await ctx.db.insert("activity", {
    companyId,
    actor: invitedBy,
    description: `Invited ${email} as an admin`,
  });
  return token;
}

export const revoke = mutation({
  args: { invitationId: v.id("adminInvitations") },
  handler: async (ctx, { invitationId }) => {
    const inv = await ctx.db.get(invitationId);
    if (!inv) throw new ConvexError("Invitation unavailable.");
    const u = await member(ctx, inv.companyId, true, false);
    await ctx.db.patch(inv._id, { revoked: true });
    await ctx.db.insert("activity", {
      companyId: inv.companyId,
      actor: u.name || u.email,
      description: `Revoked the admin invitation for ${inv.email}`,
    });
  },
});

export const remove = mutation({
  args: { companyId: v.id("companies"), userId: v.string() },
  handler: async (ctx, { companyId, userId }) => {
    const u = await member(ctx, companyId, true, false);
    const company = await ctx.db.get(companyId);
    if (company?.ownerId === userId)
      throw new ConvexError(
        "The company owner can't be removed. Contact support to move ownership.",
      );
    const m = await ctx.db
      .query("memberships")
      .withIndex("by_company_user", (q) => q.eq("companyId", companyId).eq("userId", userId))
      .unique();
    if (!m) throw new ConvexError("That account doesn't have access to this company.");
    await ctx.db.delete(m._id);
    const person = await authComponent.getAnyUserById(ctx, userId);
    await ctx.db.insert("activity", {
      companyId,
      actor: u.name || u.email,
      description: `Removed ${person?.email || "an account"}'s access`,
    });
  },
});

/** What the accept page shows: who invited whom to which company, and any reason it can't be accepted. */
export const invitation = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const u = await user(ctx);
    const inv = await ctx.db
      .query("adminInvitations")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    const problem = acceptProblem(inv, { id: u._id, email: u.email }, Date.now());
    if (!inv) return { problem, wrongAccount: false, companyName: null, invitedBy: null };
    return {
      problem,
      wrongAccount: !inv.acceptedBy && normalizeEmail(u.email) !== inv.email,
      companyName: (await ctx.db.get(inv.companyId))?.name || "Company",
      email: inv.email,
      invitedBy: inv.invitedBy,
    };
  },
});

export const accept = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const u = await user(ctx);
    const inv = await ctx.db
      .query("adminInvitations")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    const problem = acceptProblem(inv, { id: u._id, email: u.email }, Date.now());
    if (problem || !inv) throw new ConvexError(problem ?? "Invitation unavailable.");
    if (inv.acceptedBy) return inv.companyId;
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_company_user", (q) => q.eq("companyId", inv.companyId).eq("userId", u._id))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { role: "admin" });
    else
      await ctx.db.insert("memberships", {
        companyId: inv.companyId,
        userId: u._id,
        role: "admin",
      });
    await ctx.db.patch(inv._id, { acceptedBy: u._id });
    await ctx.db.insert("activity", {
      companyId: inv.companyId,
      actor: u.name || u.email,
      description: `Accepted ${inv.invitedBy}'s admin invitation`,
    });
    return inv.companyId;
  },
});

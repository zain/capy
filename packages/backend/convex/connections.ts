// Connected AI apps (MCP OAuth clients): the consent page, and Account → Connected apps.
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";

type Ctx = QueryCtx | MutationCtx;
type OAuthApp = { name?: string | null; redirectUrls?: string | null; disabled?: boolean | null };
type PendingAuthorization = {
  clientId: string;
  redirectURI: string;
  scope?: string[];
  userId: string;
  requireConsent?: boolean;
  state?: string | null;
};

const expired = () =>
  new ConvexError("This request has expired. Start connecting again from your AI app.");

async function signedIn(ctx: Ctx) {
  const u = await authComponent.safeGetAuthUser(ctx);
  if (!u) throw new ConvexError("Sign in to manage connected apps.");
  return u;
}

/** The grant a user gave an OAuth client, or null when they never approved it or revoked it. */
export async function findGrant(ctx: Ctx, userId: string, clientId: string) {
  return await ctx.db
    .query("mcpGrants")
    .withIndex("by_user_client", (q) => q.eq("userId", userId).eq("clientId", clientId))
    .unique();
}

/** Companies with a cap table that the user belongs to, with their role. */
async function memberCompanies(ctx: Ctx, userId: string) {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const rows = await Promise.all(
    memberships.map(async (m) => {
      const c = await ctx.db.get(m.companyId);
      return c?.activeImport ? { companyId: c._id, name: c.name, role: m.role } : null;
    }),
  );
  return rows.filter((r) => r !== null).sort((a, b) => a.name.localeCompare(b.name));
}

async function oauthApp(ctx: Ctx, clientId: string) {
  return (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "oauthApplication",
    where: [{ field: "clientId", value: clientId }],
  })) as OAuthApp | null;
}

/** Where the app sends the user back to, which the app itself cannot fake the way it can a name. */
export function redirectHost(uri: string | null | undefined) {
  if (!uri) return { host: "", local: false };
  try {
    const url = new URL(uri);
    const host =
      url.protocol === "http:" || url.protocol === "https:"
        ? url.host
        : `${url.protocol}//${url.host}`;
    return { host, local: ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) };
  } catch {
    return { host: uri, local: false };
  }
}

/** The user's pending authorization behind a consent code, or null once used, expired or not theirs. */
async function pendingAuthorization(ctx: Ctx, userId: string, consentCode: string) {
  const row = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "verification",
    where: [{ field: "identifier", value: consentCode }],
  })) as { value: string; expiresAt: number } | null;
  let p: PendingAuthorization | null = null;
  try {
    p = row ? JSON.parse(row.value) : null;
  } catch {}
  if (!row || !p || typeof p !== "object" || p.userId !== userId || !p.requireConsent) return null;
  if (row.expiresAt < Date.now()) return null;
  const app = await oauthApp(ctx, p.clientId);
  if (!app || app.disabled) return null;
  return { p, app, expiresAt: row.expiresAt };
}

async function saveGrant(
  ctx: MutationCtx,
  userId: string,
  clientId: string,
  clientName: string | undefined,
  companyIds: Id<"companies">[],
  allowDrafts: boolean,
) {
  const ids = [...new Set(companyIds)];
  if (!ids.length) throw new ConvexError("Choose at least one company.");
  const roles = new Map((await memberCompanies(ctx, userId)).map((c) => [c.companyId, c.role]));
  if (ids.some((id) => !roles.has(id)))
    throw new ConvexError("You don’t have access to this company.");
  const now = Date.now();
  const fields = {
    companyIds: ids,
    // Only admins can draft changes, so the switch means nothing without an admin company.
    allowDrafts: allowDrafts && ids.some((id) => roles.get(id) === "admin"),
    updatedAt: now,
  };
  const existing = await findGrant(ctx, userId, clientId);
  if (existing)
    await ctx.db.patch(existing._id, { ...fields, clientName: clientName ?? existing.clientName });
  else
    await ctx.db.insert("mcpGrants", { userId, clientId, clientName, createdAt: now, ...fields });
}

export const pending = query({
  args: { consentCode: v.string() },
  handler: async (ctx, { consentCode }) => {
    const u = await signedIn(ctx);
    const found = await pendingAuthorization(ctx, u._id, consentCode);
    if (!found) return null;
    const { p, app, expiresAt } = found;
    const grant = await findGrant(ctx, u._id, p.clientId);
    const redirect = redirectHost(p.redirectURI);
    return {
      clientId: p.clientId,
      clientName: app.name?.trim() || "Unnamed app",
      redirectHost: redirect.host,
      redirectLocal: redirect.local,
      scopes: p.scope ?? [],
      state: p.state ?? null,
      expiresAt,
      companies: await memberCompanies(ctx, u._id),
      existing: grant ? { companyIds: grant.companyIds, allowDrafts: grant.allowDrafts } : null,
    };
  },
});

/** Record which companies the app may see. The page then approves the OAuth request itself. */
export const approve = mutation({
  args: {
    consentCode: v.string(),
    companyIds: v.array(v.id("companies")),
    allowDrafts: v.boolean(),
  },
  handler: async (ctx, a) => {
    const u = await signedIn(ctx);
    const found = await pendingAuthorization(ctx, u._id, a.consentCode);
    if (!found) throw expired();
    const { p, app } = found;
    await saveGrant(
      ctx,
      u._id,
      p.clientId,
      app.name?.trim() || undefined,
      a.companyIds,
      a.allowDrafts,
    );
    return null;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const u = await signedIn(ctx);
    const names = new Map((await memberCompanies(ctx, u._id)).map((c) => [c.companyId, c.name]));
    const grants = await ctx.db
      .query("mcpGrants")
      .withIndex("by_user", (q) => q.eq("userId", u._id))
      .collect();
    const rows = await Promise.all(
      grants.map(async (g) => {
        const app = await oauthApp(ctx, g.clientId);
        return {
          clientId: g.clientId,
          clientName: g.clientName ?? app?.name ?? "Unnamed app",
          redirectHost: redirectHost(app?.redirectUrls?.split(",")[0]).host,
          companies: g.companyIds
            .filter((id) => names.has(id))
            .map((id) => ({ companyId: id, name: names.get(id)! })),
          allowDrafts: g.allowDrafts,
          createdAt: g.createdAt,
          lastUsedAt: g.lastUsedAt ?? null,
        };
      }),
    );
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** The user's companies, for choosing what a connection may see. */
export const companies = query({
  args: {},
  handler: async (ctx) => memberCompanies(ctx, (await signedIn(ctx))._id),
});

export const update = mutation({
  args: {
    clientId: v.string(),
    companyIds: v.array(v.id("companies")),
    allowDrafts: v.boolean(),
  },
  handler: async (ctx, a) => {
    const u = await signedIn(ctx);
    const grant = await findGrant(ctx, u._id, a.clientId);
    if (!grant) throw new ConvexError("This app is no longer connected.");
    await saveGrant(ctx, u._id, a.clientId, grant.clientName, a.companyIds, a.allowDrafts);
    return null;
  },
});

/** Disconnect an app: its tokens stop working at once and it has to ask again. */
/** Deletes a user's access and refresh tokens for one app. */
async function deleteTokens(ctx: MutationCtx, userId: string, clientId: string) {
  // oauthAccessToken has no (userId, clientId) index; the user's own rows are few.
  let cursor: string | null = null;
  for (;;) {
    const res: {
      page: { _id: string; clientId?: string | null }[];
      isDone: boolean;
      continueCursor: string;
    } = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "oauthAccessToken",
      where: [{ field: "userId", value: userId }],
      paginationOpts: { numItems: 200, cursor },
    });
    for (const t of res.page)
      if (t.clientId === clientId)
        await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
          input: { model: "oauthAccessToken", where: [{ field: "_id", value: t._id }] },
        });
    if (res.isDone) break;
    cursor = res.continueCursor;
  }
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Claims a refresh token for one exchange, in one transaction, so parallel requests can't each
 * redeem it. Presenting a token again more than 30 seconds after it was exchanged looks like a
 * stolen token being replayed, so it revokes the app's tokens for that user. Within 30 seconds it
 * is more likely the app refreshing twice at once, which is only refused.
 */
export const claimRefreshToken = internalMutation({
  args: { refreshToken: v.string() },
  handler: async (ctx, { refreshToken }) => {
    const hash = await sha256(refreshToken);
    const used = await ctx.db
      .query("mcpRefreshClaims")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (used) {
      if (Date.now() - used._creationTime > 30_000)
        await deleteTokens(ctx, used.userId, used.clientId);
      return false;
    }
    const token = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "oauthAccessToken",
      where: [{ field: "refreshToken", value: refreshToken }],
    })) as { userId: string; clientId: string; refreshTokenExpiresAt?: number | null } | null;
    if (!token) return false;
    await ctx.db.insert("mcpRefreshClaims", {
      hash,
      userId: token.userId,
      clientId: token.clientId,
      expiresAt: Number(token.refreshTokenExpiresAt) || Date.now() + 31 * 86400000,
    });
    return true;
  },
});

export const revoke = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => {
    const u = await signedIn(ctx);
    const grant = await findGrant(ctx, u._id, clientId);
    if (grant) await ctx.db.delete(grant._id);
    await deleteTokens(ctx, u._id, clientId);
    let cursor: string | null = null;
    for (;;) {
      const res: { isDone: boolean; continueCursor: string } = await ctx.runMutation(
        components.betterAuth.adapter.deleteMany,
        {
          input: {
            model: "oauthConsent",
            where: [
              { field: "clientId", value: clientId },
              { field: "userId", value: u._id },
            ],
          },
          paginationOpts: { numItems: 200, cursor },
        },
      );
      if (res.isDone) break;
      cursor = res.continueCursor;
    }
    return null;
  },
});

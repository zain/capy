import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { mcp } from "better-auth/plugins";

import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL!;

export const authComponent = createClient<DataModel>(components.betterAuth);

/**
 * Every MCP authorization gets offline_access, so clients always receive a refresh token.
 * openid is left to the client: with it the plugin also returns an id_token, which MCP does not use,
 * so the discovery metadata only advertises offline_access.
 */
const mcpScopes = ["offline_access"];

/** The pending authorization that a consent code or authorization code stands for. */
async function pendingAuthorization(ctx: { context: any }, code: unknown) {
  if (typeof code !== "string" || !code) return null;
  const row = await ctx.context.internalAdapter.findVerificationValue(code);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as { userId: string; clientId: string; requireConsent?: boolean };
  } catch {
    return null;
  }
}

const knownScopes = ["openid", "profile", "email", "offline_access"];

/**
 * Hardening for the mcp() plugin, which on its own:
 * - issues a code without asking the user unless the request says prompt=consent, so every
 *   authorization is sent to the consent page, where the user picks companies;
 * - only issues a refresh token when offline_access was requested, so it is always added;
 * - redirects a bad request (no PKCE, unknown scope) straight to the app's redirect URI before the
 *   user sees anything. Registration is open, so that would make Capy an open redirect. Bad
 *   requests stop on an error page instead, and unknown scopes are dropped;
 * - exchanges a consent code at /mcp/token before the user has approved it;
 * - lets any signed-in user approve another user's consent code;
 * - lets one refresh token be redeemed several times, in parallel or after rotation.
 */
function mcpHooks(convexCtx: GenericCtx<DataModel>) {
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path === "/mcp/authorize") {
      const q = ctx.query ?? {};
      const problem =
        q.response_type !== "code"
          ? "response_type must be code"
          : !q.code_challenge
            ? "PKCE is required: send code_challenge with code_challenge_method S256"
            : String(q.code_challenge_method ?? "").toLowerCase() !== "s256"
              ? "code_challenge_method must be S256"
              : null;
      if (problem)
        throw ctx.redirect(
          `${ctx.context.baseURL}/error?error=invalid_request&error_description=${encodeURIComponent(problem)}`,
        );
      const requested = String(q.scope ?? "")
        .split(" ")
        .filter((s) => knownScopes.includes(s));
      const scope = [...new Set([...requested, ...mcpScopes])].join(" ");
      return { context: { query: { ...q, prompt: "consent", scope } } };
    }
    if (ctx.path === "/mcp/token" && ctx.body?.grant_type === "authorization_code") {
      const pending = await pendingAuthorization(ctx, ctx.body.code);
      if (pending?.requireConsent)
        throw new APIError("BAD_REQUEST", {
          error: "invalid_grant",
          error_description: "authorization has not been approved",
        });
    }
    if (ctx.path === "/mcp/token" && ctx.body?.grant_type === "refresh_token") {
      const token = ctx.body.refresh_token;
      if (typeof token === "string" && token) {
        if (!("runMutation" in convexCtx)) throw new APIError("INTERNAL_SERVER_ERROR");
        const claimed = await convexCtx.runMutation(internal.connections.claimRefreshToken, {
          refreshToken: token,
        });
        if (!claimed)
          throw new APIError(
            "BAD_REQUEST",
            { error: "invalid_grant", error_description: "invalid refresh token" },
            { "Cache-Control": "no-store", Pragma: "no-cache" },
          );
      }
    }
    if (ctx.path === "/oauth2/consent") {
      const session = await getSessionFromCtx(ctx);
      const pending = await pendingAuthorization(ctx, ctx.body?.consent_code);
      if (!session || !pending || pending.userId !== session.user.id)
        throw new APIError("FORBIDDEN", {
          error: "access_denied",
          error_description: "not your request",
        });
    }
  });
}

/**
 * Token responses are never cached and use 400 for invalid_grant (RFC 6749 §5.1-5.2); error
 * redirects keep the client's state. An exchanged refresh token's row is deleted.
 */
const mcpAfterHooks = createAuthMiddleware(async (ctx) => {
  const returned = ctx.context.returned;
  if (ctx.path === "/mcp/authorize") {
    const state = ctx.query?.state;
    const location = isAPIError(returned) ? new Headers(returned.headers).get("location") : null;
    if (
      typeof state === "string" &&
      state &&
      location &&
      !location.startsWith(ctx.context.baseURL) &&
      /[?&]error=/.test(location) &&
      !/[?&]state=/.test(location)
    )
      throw ctx.redirect(`${location}&state=${encodeURIComponent(state)}`);
    return;
  }
  if (ctx.path !== "/mcp/token") return;
  const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };
  for (const [name, value] of Object.entries(noStore)) ctx.setHeader(name, value);
  if (isAPIError(returned)) {
    if (returned.statusCode === 401 && returned.body?.error === "invalid_grant")
      return new Response(JSON.stringify(returned.body), {
        status: 400,
        headers: { "Content-Type": "application/json", ...noStore },
      });
    return;
  }
  if (ctx.body?.grant_type === "refresh_token" && typeof ctx.body.refresh_token === "string")
    await ctx.context.adapter.delete({
      model: "oauthAccessToken",
      where: [{ field: "refreshToken", value: ctx.body.refresh_token }],
    });
});

function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth({
    baseURL: siteUrl,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    // The MCP server looks tokens up itself (convex/mcp.ts); this endpoint would also hand
    // out the refresh token to anyone holding an access token.
    disabledPaths: ["/mcp/get-session"],
    hooks: { before: mcpHooks(ctx), after: mcpAfterHooks },
    plugins: [
      convex({
        authConfig,
        jwksRotateOnTokenGenerationError: true,
      }),
      mcp({
        loginPage: `${siteUrl}/connect`,
        resource: `${siteUrl}/mcp`,
        oidcConfig: {
          loginPage: `${siteUrl}/connect`,
          consentPage: `${siteUrl}/connect/consent`,
          requirePKCE: true,
          accessTokenExpiresIn: 60 * 60,
          refreshTokenExpiresIn: 60 * 60 * 24 * 30,
        },
      }),
    ],
  });
}

export { createAuth };

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.safeGetAuthUser(ctx);
  },
});

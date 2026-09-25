// Capy's remote MCP server at /mcp: bearer-token gate, then one McpServer per request.
import { waitUntil } from "cloudflare:workers";
import {
  bearerAuthChallengeResponse,
  createMcpHandler,
  McpServer,
  OAuthError,
  OAuthErrorCode,
  verifyBearerToken,
  type AuthInfo,
} from "@modelcontextprotocol/server";
import { api } from "@capy/backend/convex/_generated/api";
import { version } from "../../../../../package.json";
import { acceptsResourceLinks, createCapy, type Capy, type Session } from "./context";
import { capyConvex, Unauthorized } from "./convex";
import { instructions } from "./instructions";
import { registerPrompts } from "./prompts";
import { registerResources } from "./resources";
import { registerCapTableTools } from "./tools/captable";
import { registerChangeTools } from "./tools/changes";
import { registerRecordTools } from "./tools/records";
import { registerPlanningTools } from "./tools/planning";

const list = { ttlMs: 60_000, cacheScope: "private" as const };

export function createCapyMcpServer(capy: Capy): McpServer {
  const server = new McpServer(
    {
      name: "capy",
      title: "Capy",
      version,
      description:
        "Open-source cap table management: ownership, grants, vesting, SAFEs and documents.",
      websiteUrl: capy.origin,
      icons: [
        { src: `${capy.origin}/icon-512.png`, mimeType: "image/png", sizes: ["512x512"] },
        { src: `${capy.origin}/favicon-32.png`, mimeType: "image/png", sizes: ["32x32"] },
      ],
    },
    {
      instructions,
      cacheHints: {
        "tools/list": list,
        "prompts/list": list,
        "resources/list": list,
        "resources/templates/list": list,
      },
    },
  );
  registerCapTableTools(server, capy);
  registerPlanningTools(server, capy);
  registerRecordTools(server, capy);
  registerChangeTools(server, capy);
  registerResources(server, capy);
  registerPrompts(server, capy);
  return server;
}

type Extra = { session: Session; origin: string };

const handler = createMcpHandler(
  ({ authInfo, era, requestInfo }) => {
    const extra = authInfo?.extra as Extra | undefined;
    if (!authInfo || !extra) throw new Error("MCP request reached the handler without a token.");
    return createCapyMcpServer(
      createCapy(
        authInfo.token,
        extra.session,
        extra.origin,
        acceptsResourceLinks(era, requestInfo),
        // A revoked token fails its next Convex call; drop the cached session so the next request gets a 401.
        () => sessions.delete(authInfo.token),
      ),
    );
  },
  { legacy: "stateless", onerror: (error) => console.error("[mcp]", error) },
);

// Sessions are checked again by every Convex call, so a short cache only saves round trips.
const sessionTtl = 30_000;
const sessions = new Map<string, { session: Session; at: number }>();

async function loadSession(token: string): Promise<Session> {
  const now = Date.now();
  const hit = sessions.get(token);
  if (hit && now - hit.at < sessionTtl && hit.session.expiresAt > now) return hit.session;
  const convex = capyConvex(token);
  try {
    const session = await convex.query(api.mcp.session, {});
    if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value!);
    sessions.set(token, { session, at: now });
    waitUntil(convex.mutation(api.mcp.touch, {}).catch(() => {}));
    return session;
  } catch (error) {
    sessions.delete(token);
    if (error instanceof Unauthorized)
      throw new OAuthError(OAuthErrorCode.InvalidToken, error.message.replace(/["\\]/g, ""));
    throw error;
  }
}

/** Serves /mcp: a missing, expired or revoked token gets the 401 challenge that starts OAuth. */
export async function handleMcp(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin;
  const resourceMetadataUrl = `${origin}/.well-known/oauth-protected-resource/mcp`;
  let authInfo: AuthInfo;
  try {
    authInfo = await verifyBearerToken(request.headers.get("authorization"), {
      resourceMetadataUrl,
      verifier: {
        async verifyAccessToken(token) {
          const session = await loadSession(token);
          return {
            token,
            clientId: session.clientId,
            scopes: [],
            expiresAt: Math.floor(session.expiresAt / 1000),
            resource: new URL("/mcp", origin),
            extra: { session, origin } satisfies Extra,
          };
        },
      },
    });
  } catch (error) {
    if (!(error instanceof OAuthError)) console.error("[mcp] token check failed", error);
    return bearerAuthChallengeResponse(error, {
      resourceMetadataUrl,
      requiredScopes: ["offline_access"],
    });
  }
  return handler.fetch(request, { authInfo });
}

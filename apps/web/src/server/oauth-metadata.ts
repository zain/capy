// OAuth discovery for MCP clients (RFC 8414 and RFC 9728), served at the site root.
// Better Auth serves the endpoints themselves under /api/auth (see convex/auth.ts).
// Only offline_access: Capy has no other scopes, and openid would add an id_token MCP doesn't use.
// Better Auth still accepts openid, profile and email from clients that ask for them.
const scopes = ["offline_access"];
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

/** Paths MCP clients call from any origin. They use bearer tokens, never cookies. */
export function isCorsPath(path: string) {
  return (
    path === "/mcp" ||
    path.startsWith("/mcp/") ||
    path.startsWith("/.well-known/") ||
    path === "/api/auth/mcp/token" ||
    path === "/api/auth/mcp/register"
  );
}

export function corsPreflight(request: Request): Response | undefined {
  if (request.method !== "OPTIONS" || !isCorsPath(new URL(request.url).pathname)) return;
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export function withCors(path: string, headers: Headers) {
  if (!isCorsPath(path)) return;
  for (const [name, value] of Object.entries(cors)) headers.set(name, value);
}

export function oauthMetadata(request: Request): Response | undefined {
  if (request.method !== "GET" && request.method !== "HEAD") return;
  const url = new URL(request.url);
  // The Worker and Better Auth share an origin, which must equal Convex's SITE_URL.
  const o = url.origin;
  let body: object | undefined;
  if (url.pathname === "/.well-known/oauth-authorization-server")
    body = {
      issuer: o,
      authorization_endpoint: `${o}/api/auth/mcp/authorize`,
      token_endpoint: `${o}/api/auth/mcp/token`,
      registration_endpoint: `${o}/api/auth/mcp/register`,
      scopes_supported: scopes,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
      code_challenge_methods_supported: ["S256"],
      service_documentation: `${o}/docs/mcp`,
    };
  else if (
    url.pathname === "/.well-known/oauth-protected-resource" ||
    url.pathname === "/.well-known/oauth-protected-resource/mcp"
  )
    body = {
      resource: `${o}/mcp`,
      authorization_servers: [o],
      scopes_supported: scopes,
      bearer_methods_supported: ["header"],
      resource_name: "Capy",
      resource_documentation: `${o}/docs/mcp`,
    };
  if (!body) return;
  return Response.json(body, {
    headers: { ...cors, "Cache-Control": "public, max-age=3600" },
  });
}

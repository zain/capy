import { describe, expect, it } from "vite-plus/test";
import { canonicalRedirect } from "./canonical";
import { corsPreflight, isCorsPath, oauthMetadata, withCors } from "./oauth-metadata";

const site = "https://capy.example.com";

describe("oauthMetadata", () => {
  it("describes the authorization server at the site root", async () => {
    const res = oauthMetadata(new Request(`${site}/.well-known/oauth-authorization-server`))!;
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      issuer: site,
      authorization_endpoint: `${site}/api/auth/mcp/authorize`,
      token_endpoint: `${site}/api/auth/mcp/token`,
      registration_endpoint: `${site}/api/auth/mcp/register`,
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
    });
    expect(body.scopes_supported).toEqual(["offline_access"]);
    // Better Auth advertises these but does not serve them.
    expect(body.userinfo_endpoint).toBeUndefined();
    expect(body.jwks_uri).toBeUndefined();
  });

  it("describes /mcp as the protected resource at both RFC 9728 locations", async () => {
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ]) {
      const body = await oauthMetadata(new Request(site + path))!.json();
      expect(body).toMatchObject({ resource: `${site}/mcp`, authorization_servers: [site] });
    }
  });

  it("ignores other paths and methods", () => {
    expect(oauthMetadata(new Request(`${site}/.well-known/security.txt`))).toBeUndefined();
    expect(oauthMetadata(new Request(`${site}/mcp`))).toBeUndefined();
    expect(
      oauthMetadata(
        new Request(`${site}/.well-known/oauth-authorization-server`, { method: "POST" }),
      ),
    ).toBeUndefined();
  });
});

describe("CORS for MCP clients", () => {
  it("covers the MCP endpoint, discovery and the token endpoints only", () => {
    for (const path of [
      "/mcp",
      "/mcp/files/abc",
      "/.well-known/oauth-protected-resource/mcp",
      "/api/auth/mcp/token",
      "/api/auth/mcp/register",
    ])
      expect(isCorsPath(path), path).toBe(true);
    for (const path of ["/", "/mcpx", "/dashboard", "/api/auth/get-session", "/connect/consent"])
      expect(isCorsPath(path), path).toBe(false);
  });

  it("answers preflights with the MCP headers", () => {
    const res = corsPreflight(new Request(`${site}/mcp`, { method: "OPTIONS" }))!;
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    const allowed = res.headers.get("Access-Control-Allow-Headers")!;
    for (const h of ["Authorization", "Mcp-Protocol-Version", "Mcp-Method", "Last-Event-ID"])
      expect(allowed).toContain(h);
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain("WWW-Authenticate");
    expect(corsPreflight(new Request(`${site}/mcp`))).toBeUndefined();
    expect(corsPreflight(new Request(`${site}/dashboard`, { method: "OPTIONS" }))).toBeUndefined();
  });

  it("adds CORS headers to MCP responses and nothing else", () => {
    const mcp = new Headers();
    withCors("/mcp", mcp);
    expect(mcp.get("Access-Control-Allow-Origin")).toBe("*");
    expect(mcp.get("Access-Control-Expose-Headers")).toContain("WWW-Authenticate");
    const page = new Headers();
    withCors("/dashboard", page);
    expect(page.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("canonicalRedirect", () => {
  it("leaves MCP and discovery URLs alone", () => {
    for (const path of ["/mcp", "/.well-known/oauth-protected-resource/mcp"])
      for (const method of ["GET", "POST", "OPTIONS"])
        expect(
          canonicalRedirect(new Request(`https://capyinc.com${path}`, { method })),
        ).toBeUndefined();
    expect(
      canonicalRedirect(new Request("https://capyinc.com/.well-known/oauth-authorization-server/")),
    ).toBeUndefined();
  });

  it("keeps the method and body when redirecting a POST", () => {
    const slash = canonicalRedirect(new Request("https://capyinc.com/mcp/", { method: "POST" }))!;
    expect(slash.status).toBe(308);
    expect(slash.headers.get("Location")).toBe("https://capyinc.com/mcp");
    const www = canonicalRedirect(new Request("https://www.capyinc.com/mcp", { method: "POST" }))!;
    expect(www.status).toBe(308);
    expect(www.headers.get("Location")).toBe("https://capyinc.com/mcp");
    expect(canonicalRedirect(new Request("https://www.capyinc.com/terms"))!.status).toBe(301);
  });
});

export function canonicalRedirect(request: Request): Response | undefined {
  const url = new URL(request.url);
  // 308 keeps the method and body, so an MCP client POSTing to www or /mcp/ still works.
  const status = request.method === "GET" || request.method === "HEAD" ? 301 : 308;
  if (
    (url.protocol === "http:" && url.hostname === "capyinc.com") ||
    url.hostname === "www.capyinc.com"
  ) {
    url.protocol = "https:";
    url.hostname = "capyinc.com";
    return Response.redirect(url.toString(), status);
  }
  if (url.pathname.startsWith("/.well-known/")) return;
  if (url.pathname === "/index.html") url.pathname = "/";
  else if (url.pathname.endsWith(".html")) url.pathname = url.pathname.slice(0, -5);
  else if (url.pathname.length > 1 && url.pathname.endsWith("/"))
    url.pathname = url.pathname.slice(0, -1);
  else if (url.pathname === "/favicon.ico") url.pathname = "/favicon-32.png";
  else return;
  return Response.redirect(url.toString(), status);
}

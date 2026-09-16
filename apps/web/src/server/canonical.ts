export function canonicalRedirect(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (
    (url.protocol === "http:" && url.hostname === "capyinc.com") ||
    url.hostname === "www.capyinc.com"
  ) {
    url.protocol = "https:";
    url.hostname = "capyinc.com";
    return Response.redirect(url.toString(), 301);
  }
  if (url.pathname === "/index.html") url.pathname = "/";
  else if (url.pathname.endsWith(".html")) url.pathname = url.pathname.slice(0, -5);
  else if (url.pathname.length > 1 && url.pathname.endsWith("/"))
    url.pathname = url.pathname.slice(0, -1);
  else if (url.pathname === "/favicon.ico") url.pathname = "/favicon-32.png";
  else return;
  return Response.redirect(url.toString(), 301);
}

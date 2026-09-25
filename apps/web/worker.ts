import start from "@tanstack/react-start/server-entry";
import { type CheckoutEnv } from "./src/server/checkout";
import { type PulleyAccessEnv } from "./src/server/pulley-access";

export interface Env extends CheckoutEnv, PulleyAccessEnv {
  ASSETS: Fetcher;
}

import { canonicalRedirect } from "./src/server/canonical";
import { corsPreflight, oauthMetadata, withCors } from "./src/server/oauth-metadata";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const redirect = canonicalRedirect(request);
    if (redirect) return redirect;
    const path = new URL(request.url).pathname;
    const discovery = corsPreflight(request) ?? oauthMetadata(request);
    let response: Response;
    if (discovery) response = discovery;
    else if (path === "/reserve")
      response = Response.redirect(new URL("/signup", request.url).href, 303);
    else if (request.method === "GET" || request.method === "HEAD") {
      response = await env.ASSETS.fetch(request);
      if (response.status === 404) response = await start.fetch(request);
    } else response = await start.fetch(request);
    const out = new Response(response.body, response);
    out.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    out.headers.set("X-Content-Type-Options", "nosniff");
    out.headers.set("X-Frame-Options", "DENY");
    out.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    out.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    withCors(path, out.headers);
    return out;
  },
};

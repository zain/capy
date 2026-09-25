// /mcp/files/<code>: streams a data room file for a 15-minute code from get_document.
import { ConvexHttpClient } from "convex/browser";
import { api } from "@capy/backend/convex/_generated/api";
import { ENV } from "../../env.public";

const text = (status: number, body: string) =>
  new Response(body + "\n", {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

/** Both filename forms, so browsers keep non-ASCII names and old clients get a safe fallback. */
export function contentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\%]/g, "_") || "document";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function serveDownload(request: Request, code: string): Promise<Response> {
  const expired = () => text(404, "This download link expired. Ask your AI app for a new one.");
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(code)) return expired();
  let file: { url: string; filename: string; contentType: string; size: number | null };
  try {
    file = await new ConvexHttpClient(ENV.VITE_CONVEX_URL).query(api.mcp.redeemDownload, {
      code,
      now: Date.now(),
    });
  } catch (error) {
    if ((error as Error).name === "ConvexError") return expired();
    console.error("[mcp] download lookup failed", error);
    return text(503, "Capy couldn’t look up that file. Try again in a moment.");
  }
  const headers = new Headers({
    "Content-Type": file.contentType,
    "Content-Disposition": contentDisposition(file.filename),
    "Cache-Control": "no-store, private",
    // Uploaded HTML or SVG must never run on Capy's origin.
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex",
  });
  if (request.method === "HEAD") {
    if (file.size !== null) headers.set("Content-Length", String(file.size));
    return new Response(null, { headers });
  }
  const upstream = await fetch(file.url);
  if (!upstream.ok || !upstream.body) return text(502, "Capy couldn’t read that file. Try again.");
  const length = upstream.headers.get("Content-Length");
  if (length) headers.set("Content-Length", length);
  return new Response(upstream.body, { headers });
}

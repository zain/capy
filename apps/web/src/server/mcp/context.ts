// Per-request state shared by tools, resources and prompts.
import type { FunctionReturnType } from "convex/server";
import { api } from "@capy/backend/convex/_generated/api";
import { capyConvex, type CapyConvex } from "./convex";

export type Session = FunctionReturnType<typeof api.mcp.session>;
export type Capy = {
  session: Session;
  origin: string;
  convex: CapyConvex;
  /** The company a call is about: the one given, or the only one this connection can see. */
  companyId(requested?: string): string;
  /** An absolute Capy URL for a relative link from Convex. */
  url(path: string): string;
  /** A copy of a Convex result with every relative `link` made absolute. */
  absolute<T>(value: T): T;
  /** Whether the client's protocol version (2025-06-18 or later) accepts resource_link content. */
  resourceLinks: boolean;
};

/**
 * resource_link content arrived in protocol 2025-06-18; older clients reject a result with it.
 * A 2025-era request without the version header is 2025-03-26 (per the 2025-06-18 spec).
 */
export function acceptsResourceLinks(era: "legacy" | "modern", request?: Request) {
  return era === "modern" || (request?.headers.get("mcp-protocol-version") ?? "") >= "2025-06-18";
}

const linkKeys = new Set(["link", "reviewPath"]);

export function absoluteLinks<T>(value: T, origin: string): T {
  if (Array.isArray(value)) return value.map((v) => absoluteLinks(v, origin)) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value))
    out[k] =
      linkKeys.has(k) && typeof v === "string" && v.startsWith("/")
        ? origin + v
        : absoluteLinks(v, origin);
  return out as T;
}

export function pickCompany(session: Session, requested?: string) {
  const list = session.companies;
  const wanted = requested?.trim();
  if (wanted) {
    const folded = wanted.toLowerCase();
    const hit =
      list.find((c) => c.companyId === wanted) ??
      list.find((c) => c.name.trim().toLowerCase() === folded);
    return hit?.companyId ?? wanted;
  }
  if (list.length === 1) return list[0]!.companyId;
  if (!list.length)
    throw new Error(
      "This connection can’t see any company with a cap table. Add one in Capy under Account → Connected apps.",
    );
  throw new Error(
    `Pass companyId. This connection can see: ${list.map((c) => `${c.name} (${c.companyId})`).join("; ")}.`,
  );
}

export function createCapy(
  token: string,
  session: Session,
  origin: string,
  resourceLinks = true,
  onUnauthorized?: () => void,
): Capy {
  return {
    session,
    origin,
    resourceLinks,
    convex: capyConvex(token, onUnauthorized),
    companyId: (requested) => pickCompany(session, requested),
    url: (path) => (path.startsWith("/") ? origin + path : path),
    absolute: (value) => absoluteLinks(value, origin),
  };
}

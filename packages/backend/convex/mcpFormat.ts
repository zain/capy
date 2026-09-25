// Pure helpers that shape MCP results: bounds, matching, links and compact security views.
import { ConvexError } from "convex/values";
import { D, isConvertible } from "@capy/equity";
import type { Security, Stakeholder } from "@capy/equity";
import { projectedVested } from "@capy/equity/modeling";

export type McpErrorCode = "unauthorized" | "forbidden" | "not_found" | "invalid";
export const fail = (code: McpErrorCode, message: string) => new ConvexError({ code, message });

export const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Clamps a caller's limit to [1, max], using `fallback` when absent or not a number. */
export function bound(limit: number | undefined, fallback: number, max: number) {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(limit)));
}
/** One page of `items` by offset, with the offset to ask for next (null on the last page). */
export function page<T>(
  items: T[],
  a: { limit?: number; offset?: number },
  fallback: number,
  max: number,
) {
  const limit = bound(a.limit, fallback, max),
    offset = Number.isFinite(a.offset) ? Math.max(0, Math.floor(a.offset!)) : 0;
  const slice = items.slice(offset, offset + limit);
  const next = offset + slice.length;
  return {
    items: slice,
    total: items.length,
    offset,
    nextOffset: next < items.length ? next : null,
  };
}
export const clip = (text: string, max: number) =>
  text.length > max ? text.slice(0, max - 1) + "…" : text;
/** Lowercase letters and digits only, for forgiving matches on relationships and statuses. */
export const fold = (text: string | null | undefined) =>
  (text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** True when every word of `q` appears in one of `values` (case-insensitive). */
export function matches(q: string | undefined, values: (string | null | undefined)[]) {
  const words = (q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = values.map((value) => (value ?? "").toLowerCase()).join("\n");
  return words.every((w) => haystack.includes(w));
}
/** A nonnegative decimal string from model input such as "12,000,000" or "$5000000". */
export function amount(text: string, label: string) {
  const cleaned = text.trim().replace(/[\s,$]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned))
    throw fail("invalid", `${label}: enter a number, like 5000000.`);
  return D(cleaned).toFixed();
}
/** Non-empty fields with each value clipped, so one long note can't flood a response. */
export function compactFields(
  fields: Record<string, string | null> | undefined,
  maxFields = 60,
  maxLength = 1000,
) {
  const out: Record<string, string> = {};
  let n = 0;
  for (const [k, value] of Object.entries(fields ?? {})) {
    if (value === null || value === "") continue;
    if (n++ >= maxFields) break;
    out[k] = clip(String(value), maxLength);
  }
  return out;
}
/** The certificate labels a document record lists ("CS-2, CS-5"). */
export const certificateList = (data: Record<string, unknown>) =>
  String(data.certificates ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
export function mailingAddress(f: Record<string, string | null>) {
  const line = [f["City"], f["State"], f["Zip Code"] || f["Postal Code"]].filter(Boolean).join(" ");
  return [f["Address"], line, f["Country"]].filter(Boolean).join(", ") || null;
}

/** Where each record kind lives in the Capy UI. */
const recordPages: Record<string, string> = {
  approval: "board_approvals",
  consent: "stockholder_consents",
  offer: "offer_letters_v2",
  communication: "communications_hub",
  draft: "drafts",
  template: "templates",
  contact: "external_contacts",
  document: "data_room",
  fundraising: "fundraising",
  valuation: "compliance",
  vesting: "vesting_schedules",
};
const enc = encodeURIComponent;
/** Relative Capy links for one company; the Worker makes them absolute. */
export function paths(companyId: string) {
  const base = `/companies/${companyId}`;
  return {
    base,
    page: (name: string) => `${base}/${name}`,
    stakeholder: (key: string) => `${base}/stakeholders/${enc(key)}`,
    security: (s: Pick<Security, "key" | "kind">) =>
      `${base}/${s.kind === "safe" || s.kind === "note" ? "convertibles" : "securities"}/${enc(s.key)}`,
    plan: (name: string) => `${base}/equity_plans/${enc(name)}`,
    shareClass: (name: string) => `${base}/security_classes/${enc(name)}`,
    record: (kind: string) => `${base}/${recordPages[kind] ?? "dashboard"}`,
    change: (changeId: string) => `${base}/changes/${changeId}`,
    documentUri: (documentId: string) => `capy://companies/${companyId}/documents/${documentId}`,
  };
}
export type Paths = ReturnType<typeof paths>;

/** Vested shares today (or on the snapshot date when today is earlier), and the date that figure is for. */
export function vestedNow(
  s: Security,
  asOf: string,
  today: string,
  holder?: Pick<Stakeholder, "fields"> | null,
) {
  if (isConvertible(s)) return { vested: null, vestedAsOf: null };
  const target = today > asOf ? today : asOf;
  const projected = projectedVested(s, asOf, target, holder);
  if (projected !== null) return { vested: projected, vestedAsOf: target };
  return { vested: s.vested, vestedAsOf: s.vested === null ? null : s.balanceAsOf || asOf };
}
/** One security as a row in a holdings list. */
export function holding(
  s: Security,
  asOf: string,
  today: string,
  to: Paths,
  holder?: Pick<Stakeholder, "fields"> | null,
) {
  return {
    securityKey: s.key,
    certificate: s.certificate,
    kind: s.kind,
    className: s.className,
    planName: s.planName,
    status: s.status,
    issued: s.issued,
    outstanding: s.outstanding,
    price: s.price,
    ...vestedNow(s, asOf, today, holder),
    issuedOn: s.issuedOn,
    vestingStart: s.vestingStart,
    vestingSchedule: s.vestingSchedule,
    link: to.security(s),
  };
}
/** SAFE and note terms. `valuationCap` is null when the cap is text such as "Uncapped". */
export function convertibleTerms(s: Security) {
  const f = s.fields;
  const capText = (f["Valuation Cap"] || "").trim();
  const numeric = capText.replace(/[,$\s]/g, "");
  return {
    principal: s.issued,
    outstanding: s.outstanding,
    interestOutstanding: f["Interest Outstanding"] || null,
    valuationCap: /^\d+(\.\d+)?$/.test(numeric) ? D(numeric).toFixed() : null,
    valuationCapText: capText || null,
    discountPercent: f["Conversion Discount"] || null,
    conversionType: f["Conversion Type"] || null,
    interestRate: f["Interest Rate"] || null,
    maturityDate: f["Maturity Date"] || null,
    mfn: f["MFN"] || null,
    proRata: f["Pro Rata"] || null,
  };
}
/** Dated vesting events, summarised: the first and last 12 and the next 12 after `today`. */
export function vestEventSummary(s: Security, today: string) {
  const events = [...(s.vestEvents ?? [])].sort((x, y) => x.date.localeCompare(y.date));
  if (!events.length) return null;
  return {
    count: events.length,
    totalShares: events.reduce((total, e) => total.plus(e.shares), D(0)).toFixed(),
    first: events.slice(0, 12),
    next: events.filter((e) => e.date > today).slice(0, 12),
    last: events.length > 12 ? events.slice(-12) : [],
  };
}

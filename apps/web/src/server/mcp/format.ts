// Short markdown summaries for tool results. Numbers stay decimal strings until display.
import { D, formatNumber } from "@capy/equity";

/** Whole shares with separators; fractional shares keep up to 4 places. */
export function shares(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const d = D(value);
  return formatNumber(value, d.isInteger() ? 0 : Math.min(4, d.decimalPlaces()));
}
/** Rounded to whole shares, for model results with fractional conversions. */
export const whole = (value: string) => formatNumber(value, 0);
export function money(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const d = D(value);
  return "$" + formatNumber(value, d.isInteger() ? 0 : 2);
}
/** Price per share keeps the precision it was given, up to 6 places. */
export function price(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const d = D(value);
  return "$" + formatNumber(value, Math.min(6, Math.max(2, d.decimalPlaces())));
}
export const percent = (value: string | null | undefined) =>
  value === null || value === undefined || value === "" ? "—" : `${D(value).toFixed(2)}%`;

const cell = (value: unknown) =>
  String(value ?? "—")
    .replace(/[\\|]/g, "\\$&")
    .replace(/\s+/g, " ");
export function table(headers: string[], rows: unknown[][]) {
  if (!rows.length) return "";
  return [
    `| ${headers.map(cell).join(" | ")} |`,
    `|${headers.map(() => " --- ").join("|")}|`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
  ].join("\n");
}
export const link = (label: string, url: string | null | undefined) =>
  url ? `[${label.replace(/[[\]]/g, "")}](${url})` : label;
/** "Showing 25 of 140. Pass offset 25 for more." when a list is paged. */
export function paging(shown: number, total: number, nextOffset?: number | null) {
  if (shown >= total) return "";
  return `Showing ${shown} of ${total}.${nextOffset ? ` Pass offset ${nextOffset} for more.` : ""}`;
}
export const lines = (...parts: (string | number | false | null | undefined)[]) =>
  parts.filter(Boolean).join("\n\n");

import { el, money, mount, openButton, percent, price, shares, startApp, table } from "./common";

type Totals = Record<string, string | number>;
type Draft = {
  changeId: string;
  title: string;
  status: string;
  expiresAt: string | null;
  asOf: string;
  link: string;
  preview: {
    summary: string;
    values?: Value[];
    totalsBefore: Totals;
    totalsAfter: Totals;
    ownership?: { name: string; before: string; after: string }[];
    warnings: string[];
  };
};

type Value = {
  label: string;
  before?: string;
  after: string;
  unit: "shares" | "usd" | "price" | "text";
};

function value(v: string | undefined, unit: Value["unit"]) {
  if (!v) return "—";
  if (unit === "text" || !/^-?\d+(\.\d+)?$/.test(v)) return v;
  return unit === "usd" ? money(v) : unit === "price" ? price(v) : shares(v);
}
const totalLabels: [string, string][] = [
  ["fullyDiluted", "Fully diluted shares"],
  ["outstandingStock", "Outstanding stock"],
  ["outstandingAwards", "Options & awards"],
  ["available", "Available in plans"],
];

const app = startApp("capy-change", (data) => {
  const d = data as unknown as Draft;
  const p = d.preview;
  const values = p.values ?? [];
  const hasBefore = values.some((x) => x.before !== undefined);
  const moved = totalLabels.filter(([k]) => String(p.totalsBefore[k]) !== String(p.totalsAfter[k]));
  const pending = d.status === "pending";
  const after = (text: string) => el("span", { class: "after" }, text);
  mount(
    document.getElementById("root")!,
    el("span", { class: "badge" }, pending ? "Draft · not applied yet" : `Status: ${d.status}`),
    el("h1", {}, d.title),
    el("p", { class: "summary" }, p.summary),
    values.length > 0 && el("h2", {}, hasBefore ? "Before and after" : "What gets saved"),
    values.length > 0 &&
      (hasBefore
        ? table(
            [[""], ["Before", true], ["After", true]],
            values.map((x) => [x.label, value(x.before, x.unit), after(value(x.after, x.unit))]),
          )
        : table(
            [[""], ["Value"]],
            values.map((x) => [x.label, value(x.after, x.unit)]),
          )),
    p.ownership?.length ? el("h2", {}, "Ownership (% of fully diluted)") : null,
    p.ownership?.length
      ? table(
          [["Holder"], ["Before", true], ["After", true]],
          p.ownership.map((o) => [o.name, percent(o.before), after(percent(o.after))]),
        )
      : null,
    moved.length > 0 && el("h2", {}, "Company totals"),
    moved.length > 0 &&
      table(
        [[""], ["Before", true], ["After", true]],
        moved.map(([k, label]) => [
          label,
          shares(p.totalsBefore[k]),
          after(shares(p.totalsAfter[k])),
        ]),
      ),
    p.warnings.length > 0 &&
      el(
        "div",
        { class: "notice", role: "note", style: "margin-top:16px" },
        el("strong", {}, "⚠ Check before applying"),
        el(
          "ul",
          {},
          p.warnings.map((w) => el("li", {}, w)),
        ),
      ),
    el(
      "div",
      { class: "actions" },
      openButton(app, pending ? "Open in Capy to review" : "Open in Capy", d.link, true),
      el(
        "span",
        { class: "muted" },
        pending
          ? `An admin reviews and applies it in Capy.${d.expiresAt ? ` Expires ${d.expiresAt.slice(0, 10)}.` : ""}`
          : `Snapshot ${d.asOf}.`,
      ),
    ),
  );
});

import {
  el,
  money,
  mount,
  openButton,
  percent,
  shares,
  startApp,
  stat,
  table,
  tooltip,
} from "./common";

type Row = { key: string; name: string; shares: string; percent: string };
type Summary = {
  company: string;
  asOf: string;
  groupBy: string;
  totals: Record<string, string>;
  convertibles: { outstanding: number; principalOutstanding: string };
  breakdown: { rows: Row[]; total: number };
  classes: {
    name: string;
    kind: string;
    authorized: string | null;
    outstanding: string;
    percent: string;
  }[];
  plans: {
    name: string;
    authorized: string;
    available: string;
    availablePercentOfPlan: string;
    outstandingAwards: string;
  }[];
  link: string;
};

// Color follows the group, never its rank; Unknown and folded rows are neutral gray.
const groupSlots = [
  "Founders",
  "Employees",
  "Former Employees",
  "Advisors",
  "Consultants",
  "Investors",
  "Others",
  "Available",
];
const groupLabel: Record<string, string> = {
  relationship: "relationship",
  class: "share class",
  plan: "equity plan",
  stakeholder: "holder",
};
const svgNs = "http://www.w3.org/2000/svg";

type Segment = { name: string; shares: string; percent: number; color: string };
function segments(s: Summary): Segment[] {
  const rows = s.breakdown.rows.filter((r) => Number(r.percent) > 0);
  let out: Segment[];
  if (s.groupBy === "relationship")
    out = rows.map((r) => {
      const slot = groupSlots.indexOf(r.name);
      return {
        name: r.name,
        shares: r.shares,
        percent: Number(r.percent),
        color: `var(--s${slot + 1})`,
      };
    });
  else {
    const kept = rows.slice(0, 7);
    out = kept.map((r, i) => ({
      name: r.name,
      shares: r.shares,
      percent: Number(r.percent),
      color: `var(--s${i + 1})`,
    }));
  }
  const used = out.reduce((t, x) => t + x.percent, 0);
  const usedShares = out.reduce((t, x) => t + Number(x.shares), 0);
  if (100 - used > 0.05)
    out.push({
      name: s.groupBy === "relationship" ? "Other" : "Rest of fully diluted",
      shares: String(Math.max(0, Number(s.totals.fullyDiluted) - usedShares)),
      percent: 100 - used,
      color: "var(--s0)",
    });
  return out;
}

function bar(parts: Segment[]) {
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("class", "bar");
  svg.setAttribute("viewBox", "0 0 1000 28");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    "Ownership: " + parts.map((p) => `${p.name} ${p.percent.toFixed(1)}%`).join(", "),
  );
  const gap = 3;
  let x = 0;
  for (const p of parts) {
    const w = (p.percent / 100) * 1000;
    const rect = document.createElementNS(svgNs, "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", "0");
    rect.setAttribute("width", String(Math.max(1, w - gap)));
    rect.setAttribute("height", "28");
    rect.setAttribute("rx", "4");
    rect.setAttribute("fill", p.color);
    rect.setAttribute("tabindex", "0");
    rect.setAttribute("aria-label", `${p.name}: ${shares(p.shares)} shares, ${percent(p.percent)}`);
    tooltip(rect, `${p.name} · ${shares(p.shares)} shares · ${percent(p.percent)}`);
    svg.appendChild(rect);
    x += w;
  }
  return svg;
}

const app = startApp("capy-ownership", (data) => {
  const s = data as unknown as Summary;
  const t = s.totals;
  const parts = segments(s);
  const swatch = (color: string) =>
    el("span", { class: "swatch", style: `background:${color}`, "aria-hidden": "true" });
  mount(
    document.getElementById("root")!,
    el(
      "div",
      { class: "head" },
      el(
        "div",
        {},
        el("h1", {}, s.company),
        el("p", { class: "muted" }, `Cap table snapshot ${s.asOf}`),
      ),
      openButton(app, "Open in Capy", s.link),
    ),
    el(
      "dl",
      { class: "stats" },
      stat("Fully diluted", shares(t.fullyDiluted)),
      stat("Outstanding stock", shares(t.outstandingStock)),
      stat("Options & awards", shares(t.outstandingAwards)),
      stat("Available in plans", shares(t.available)),
    ),
    el("h2", {}, `Ownership by ${groupLabel[s.groupBy] ?? s.groupBy}`),
    parts.length ? bar(parts) : el("p", { class: "empty" }, "No shares outstanding."),
    table(
      [["Name"], ["Shares", true], ["% FD", true]],
      parts.map((p) => [
        el("span", {}, swatch(p.color), p.name),
        shares(p.shares),
        percent(p.percent),
      ]),
    ),
    s.classes.length > 0 && el("h2", {}, "Share classes"),
    s.classes.length > 0 &&
      table(
        [["Class"], ["Authorized", true], ["Outstanding", true], ["% FD", true]],
        s.classes.map((c) => [
          c.kind && c.kind !== c.name ? `${c.name} (${c.kind})` : c.name,
          shares(c.authorized),
          shares(c.outstanding),
          percent(c.percent),
        ]),
      ),
    s.plans.length > 0 && el("h2", {}, "Equity plans"),
    s.plans.length > 0 &&
      table(
        [["Plan"], ["Authorized", true], ["Awards", true], ["Available", true]],
        s.plans.map((p) => [
          p.name,
          shares(p.authorized),
          shares(p.outstandingAwards),
          `${shares(p.available)} (${percent(p.availablePercentOfPlan)})`,
        ]),
      ),
    el(
      "p",
      { class: "muted foot" },
      "Percentages are of fully diluted shares. ",
      s.convertibles.outstanding > 0
        ? `${s.convertibles.outstanding} unconverted SAFEs and notes (${money(s.convertibles.principalOutstanding)}) are not included.`
        : "",
    ),
  );
});

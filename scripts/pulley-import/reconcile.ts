// Compares a Capy import against Pulley's own computed numbers and lists every mismatch.
//   bun scripts/pulley-import/reconcile.ts <snapshot-dir> <capy-import.json> [as-of YYYY-MM-DD]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  D,
  Decimal,
  isConvertible,
  totals,
  type EquityImport,
} from "../../packages/equity/src/index.ts";
import { projectedVested } from "../../packages/equity/src/modeling.ts";

const [dir, file, asOfArg] = process.argv.slice(2);
if (!dir || !file) throw new Error("Usage: reconcile.ts <snapshot-dir> <capy-import.json> [as-of]");
const load = (name: string) => {
  const json = JSON.parse(readFileSync(resolve(dir, name), "utf8"));
  return json.data ?? json;
};
const capy: EquityImport = JSON.parse(readFileSync(file, "utf8"));
const numbers = load("gql_CompanyNumbers.json").company_numbers;
const pSecurities: any[] = load("securities.json");
const pStakeholders: any[] = load("stakeholders.json");
const pClasses: any[] = load("share_classes.json");
const pPlans: any[] = load("equity_plans.json");
const pConvertibles: any[] = load("convertibles.json");
const asOf = asOfArg ?? new Date().toISOString().slice(0, 10);

const problems: string[] = [];
const same = (label: string, capyValue: unknown, pulleyValue: unknown) => {
  const a = capyValue === null || capyValue === undefined ? null : D(String(capyValue));
  const b = pulleyValue === null || pulleyValue === undefined ? null : D(String(pulleyValue));
  if (a === null && b === null) return;
  if (a === null || b === null || !a.minus(b).abs().lte("0.005"))
    problems.push(`${label}: Capy ${capyValue ?? "missing"}, Pulley ${pulleyValue ?? "missing"}`);
};

// Company
const t = totals(capy);
same("Company fully diluted", t.fullyDiluted, numbers.fully_diluted);
// Pulley's company "outstanding" figure includes outstanding awards.
same(
  "Company outstanding stock and awards",
  D(t.outstandingStock).plus(t.outstandingAwards),
  numbers.outstanding,
);
same(
  "Stakeholders with securities",
  t.stakeholdersWithSecurities,
  numbers.stakeholders.filter((s: any) => D(s.fully_diluted).gt(0)).length,
);

// Share classes
for (const pc of pClasses) {
  const n = numbers.share_classes.find((x: any) => x.id === pc.id);
  const c = capy.classes.find((x) => x.name === pc.name);
  if (!c) {
    problems.push(`Share class “${pc.name}” is missing in Capy`);
    continue;
  }
  const stock = capy.securities.filter((s) => s.kind === "share" && s.className === c.name);
  same(
    `${pc.name} outstanding`,
    stock.reduce((a, s) => a.plus(s.outstanding), D(0)),
    n?.outstanding,
  );
  same(`${pc.name} authorized`, c.authorized, pc.authorized_number_of_shares);
  if (pc.price_per_share) same(`${pc.name} price per share`, c.pricePerShare, pc.price_per_share);
}

// Equity plans
for (const pp of pPlans) {
  const n = numbers.equity_plans.find((x: any) => x.id === pp.id);
  const p = capy.plans.find((x) => x.name === pp.name);
  if (!p) {
    problems.push(`Equity plan “${pp.name}” is missing in Capy`);
    continue;
  }
  same(`${pp.name} available`, p.available, n?.available);
  same(`${pp.name} authorized`, p.authorized, n?.authorized);
}

// Stakeholders: every Pulley stakeholder must exist, with matching fully diluted shares and email.
const capyPeople = new Map(capy.stakeholders.map((s) => [s.name.trim().toLowerCase(), s]));
for (const ps of pStakeholders) {
  const n = numbers.stakeholders.find((x: any) => x.id === ps.id);
  const c = capyPeople.get(String(ps.name).trim().toLowerCase());
  if (!c) {
    problems.push(`Stakeholder “${ps.name}” is missing in Capy`);
    continue;
  }
  if (ps.email && c.email.toLowerCase() !== String(ps.email).toLowerCase())
    problems.push(`${ps.name} email: Capy “${c.email || "missing"}”, Pulley “${ps.email}”`);
  const mine = capy.securities.filter(
    (s) => s.stakeholderKey === c.key && !isConvertible(s) && s.kind !== "rsa",
  );
  same(
    `${ps.name} fully diluted`,
    mine.reduce((a, s) => a.plus(s.outstanding), D(0)),
    n?.fully_diluted ?? 0,
  );
}

// Securities: match by certificate label, then compare balances and vesting.
for (const ps of pSecurities) {
  const cert = `${ps.display_id_prefix}-${ps.display_id_override}`;
  const n = numbers.securities.find((x: any) => x.id === ps.id);
  const c = capy.securities.find((s) => s.certificate === cert && s.kind !== "rsa");
  if (!c) {
    problems.push(`Security ${cert} (${ps.stakeholder_company?.name}) is missing in Capy`);
    continue;
  }
  const label = `${cert} ${ps.stakeholder_company?.name}`;
  same(`${label} issued`, c.issued, n?.issued ?? ps.number_of_shares);
  same(`${label} outstanding`, c.outstanding, n?.outstanding);
  if (n && D(n.outstanding).gt(0)) {
    const vested = projectedVested(c, capy.asOf, asOf);
    if (vested === null)
      problems.push(
        `${label}: Capy cannot compute vesting as of ${asOf} (schedule “${c.vestingSchedule}”)`,
      );
    else same(`${label} vested as of ${asOf}`, vested, n.vested);
    // Pulley's vest events are the ground truth for the future vesting Capy projects.
    const events: any[] = load(`securities/${ps.id}.json`).vest_events ?? [];
    if (events.length)
      for (const months of [3, 12, 24, 48]) {
        const d = new Date(asOf + "T00:00:00Z");
        d.setUTCMonth(d.getUTCMonth() + months);
        const target = d.toISOString().slice(0, 10);
        const expected = Decimal.min(
          n.outstanding,
          events.filter((e) => e.date_vest <= target).reduce((a, e) => a.plus(e.num_vest), D(0)),
        );
        const projected = projectedVested(c, capy.asOf, target);
        if (projected === null)
          problems.push(
            `${label}: Capy cannot project vesting to ${target} (schedule “${c.vestingSchedule}”), Pulley has ${expected}`,
          );
        else same(`${label} vested on ${target}`, projected, expected);
      }
  }
}

// Security terms that the export and the API both carry.
for (const ps of pSecurities) {
  const cert = `${ps.display_id_prefix}-${ps.display_id_override}`;
  const c = capy.securities.find((s) => s.certificate === cert && s.kind !== "rsa");
  if (!c) continue;
  const label = `${cert} ${ps.stakeholder_company?.name}`;
  if (c.issuedOn !== String(ps.issue_date ?? "").slice(0, 10))
    problems.push(`${label} issue date: Capy ${c.issuedOn || "missing"}, Pulley ${ps.issue_date}`);
  const price = ps.exercise_price ?? ps.price_per_share;
  if (price !== null && price !== undefined) same(`${label} price`, c.price, price);
  const holder = capy.stakeholders.find((s) => s.key === c.stakeholderKey)?.name;
  if (holder?.toLowerCase() !== String(ps.stakeholder_company?.name).toLowerCase())
    problems.push(`${label} holder: Capy ${holder}, Pulley ${ps.stakeholder_company?.name}`);
}

// Convertibles: principal, balance, status and the terms round modeling uses.
for (const pc of pConvertibles) {
  const cert = `${pc.display_id_prefix}-${pc.display_id_override}`;
  const c = capy.securities.find((s) => isConvertible(s) && s.certificate === cert);
  const n = numbers.convertibles.find((x: any) => x.id === pc.id);
  if (!c) {
    problems.push(`Convertible ${cert} (${pc.stakeholder_company?.name}) is missing in Capy`);
    continue;
  }
  const label = `${cert} ${pc.stakeholder_company?.name}`;
  same(`${label} principal`, c.issued, pc.principal);
  same(`${label} outstanding`, c.outstanding, n?.principal_outstanding);
  if (pc.is_valuation_uncapped) {
    if (!/uncapped/i.test(c.fields["Valuation Cap"] ?? ""))
      problems.push(`${label} valuation cap: Capy ${c.fields["Valuation Cap"]}, Pulley uncapped`);
  } else same(`${label} valuation cap`, c.fields["Valuation Cap"] || null, pc.valuation_cap);
  same(
    `${label} discount`,
    D(c.fields["Conversion Discount"] || 0),
    D(pc.conversion_discount ?? 0),
  );
  const type = String(pc.conversion_type ?? "")
    .replace("_", "-")
    .toLowerCase();
  if (type && String(c.fields["Conversion Type"] ?? "").toLowerCase() !== type)
    problems.push(
      `${label} conversion type: Capy ${c.fields["Conversion Type"]}, Pulley ${pc.conversion_type}`,
    );
  const status = String(pc.status).toLowerCase();
  if (c.status.toLowerCase() !== status)
    problems.push(`${label} status: Capy ${c.status}, Pulley ${pc.status}`);
  if (c.issuedOn !== String(pc.issue_date ?? "").slice(0, 10))
    problems.push(`${label} issue date: Capy ${c.issuedOn || "missing"}, Pulley ${pc.issue_date}`);
}

// Capital contributed, by class and in total.
for (const pc of pClasses) {
  const n = numbers.share_classes.find((x: any) => x.id === pc.id);
  const c = capy.classes.find((x) => x.name === pc.name);
  if (!c || !n) continue;
  const fromRows = capy.securities
    .filter((s) => s.kind === "share" && s.className === c.name)
    .reduce((a, s) => a.plus(s.capital ?? 0), D(0));
  same(`${pc.name} capital contributed`, c.capital ?? fromRows, n.capital_contribution);
}

console.log(
  `Checked ${pSecurities.length} securities, ${pConvertibles.length} convertibles, ${pStakeholders.length} stakeholders as of ${asOf}.`,
);
console.log(
  problems.length ? `${problems.length} mismatches:\n- ${problems.join("\n- ")}` : "No mismatches.",
);
process.exitCode = problems.length ? 1 : 0;

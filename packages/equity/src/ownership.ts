import { D, isConvertible, percentage, sum, totals } from "./index";
import type { EquityImport } from "./index";

export const ownershipGroupNames = [
  "Founders",
  "Employees",
  "Former Employees",
  "Advisors",
  "Consultants",
  "Investors",
  "Others",
  "Available",
  "Unknown",
] as const;
export type OwnershipGroup = (typeof ownershipGroupNames)[number];
const relationships = new Map<string, OwnershipGroup>([
  ["founder", "Founders"],
  ["employee", "Employees"],
  ["exemployee", "Former Employees"],
  ["formeremployee", "Former Employees"],
  ["advisor", "Advisors"],
  ["boardmember", "Advisors"],
  ["consultant", "Consultants"],
  ["investor", "Investors"],
  ["other", "Others"],
]);
/** Pulley writes relationships as "Ex Employee", "EX_EMPLOYEE" or "Ex-Employee", so compare letters only. */
export function relationshipGroup(relationship: string): OwnershipGroup {
  return relationships.get(relationship.toLowerCase().replace(/[^a-z]/g, "")) ?? "Unknown";
}
/** Fully diluted shares per stakeholder key, matching `stakeholderShares`, built in one pass. */
export function stakeholderHoldings(data: Pick<EquityImport, "securities">) {
  const byKey = new Map<string, string[]>();
  for (const s of data.securities)
    if (!isConvertible(s) && s.kind !== "rsa") {
      const list = byKey.get(s.stakeholderKey);
      if (list) list.push(s.outstanding);
      else byKey.set(s.stakeholderKey, [s.outstanding]);
    }
  return new Map([...byKey].map(([key, list]) => [key, sum(list)]));
}
type OwnershipData = Pick<EquityImport, "stakeholders" | "securities" | "plans" | "classes">;
/** Fully diluted ownership by relationship group, in dashboard order, including unallocated plan shares. */
export function ownershipGroups(
  data: OwnershipData,
  holdings = stakeholderHoldings(data),
): { group: OwnershipGroup; shares: string; percent: string }[] {
  const t = totals(data);
  const shares = new Map<OwnershipGroup, string[]>();
  for (const p of data.stakeholders) {
    const group = relationshipGroup(p.relationship);
    if (!shares.has(group)) shares.set(group, []);
    shares.get(group)!.push(holdings.get(p.key) ?? "0");
  }
  return ownershipGroupNames.map((group) => {
    const total = group === "Available" ? t.available : sum(shares.get(group) ?? []);
    return { group, shares: total, percent: percentage(total, t.fullyDiluted) };
  });
}
/** Largest fully diluted holders, counting each plan's unallocated shares as an "Available <plan>" row. */
export function topHolders(data: OwnershipData, n: number, holdings = stakeholderHoldings(data)) {
  const t = totals(data);
  return [
    ...data.stakeholders.map((p) => ({
      kind: "stakeholder" as const,
      key: p.key,
      name: p.name,
      shares: holdings.get(p.key) ?? "0",
    })),
    ...data.plans.map((p) => ({
      kind: "plan" as const,
      key: p.name,
      name: `Available ${p.name}`,
      shares: p.available,
    })),
  ]
    .sort((a, b) => D(b.shares).cmp(a.shares))
    .slice(0, n)
    .map((r) => ({ ...r, percent: percentage(r.shares, t.fullyDiluted) }));
}

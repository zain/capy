import { describe, expect, it } from "vite-plus/test";
import {
  ownershipGroups,
  relationshipGroup,
  stakeholderHoldings,
  topHolders,
} from "@capy/equity/ownership";
import { stakeholderShares, sum, totals } from "@capy/equity";
import type { EquityImport, Security, Stakeholder } from "@capy/equity";

const person = (key: string, name: string, relationship: string): Stakeholder => ({
  key,
  name,
  relationship,
  email: "",
  entityType: "",
  externalId: "",
});
const security = (
  key: string,
  stakeholderKey: string,
  kind: Security["kind"],
  outstanding: string,
): Security => ({
  key,
  certificate: key.toUpperCase(),
  stakeholderKey,
  kind,
  className: "Common",
  planName: kind === "option" ? "Plan" : "",
  issued: outstanding,
  outstanding,
  price: "0.01",
  capital: null,
  vested: outstanding,
  issuedOn: "2024-01-01",
  vestingStart: "",
  vestingSchedule: "",
  status: "Outstanding",
  sourceSheet: "Test",
  sourceRow: 1,
  fields: {},
});
const data: EquityImport = {
  name: "Acme Robotics",
  asOf: "2026-06-30",
  stakeholders: [
    person("jane", "Jane Founder", "Founder"),
    person("sam", "Sam Engineer", "EMPLOYEE"),
    person("alex", "Alex Former", "Ex Employee"),
    person("pat", "Pat Former", "Former-Employee"),
    person("ria", "Ria Advisor", "Board Member"),
    person("cy", "Cy Consultant", "consultant"),
    person("vc", "Seed Fund LP", "Investor"),
    person("tr", "Acme Robotics Treasury", "Other"),
    person("mystery", "Mystery Holder", ""),
    person("odd", "Odd Relationship", "constructor"),
    person("contact", "Contact Only", "Investor"),
  ],
  securities: [
    security("cs-1", "jane", "share", "6000000"),
    security("cs-2", "jane", "share", "0.5"),
    security("opt-1", "sam", "option", "100000"),
    security("opt-2", "alex", "option", "25000"),
    security("opt-3", "pat", "rsu", "5000"),
    security("opt-4", "ria", "warrant", "20000"),
    security("opt-5", "cy", "piu", "1000"),
    security("ps-1", "vc", "share", "2000000"),
    security("safe-1", "vc", "safe", "500000"),
    security("rsa-1", "jane", "rsa", "6000000"),
    security("cs-3", "tr", "share", "300000"),
    security("cs-4", "mystery", "share", "7000"),
    security("cs-5", "odd", "share", "3000"),
    security("cs-6", "orphan", "share", "999"),
  ],
  plans: [
    { name: "Plan", authorized: "1500000", available: "1349000", className: "Common" },
    { name: "Plan B", authorized: "10", available: "10", className: "Common" },
  ],
  classes: [
    { name: "Common", kind: "Common", authorized: null, reportedOutstanding: null, capital: null },
  ],
  warnings: [],
  sheets: [],
};

describe("ownership", () => {
  it("groups relationships by letters only", () => {
    expect(relationshipGroup("Ex-Employee")).toBe("Former Employees");
    expect(relationshipGroup("EX_EMPLOYEE")).toBe("Former Employees");
    expect(relationshipGroup("Former Employee")).toBe("Former Employees");
    expect(relationshipGroup("board_member")).toBe("Advisors");
    expect(relationshipGroup("Advisor")).toBe("Advisors");
    expect(relationshipGroup("")).toBe("Unknown");
    expect(relationshipGroup("Friend")).toBe("Unknown");
    expect(relationshipGroup("constructor")).toBe("Unknown");
  });
  it("builds holdings that match stakeholderShares", () => {
    const holdings = stakeholderHoldings(data);
    for (const p of data.stakeholders)
      expect(holdings.get(p.key) ?? "0").toBe(stakeholderShares(data.securities, p.key));
    expect(holdings.get("jane")).toBe("6000000.5");
    expect(holdings.get("vc")).toBe("2000000");
    expect(holdings.get("orphan")).toBe("999");
  });
  it("matches the dashboard's original grouping", () => {
    // The dashboard's grouping before it moved to @capy/equity.
    const relationship = (p: Stakeholder) => p.relationship.toLowerCase().replace(/[^a-z]/g, "");
    const groups: [string, string[]][] = [
      ["Founders", ["founder"]],
      ["Employees", ["employee"]],
      ["Former Employees", ["exemployee", "formeremployee"]],
      ["Advisors", ["advisor", "boardmember"]],
      ["Consultants", ["consultant"]],
      ["Investors", ["investor"]],
      ["Others", ["other"]],
    ];
    const grouped = new Set(groups.flatMap(([, kinds]) => kinds));
    const sharesOf = (people: Stakeholder[]) =>
      sum(people.map((p) => stakeholderShares(data.securities, p.key)));
    const legacy = [
      ...groups.map(([label, kinds]) => ({
        label,
        shares: sharesOf(data.stakeholders.filter((p) => kinds.includes(relationship(p)))),
      })),
      { label: "Available", shares: totals(data).available },
      {
        label: "Unknown",
        shares: sharesOf(data.stakeholders.filter((p) => !grouped.has(relationship(p)))),
      },
    ];
    expect(ownershipGroups(data).map((g) => ({ label: g.group, shares: g.shares }))).toEqual(
      legacy,
    );
  });
  it("reports fully diluted shares and percentages per group", () => {
    const t = totals(data);
    expect(t.fullyDiluted).toBe("9811009.5");
    const groups = Object.fromEntries(ownershipGroups(data).map((g) => [g.group, g]));
    expect(groups.Founders).toEqual({ group: "Founders", shares: "6000000.5", percent: "61.1558" });
    expect(groups["Former Employees"]!.shares).toBe("30000");
    expect(groups.Advisors!.shares).toBe("20000");
    expect(groups.Investors!.shares).toBe("2000000");
    expect(groups.Others!.shares).toBe("300000");
    expect(groups.Available!.shares).toBe("1349010");
    expect(groups.Unknown!.shares).toBe("10000");
    // Holders missing from the stakeholder list are not attributed to any group.
    expect(sum(ownershipGroups(data).map((g) => g.shares))).toBe("9810010.5");
  });
  it("lists top holders with plan availability, largest first", () => {
    const top = topHolders(data, 4);
    expect(top.map((r) => [r.kind, r.key, r.name, r.shares])).toEqual([
      ["stakeholder", "jane", "Jane Founder", "6000000.5"],
      ["stakeholder", "vc", "Seed Fund LP", "2000000"],
      ["plan", "Plan", "Available Plan", "1349000"],
      ["stakeholder", "tr", "Acme Robotics Treasury", "300000"],
    ]);
    expect(top[1]!.percent).toBe("20.3853");
  });
  it("handles an empty cap table", () => {
    const empty = { stakeholders: [], securities: [], plans: [], classes: [] };
    expect(ownershipGroups(empty).every((g) => g.shares === "0" && g.percent === "0")).toBe(true);
    expect(topHolders(empty, 5)).toEqual([]);
  });
});

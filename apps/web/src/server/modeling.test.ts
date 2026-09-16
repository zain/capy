import { describe, expect, it } from "vite-plus/test";
import { modelRound, projectedVested } from "@capy/equity/modeling";
import type { EquityImport, Security } from "@capy/equity";
const stock: Security = {
  key: "stock",
  certificate: "CS-1",
  stakeholderKey: "founder",
  kind: "share",
  className: "Common",
  planName: "",
  issued: "9000000",
  outstanding: "9000000",
  price: "0.01",
  capital: "90000",
  vested: "9000000",
  issuedOn: "2020-01-01",
  vestingStart: "2020-01-01",
  vestingSchedule: "1/48 monthly, 25% vest at 12 month cliff",
  status: "Outstanding",
  sourceSheet: "Test",
  sourceRow: 1,
  fields: {},
};
function data(safes: Security[] = []): EquityImport {
  return {
    name: "Example",
    asOf: "2026-09-15",
    stakeholders: [
      {
        key: "founder",
        name: "Founder",
        email: "",
        relationship: "Founder",
        entityType: "",
        externalId: "",
      },
      {
        key: "investor",
        name: "Investor",
        email: "",
        relationship: "Investor",
        entityType: "",
        externalId: "",
      },
    ],
    securities: [stock, ...safes],
    classes: [
      {
        name: "Common",
        kind: "Common",
        authorized: "20000000",
        capital: "90000",
        reportedOutstanding: "9000000",
      },
    ],
    plans: [{ name: "Pool", authorized: "1000000", available: "1000000", className: "Common" }],
    warnings: [],
    sheets: [],
  };
}
function safe(type = "Post-Money"): Security {
  return {
    ...stock,
    key: "safe",
    certificate: "SAFE-1",
    stakeholderKey: "investor",
    kind: "safe",
    issued: "1000000",
    outstanding: "1000000",
    fields: { "Valuation Cap": "10000000", "Conversion Type": type, "Conversion Discount": "0" },
  };
}
describe("round model", () => {
  it("gives a $1m SAFE at a $10m post-money cap 10% before new money", () => {
    const m = modelRound(data([safe()]), "20000000", "5000000");
    const investor = m.rows.find((r) => r.key === "investor")!;
    expect(investor.safePercent).toBe("10.00");
    expect(investor.roundPercent).toBe("8.00");
    expect(m.rows.find((r) => r.key === "new-investors")?.roundPercent).toBe("20.00");
  });
  it("excludes other convertibles from a pre-money cap denominator", () => {
    const m = modelRound(data([safe("Pre-Money")]), "20000000", "5000000");
    expect(Number(m.rows.find((r) => r.key === "investor")!.converted)).toBeCloseTo(1000000, 3);
  });
  it("uses the discount when it gives a lower conversion price", () => {
    const s = safe();
    s.fields["Valuation Cap"] = "50000000";
    s.fields["Conversion Discount"] = "20";
    const m = modelRound(data([s]), "20000000", "0");
    expect(m.rows.find((r) => r.key === "investor")!.safePercent).toBe("6.25");
  });
  it("preserves 100% ownership after a priced round", () => {
    const m = modelRound(data([safe()]), "20000000", "5000000");
    expect(m.rows.reduce((sum, r) => sum + Number(r.roundPercent), 0)).toBeCloseTo(100, 2);
  });
  it("rejects impossible terms instead of producing negative dilution", () => {
    const s = safe();
    s.fields["Valuation Cap"] = "500000";
    expect(() => modelRound(data([s]), "20000000", "1000000")).toThrow("100%");
  });
});
describe("vesting projections", () => {
  const grant = {
    ...stock,
    issued: "4800",
    outstanding: "4800",
    vested: "0",
    vestingStart: "2025-01-31",
  };
  it("vests the cliff at its anniversary", () => {
    expect(projectedVested(grant, "2025-02-01", "2026-01-30")).toBe("0");
    expect(projectedVested(grant, "2025-02-01", "2026-01-31")).toBe("1200");
  });
  it("handles month end anniversaries", () => {
    expect(
      projectedVested(
        { ...grant, vestingSchedule: "1/48 monthly, no cliff" },
        "2025-01-31",
        "2025-02-28",
      ),
    ).toBe("100");
  });
  it("uses the latest recorded balance date after an exercise", () => {
    const updated = {
      ...grant,
      vested: "50",
      outstanding: "4750",
      balanceAsOf: "2025-02-28",
      vestingSchedule: "1/48 monthly, no cliff",
    };
    expect(projectedVested(updated, "2025-01-31", "2025-03-31")).toBe("150");
    expect(projectedVested(updated, "2025-01-31", "2025-02-01")).toBeNull();
  });
  it("preserves the export baseline and stops at termination", () => {
    expect(
      projectedVested(
        { ...grant, vested: "1400", fields: { "Termination Date": "2026-03-31" } },
        "2026-03-31",
        "2027-01-01",
      ),
    ).toBe("1400");
  });
  it("does not fabricate custom or historical vesting", () => {
    expect(
      projectedVested(
        { ...grant, vestingSchedule: "Custom - See Share for details" },
        "2025-01-31",
        "2026-01-01",
      ),
    ).toBeNull();
    expect(projectedVested(grant, "2026-01-01", "2025-01-01")).toBeNull();
  });
});

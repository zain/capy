import { describe, expect, it } from "vite-plus/test";
import { ConvexError } from "convex/values";
import type { Security } from "@capy/equity";
import {
  amount,
  bound,
  certificateList,
  clip,
  compactFields,
  convertibleTerms,
  fold,
  holding,
  mailingAddress,
  matches,
  page,
  paths,
  vestEventSummary,
  vestedNow,
} from "@capy/backend/convex/mcpFormat";

const option: Security = {
  key: "s-1",
  certificate: "ES-1",
  stakeholderKey: "p-1",
  kind: "option",
  className: "Common",
  planName: "2024 Plan",
  issued: "4800",
  outstanding: "4800",
  price: "0.10",
  capital: null,
  vested: "1200",
  issuedOn: "2025-01-01",
  vestingStart: "2025-01-01",
  vestingSchedule: "1/48 monthly, 25% vest at 12 month cliff",
  status: "Outstanding",
  sourceSheet: "Test",
  sourceRow: 0,
  fields: {},
};
const safe: Security = {
  ...option,
  key: "safe/1",
  certificate: "SAFE-1",
  kind: "safe",
  className: "",
  planName: "",
  issued: "250000",
  outstanding: "250000",
  price: null,
  vested: null,
  vestingStart: "",
  vestingSchedule: "",
  fields: { "Valuation Cap": "8,000,000", "Conversion Type": "Post-Money" },
};

describe("bounds and paging", () => {
  it("clamps limits and falls back when absent", () => {
    expect(bound(undefined, 25, 100)).toBe(25);
    expect(bound(Number.NaN, 25, 100)).toBe(25);
    expect(bound(0, 25, 100)).toBe(1);
    expect(bound(-5, 25, 100)).toBe(1);
    expect(bound(2.9, 25, 100)).toBe(2);
    expect(bound(10_000, 25, 100)).toBe(100);
  });
  it("pages by offset and reports the next offset", () => {
    const items = Array.from({ length: 7 }, (_, i) => i);
    expect(page(items, { limit: 3 }, 25, 100)).toEqual({
      items: [0, 1, 2],
      total: 7,
      offset: 0,
      nextOffset: 3,
    });
    expect(page(items, { limit: 3, offset: 6 }, 25, 100)).toMatchObject({
      items: [6],
      nextOffset: null,
    });
    expect(page(items, { offset: -4 }, 25, 100)).toMatchObject({ offset: 0, nextOffset: null });
    expect(page(items, { offset: 50 }, 25, 100)).toMatchObject({ items: [], nextOffset: null });
  });
});

describe("matching", () => {
  it("needs every word, in any field, ignoring case", () => {
    expect(matches(undefined, ["Jane Founder"])).toBe(true);
    expect(matches("  ", ["Jane Founder"])).toBe(true);
    expect(matches("jane", ["Jane Founder", "jane@example.com"])).toBe(true);
    expect(matches("founder example", ["Jane Founder", "jane@example.com"])).toBe(true);
    expect(matches("jane smith", ["Jane Founder", null])).toBe(false);
  });
  it("folds relationships and statuses to letters and digits", () => {
    expect(fold("Ex-Employee")).toBe("exemployee");
    expect(fold(" Outstanding ")).toBe("outstanding");
    expect(fold(undefined)).toBe("");
  });
});

describe("amounts", () => {
  it("accepts commas, spaces and dollar signs", () => {
    expect(amount("12,000,000", "preMoney")).toBe("12000000");
    expect(amount(" $5000000.50 ", "investment")).toBe("5000000.5");
    expect(amount("0", "investment")).toBe("0");
  });
  it("rejects anything else as invalid", () => {
    for (const bad of ["abc", "-1", "1e6", "", "1.2.3"]) {
      let error: unknown;
      try {
        amount(bad, "preMoney");
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ConvexError);
      expect((error as ConvexError<{ code: string }>).data.code).toBe("invalid");
    }
  });
});

describe("compact values", () => {
  it("drops empty fields, clips long values and caps the count", () => {
    const fields: Record<string, string | null> = { A: "x", B: null, C: "", D: "y".repeat(50) };
    for (let i = 0; i < 10; i++) fields[`F${i}`] = String(i);
    const out = compactFields(fields, 5, 10);
    expect(Object.keys(out)).toEqual(["A", "D", "F0", "F1", "F2"]);
    expect(out.D).toBe("y".repeat(9) + "…");
    expect(clip("short", 10)).toBe("short");
  });
  it("splits certificate lists", () => {
    expect(certificateList({ certificates: "CS-2, CS-5,, " })).toEqual(["CS-2", "CS-5"]);
    expect(certificateList({})).toEqual([]);
  });
  it("builds an address from either zip field", () => {
    expect(
      mailingAddress({
        Address: "1 Main St",
        City: "Springfield",
        State: "CA",
        "Postal Code": "90000",
      }),
    ).toBe("1 Main St, Springfield CA 90000");
    expect(mailingAddress({})).toBeNull();
  });
});

describe("links", () => {
  const to = paths("c1");
  it("points convertibles and other securities at their pages, encoded", () => {
    expect(to.security(safe)).toBe("/companies/c1/convertibles/safe%2F1");
    expect(to.security(option)).toBe("/companies/c1/securities/s-1");
    expect(to.plan("2024 Plan")).toBe("/companies/c1/equity_plans/2024%20Plan");
    expect(to.record("approval")).toBe("/companies/c1/board_approvals");
    expect(to.record("unknown")).toBe("/companies/c1/dashboard");
    expect(to.documentUri("d1")).toBe("capy://companies/c1/documents/d1");
  });
});

describe("securities", () => {
  it("reads numeric caps and keeps text caps as text", () => {
    expect(convertibleTerms(safe)).toMatchObject({
      principal: "250000",
      valuationCap: "8000000",
      valuationCapText: "8,000,000",
      conversionType: "Post-Money",
      discountPercent: null,
    });
    const uncapped = { ...safe, fields: { "Valuation Cap": "Uncapped" } };
    expect(convertibleTerms(uncapped)).toMatchObject({
      valuationCap: null,
      valuationCapText: "Uncapped",
    });
  });
  it("projects vesting to today, or keeps the recorded balance and its date", () => {
    // 12 months at the snapshot; one more month by 2026-02-01.
    expect(vestedNow(option, "2026-01-01", "2026-02-01")).toEqual({
      vested: "1300",
      vestedAsOf: "2026-02-01",
    });
    // A "today" before the snapshot reports the snapshot.
    expect(vestedNow(option, "2026-01-01", "2025-06-01")).toEqual({
      vested: "1200",
      vestedAsOf: "2026-01-01",
    });
    const custom = { ...option, vestingSchedule: "Custom", balanceAsOf: "2025-12-15" };
    expect(vestedNow(custom, "2026-01-01", "2026-02-01")).toEqual({
      vested: "1200",
      vestedAsOf: "2025-12-15",
    });
    expect(vestedNow(safe, "2026-01-01", "2026-02-01")).toEqual({ vested: null, vestedAsOf: null });
    expect(holding(option, "2026-01-01", "2026-02-01", paths("c1"))).toMatchObject({
      securityKey: "s-1",
      vested: "1300",
      link: "/companies/c1/securities/s-1",
    });
  });
  it("summarises dated vesting events", () => {
    const events = Array.from({ length: 30 }, (_, i) => ({
      date: `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`,
      shares: "100",
    })).reverse();
    const summary = vestEventSummary({ ...option, vestEvents: events }, "2026-06-15")!;
    expect(summary.count).toBe(30);
    expect(summary.totalShares).toBe("3000");
    expect(summary.first[0]!.date).toBe("2025-01-01");
    expect(summary.next[0]!.date).toBe("2026-07-01");
    expect(summary.next).toHaveLength(12);
    expect(summary.last.at(-1)!.date).toBe("2027-06-01");
    expect(vestEventSummary(option, "2026-06-15")).toBeNull();
  });
});

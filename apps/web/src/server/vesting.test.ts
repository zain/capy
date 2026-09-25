import { describe, expect, it } from "vite-plus/test";
import {
  addMonths,
  addPeriod,
  parsePeriod,
  postTerminationDeadline,
  vestingForecast,
} from "@capy/equity/vesting";
import { projectedVested, vestingSteps } from "@capy/equity/modeling";
import type { EquityImport, Security, Stakeholder } from "@capy/equity";

const option = (key: string, overrides: Partial<Security> = {}): Security => ({
  key,
  certificate: key.toUpperCase(),
  stakeholderKey: "sam",
  kind: "option",
  className: "Common",
  planName: "2024 Plan",
  issued: "48000",
  outstanding: "48000",
  price: "0.10",
  capital: null,
  vested: "0",
  balanceAsOf: "2026-06-30",
  issuedOn: "2025-01-31",
  vestingStart: "2025-01-31",
  vestingSchedule: "1/48 monthly, 25% vest at 12 month cliff",
  status: "Outstanding",
  sourceSheet: "Test",
  sourceRow: 1,
  fields: {},
  ...overrides,
});
const person = (key: string, name: string, fields?: Record<string, string>): Stakeholder => ({
  key,
  name,
  relationship: "Employee",
  email: "",
  entityType: "",
  externalId: "",
  ...(fields ? { fields } : {}),
});

describe("post-termination deadline", () => {
  it("parses exercise periods", () => {
    expect(parsePeriod("3 Months")).toEqual({ amount: 3, unit: "month" });
    expect(parsePeriod("30 Days")).toEqual({ amount: 30, unit: "day" });
    expect(parsePeriod("10 Years")).toEqual({ amount: 10, unit: "year" });
    expect(parsePeriod("0 Day")).toEqual({ amount: 0, unit: "day" });
    expect(parsePeriod(" 1 month ")).toEqual({ amount: 1, unit: "month" });
    expect(parsePeriod("Six weeks")).toBeNull();
    expect(parsePeriod(null)).toBeNull();
  });
  it("adds calendar periods, clamping to month end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addPeriod("2024-02-29", { amount: 1, unit: "year" })).toBe("2025-02-28");
    expect(addPeriod("2026-12-15", { amount: 30, unit: "day" })).toBe("2027-01-14");
  });
  it("uses the voluntary window when the termination type is not recorded", () => {
    const s = option("opt-1", {
      fields: {
        "Termination Date": "2026-01-31",
        "Voluntary Termination": "3 Months",
        "Involuntary Termination": "1 Year",
      },
    });
    const result = postTerminationDeadline(s, person("sam", "Sam Engineer"));
    expect(result.deadline).toBe("2026-04-30");
    expect(result.basis).toMatch(
      /3 Months after termination \(type not recorded; assumed voluntary\) on 2026-01-31/,
    );
  });
  it("chooses the window by the holder's termination type", () => {
    const fields = {
      "Voluntary Termination": "30 Days",
      "Involuntary Termination": "3 Months",
      "Termination With Cause": "0 Day",
      Death: "12 Months",
    };
    const s = option("opt-1", { fields });
    const at = (type: string) =>
      postTerminationDeadline(
        s,
        person("sam", "Sam", { "Termination Date": "2026-01-15", "Termination Type": type }),
      ).deadline;
    expect(at("Voluntary")).toBe("2026-02-14");
    expect(at("Involuntary")).toBe("2026-04-15");
    expect(at("With Cause")).toBe("2026-01-15");
    expect(at("Death")).toBe("2027-01-15");
  });
  it("prefers the option's own termination date over the holder's", () => {
    const s = option("opt-1", {
      fields: { "Termination Date": "2026-03-01", "Voluntary Termination": "30 Days" },
    });
    const holder = person("sam", "Sam", { "Termination Date": "2025-01-01" });
    expect(postTerminationDeadline(s, holder).deadline).toBe("2026-03-31");
  });
  it("caps the window at the option's expiration date", () => {
    const s = option("opt-1", {
      fields: {
        "Termination Date": "2026-01-15",
        "Voluntary Termination": "10 Years",
        "Expiration Date": "2030-01-01",
      },
    });
    const result = postTerminationDeadline(s, null);
    expect(result).toEqual({
      deadline: "2030-01-01",
      basis: expect.stringMatching(/^Option expiration date, before the 10 Years window/),
    });
  });
  it("falls back to expiration, or nothing, when the period is not recognized", () => {
    const fields = { "Termination Date": "2026-01-15", "Voluntary Termination": "Six weeks" };
    expect(postTerminationDeadline(option("a", { fields }), null)).toEqual({
      deadline: null,
      basis: expect.stringContaining("“Six weeks”"),
    });
    const expiring = option("b", { fields: { ...fields, "Expiration Date": "2027-01-01" } });
    expect(postTerminationDeadline(expiring, null).deadline).toBe("2027-01-01");
  });
  it("returns no deadline for current holders or unreadable dates", () => {
    expect(postTerminationDeadline(option("a"), person("sam", "Sam"))).toEqual({
      deadline: null,
      basis: "Not terminated",
    });
    const odd = option("b", {
      fields: { "Termination Date": "1/15/2026", "Voluntary Termination": "30 Days" },
    });
    expect(postTerminationDeadline(odd, null).deadline).toBeNull();
  });
});

describe("vesting forecast", () => {
  const data: Pick<EquityImport, "asOf" | "stakeholders" | "securities"> = {
    asOf: "2026-06-30",
    stakeholders: [
      person("sam", "Sam Engineer"),
      person("lee", "Lee Designer"),
      person("kim", "Kim Former"),
      person("jane", "Jane Founder"),
    ],
    securities: [
      // 17 of 48 months complete at the snapshot; 1,000 shares vest each month.
      option("opt-1", { vested: "17000" }),
      // Starts in 2026 with a one-year cliff.
      option("opt-2", {
        stakeholderKey: "lee",
        issued: "4800",
        outstanding: "4800",
        vestingStart: "2026-01-15",
        vestingSchedule: "1/48 monthly, 1 year cliff",
      }),
      // Dated events from the source system.
      option("opt-3", {
        stakeholderKey: "lee",
        planName: "2020 Plan",
        issued: "1000",
        outstanding: "1000",
        vested: null,
        vestingSchedule: "Custom",
        vestEvents: [
          { date: "2026-05-01", shares: "100" },
          { date: "2026-08-01", shares: "300" },
          { date: "2026-08-01", shares: "200" },
          { date: "2026-11-01", shares: "400" },
        ],
      }),
      // Vesting stops at termination.
      option("opt-4", {
        stakeholderKey: "kim",
        issued: "4800",
        outstanding: "4800",
        vested: "2900",
        vestingStart: "2024-01-01",
        fields: { "Termination Date": "2026-08-15" },
      }),
      option("opt-5", {
        stakeholderKey: "kim",
        issued: "100",
        outstanding: "100",
        vested: "10",
        vestingSchedule: "Custom - See Share Agreement",
      }),
      // Fully vested stock with a schedule stays vested; stock without one is not forecast.
      option("cs-1", {
        stakeholderKey: "jane",
        kind: "share",
        planName: "",
        issued: "5000",
        outstanding: "5000",
        vested: "5000",
      }),
      option("cs-2", { stakeholderKey: "jane", kind: "share", planName: "", vestingSchedule: "" }),
      option("safe-1", { stakeholderKey: "jane", kind: "safe" }),
      option("rsa-1", { stakeholderKey: "jane", kind: "rsa" }),
      option("opt-6", { outstanding: "0", vested: "0", status: "Cancelled" }),
    ],
  };
  it("projects month-end points from the snapshot", () => {
    const f = vestingForecast(data, { to: "2026-12-31" });
    expect(f.asOf).toBe("2026-06-30");
    expect(f.points.map((p) => p.date)).toEqual([
      "2026-06-30",
      "2026-07-31",
      "2026-08-31",
      "2026-09-30",
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
    ]);
    // opt-1 17000 + opt-3 100 + opt-4 2900 + cs-1 5000; opt-2 has not reached its cliff.
    expect(f.points[0]).toEqual({ date: "2026-06-30", vested: "25000", unvested: "38600" });
    // +1000 opt-1, +100 opt-4
    expect(f.points[1]!.vested).toBe("26100");
    // +1000 opt-1, +500 opt-3, +100 opt-4 (Aug 1); termination on Aug 15 stops opt-4.
    expect(f.points[2]!.vested).toBe("27700");
    expect(f.points.at(-1)).toEqual({ date: "2026-12-31", vested: "32100", unvested: "31500" });
    expect(f.unprojectable).toEqual([
      { securityKey: "opt-5", certificate: "OPT-5", schedule: "Custom - See Share Agreement" },
    ]);
  });
  it("lists upcoming vesting events and cliffs in date order", () => {
    const f = vestingForecast(data, { to: "2027-02-28" });
    expect(f.upcoming.slice(0, 4)).toEqual([
      {
        date: "2026-07-01",
        stakeholderKey: "kim",
        name: "Kim Former",
        securityKey: "opt-4",
        certificate: "OPT-4",
        shares: "100",
      },
      {
        date: "2026-07-31",
        stakeholderKey: "sam",
        name: "Sam Engineer",
        securityKey: "opt-1",
        certificate: "OPT-1",
        shares: "1000",
      },
      {
        date: "2026-08-01",
        stakeholderKey: "lee",
        name: "Lee Designer",
        securityKey: "opt-3",
        certificate: "OPT-3",
        shares: "500",
      },
      {
        date: "2026-08-01",
        stakeholderKey: "kim",
        name: "Kim Former",
        securityKey: "opt-4",
        certificate: "OPT-4",
        shares: "100",
      },
    ]);
    expect(f.upcoming.find((e) => e.securityKey === "opt-2")).toEqual(
      expect.objectContaining({ date: "2027-01-15", shares: "1200" }),
    );
    expect(f.upcoming.filter((e) => e.securityKey === "opt-4")).toHaveLength(2);
    expect(f.upcoming.every((e, i, all) => i === 0 || all[i - 1]!.date <= e.date)).toBe(true);
  });
  it("caps upcoming events at 50", () => {
    const f = vestingForecast(data, { to: "2030-12-31" });
    expect(f.upcoming).toHaveLength(50);
  });
  it("uses quarter ends and filters by stakeholder or plan", () => {
    const f = vestingForecast(data, {
      from: "2026-07-15",
      to: "2027-03-31",
      interval: "quarter",
      stakeholderKey: "lee",
    });
    expect(f.points.map((p) => p.date)).toEqual([
      "2026-07-15",
      "2026-09-30",
      "2026-12-31",
      "2027-03-31",
    ]);
    expect(f.points.map((p) => p.vested)).toEqual(["100", "600", "1000", "2400"]);
    expect(new Set(f.upcoming.map((e) => e.stakeholderKey))).toEqual(new Set(["lee"]));
    const plan = vestingForecast(data, { to: "2026-12-31", planName: "2020 Plan" });
    expect(plan.points.at(-1)).toEqual({ date: "2026-12-31", vested: "1000", unvested: "0" });
    expect(plan.unprojectable).toEqual([]);
  });
  it("starts no earlier than the snapshot and validates the range", () => {
    expect(vestingForecast(data, { from: "2020-01-01", to: "2026-06-30" }).points).toEqual([
      { date: "2026-06-30", vested: "25000", unvested: "38600" },
    ]);
    expect(() => vestingForecast(data, { to: "2026-01-01" })).toThrow(/on or after 2026-06-30/);
    expect(() => vestingForecast(data, { to: "someday" })).toThrow();
    expect(() => vestingForecast(data, { to: "2060-01-01" })).toThrow(/20 years/);
  });
});

describe("vesting steps and forecast limits", () => {
  const holders = [
    person("sam", "Sam Engineer"),
    person("kim", "Kim Former", { "Termination Date": "2026-10-10" }),
  ];
  const securities = [
    option("a", { vested: "17000" }),
    option("b", { vestingStart: "2026-01-31", vestingSchedule: "1/36 monthly, no cliff" }),
    option("c", { balanceAsOf: "2026-09-15", vested: "20000" }),
    option("d", { vested: "50000" }),
    option("e", { stakeholderKey: "kim", vested: "17000" }),
    option("f", {
      stakeholderKey: "kim",
      vested: null,
      vestingSchedule: "Custom",
      vestEvents: [
        { date: "2026-09-01", shares: "100" },
        { date: "2026-12-01", shares: "100" },
        { date: "2026-12-01", shares: "50" },
      ],
    }),
    option("g", { fields: { "Termination Date": "2026-05-01" }, vested: "15000" }),
    option("h", { vestingSchedule: "1/48 quarterly" }),
  ];
  const data = { asOf: "2026-06-30", stakeholders: holders, securities };
  it("gives the same amounts as projectedVested on every date", () => {
    for (const from of ["2026-06-30", "2026-08-20", "2026-11-01"])
      for (const s of securities) {
        const holder = holders.find((p) => p.key === s.stakeholderKey);
        const curve = vestingSteps(s, data.asOf, from, "2029-12-31", holder);
        if (!curve) {
          expect(s.key).toBe("h");
          continue;
        }
        for (let day = Date.parse(from); day <= Date.parse("2029-12-31"); day += 3 * 86400000) {
          const date = new Date(day).toISOString().slice(0, 10);
          const expected = projectedVested(s, data.asOf, date, holder) ?? s.vested ?? "0";
          const value = curve.steps.filter((x) => x.date <= date).at(-1)?.vested ?? curve.start;
          expect([s.key, from, date, value]).toEqual([s.key, from, date, expected]);
        }
      }
  });
  it("stops vesting at the holder's termination date", () => {
    const f = vestingForecast(data, { to: "2027-06-30", stakeholderKey: "kim" });
    expect(f.upcoming.every((e) => e.date <= "2026-10-10")).toBe(true);
    expect(f.points.at(-1)!.vested).toBe(f.points.find((p) => p.date === "2026-10-31")!.vested);
    expect(projectedVested(securities[4]!, data.asOf, "2027-06-30", holders[1])).toBe(
      projectedVested(securities[4]!, data.asOf, "2026-10-10"),
    );
  });
  it("starts at today and lists only later events, with the full count", () => {
    const f = vestingForecast(data, { to: "2028-06-30", today: "2026-09-24" });
    expect(f.from).toBe("2026-09-24");
    expect(f.points[0]!.date).toBe("2026-09-24");
    expect(f.upcoming[0]!.date > "2026-09-24").toBe(true);
    expect(f.upcoming).toHaveLength(50);
    expect(f.upcomingCount).toBeGreaterThan(50);
    expect(() => vestingForecast(data, { to: "2026-07-31", today: "2026-09-24" })).toThrow(
      /on or after 2026-09-24/,
    );
    const explicit = vestingForecast(data, {
      from: "2026-07-01",
      to: "2026-12-31",
      today: "2026-09-24",
    });
    expect(explicit.points[0]!.date).toBe("2026-07-01");
    expect(explicit.upcoming.every((e) => e.date > "2026-09-24")).toBe(true);
  });
  it("forecasts thousands of grants quickly", () => {
    const many = Array.from({ length: 5000 }, (_, i) =>
      option(`s${i}`, {
        vestingStart: addMonths("2023-01-31", i % 40),
        vested: "10000",
        ...(i % 2
          ? {
              vestEvents: Array.from({ length: 48 }, (_, k) => ({
                date: addMonths(addMonths("2023-01-31", i % 40), k + 1),
                shares: "1000",
              })),
            }
          : {}),
      }),
    );
    const started = performance.now();
    const f = vestingForecast(
      { ...data, securities: many },
      { to: "2031-06-30", today: "2026-09-24" },
    );
    expect(performance.now() - started).toBeLessThan(2000);
    expect(f.upcoming).toHaveLength(50);
  });
});

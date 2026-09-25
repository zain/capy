import { describe, expect, it } from "vite-plus/test";
import { healthCheck } from "@capy/equity/health";
import type { HealthRecord } from "@capy/equity/health";
import type { EquityImport, Security, Stakeholder } from "@capy/equity";

const person = (key: string, name: string, overrides: Partial<Stakeholder> = {}): Stakeholder => ({
  key,
  name,
  relationship: "Employee",
  email: `${key}@example.com`,
  entityType: "Individual",
  externalId: "",
  ...overrides,
});
const stock = (key: string, overrides: Partial<Security> = {}): Security => ({
  key,
  certificate: key.toUpperCase(),
  stakeholderKey: "jane",
  kind: "share",
  className: "Common",
  planName: "",
  issued: "6000000",
  outstanding: "6000000",
  price: "0.0001",
  capital: "600",
  vested: "6000000",
  balanceAsOf: "2026-06-30",
  issuedOn: "2022-01-01",
  vestingStart: "",
  vestingSchedule: "",
  status: "Outstanding",
  sourceSheet: "Common",
  sourceRow: 1,
  fields: { "Pulley ID": `pulley-${key}`, "Acceptance Status": "Accepted" },
  ...overrides,
});
const option = (key: string, overrides: Partial<Security> = {}): Security =>
  stock(key, {
    stakeholderKey: "sam",
    kind: "option",
    planName: "2022 Plan",
    issued: "200000",
    outstanding: "200000",
    price: "0.10",
    capital: null,
    vested: "50000",
    issuedOn: "2025-01-01",
    vestingStart: "2025-01-01",
    vestingSchedule: "1/48 monthly, 25% vest at 12 month cliff",
    sourceSheet: "Options",
    ...overrides,
    fields: {
      "Pulley ID": `pulley-${key}`,
      "Acceptance Status": "Accepted",
      "Expiration Date": "2035-01-01",
      "Voluntary Termination": "3 Months",
      ...overrides.fields,
    },
  });
const record = (
  kind: string,
  title: string,
  data: Record<string, string> = {},
  status = "Recorded",
): HealthRecord => ({ _id: `${kind}-${title}`, kind, title, status, data });
function company(): EquityImport {
  return {
    name: "Acme Robotics",
    asOf: "2026-06-30",
    stakeholders: [
      person("jane", "Jane Founder", { relationship: "Founder" }),
      person("sam", "Sam Engineer"),
    ],
    securities: [stock("cs-1"), option("opt-1")],
    plans: [
      {
        name: "2022 Plan",
        authorized: "1000000",
        available: "800000",
        className: "Common",
        status: "Active",
        boardApproval: "2022-01-01",
        termYears: "10",
      },
    ],
    classes: [
      {
        name: "Common",
        kind: "Common",
        authorized: "10000000",
        reportedOutstanding: "6000000",
        capital: null,
      },
    ],
    warnings: [],
    sheets: [],
  };
}
const records = () => [
  record("document", "Stock plan", { category: "Company", certificates: "" }),
  record("valuation", "2026 409A", {
    "Valuation Date": "2026-03-01",
    "Expiration Date": "2027-03-01",
  }),
];
const profile = {
  "Legal Name": "Acme Robotics, Inc.",
  "State of Incorporation": "Delaware",
  Address: "1 Example Way",
  "Incorporation Date": "2022-01-01",
};
function check(
  change: (data: EquityImport, recs: HealthRecord[]) => void = () => {},
  options: { billing?: { canEdit: boolean }; profile?: Record<string, string> | null } = {},
) {
  const data = company(),
    recs = records();
  change(data, recs);
  return healthCheck({
    data,
    records: recs,
    now: "2026-06-30",
    billing: options.billing ?? { canEdit: true },
    ...(options.profile === null ? {} : { profile: options.profile ?? profile }),
  });
}
const find = (issues: ReturnType<typeof check>, code: string) =>
  issues.find((i) => i.code === code);

describe("health check", () => {
  it("finds nothing wrong with a clean cap table", () => {
    expect(check()).toEqual([]);
  });
  it("accepts a timestamp for now", () => {
    const data = company();
    expect(
      healthCheck({ data, records: records(), now: Date.UTC(2026, 5, 30, 12), profile }),
    ).toEqual([]);
  });
  it("flags a read-only account", () => {
    expect(find(check(undefined, { billing: { canEdit: false } }), "read_only")).toMatchObject({
      severity: "warning",
      count: 1,
    });
  });

  describe("data invariants", () => {
    it("flags impossible balances and missing holders as critical", () => {
      const issues = check((d) => {
        d.securities.push(
          option("opt-2", { issued: "100", outstanding: "200", vested: "0" }),
          option("opt-3", { issued: "100", outstanding: "100", vested: "150" }),
          option("opt-4", {
            stakeholderKey: "ghost",
            outstanding: "10",
            issued: "10",
            vested: "0",
          }),
        );
      });
      expect(find(issues, "outstanding_exceeds_issued")).toMatchObject({
        severity: "critical",
        count: 1,
        items: [
          {
            kind: "security",
            key: "opt-2",
            label: "OPT-2 · Sam Engineer · 200 outstanding of 100 issued",
          },
        ],
      });
      expect(find(issues, "vested_exceeds_outstanding")?.items[0]?.key).toBe("opt-3");
      expect(find(issues, "holder_missing")?.items).toEqual([
        { kind: "security", key: "opt-4", label: "OPT-4 · missing holder ghost" },
      ]);
    });
    it("checks class totals against reported outstanding and authorization", () => {
      const issues = check((d) => {
        d.classes[0]!.reportedOutstanding = "5000000";
        d.classes[0]!.authorized = "5500000";
      });
      expect(find(issues, "class_outstanding_mismatch")).toMatchObject({
        severity: "critical",
        items: [
          {
            kind: "class",
            key: "Common",
            label: "Common: 6,000,000 on securities, 5,000,000 reported",
          },
        ],
      });
      expect(find(issues, "authorized_exceeded")?.items).toEqual([
        {
          kind: "class",
          key: "Common",
          label: "Common: 6,000,000 outstanding, 5,500,000 authorized",
        },
      ]);
    });
    it("flags a plan whose available shares exceed its reserve", () => {
      const issues = check((d) => {
        d.plans[0]!.available = "1000001";
      });
      expect(find(issues, "authorized_exceeded")?.items).toEqual([
        {
          kind: "plan",
          key: "2022 Plan",
          label: "2022 Plan: 1,000,001 available, 1,000,000 authorized",
        },
      ]);
    });
    it("warns about duplicate certificate labels within a class, ignoring RSA mirrors", () => {
      const issues = check((d) => {
        d.securities.push(
          stock("cs-1b", { certificate: "CS-1", outstanding: "0", issued: "0", vested: "0" }),
          stock("cs-1-pref", {
            certificate: "CS-1",
            className: "Preferred",
            outstanding: "0",
            issued: "0",
            vested: "0",
          }),
          stock("rsa-1", { certificate: "CS-1", kind: "rsa" }),
        );
      });
      expect(find(issues, "duplicate_certificates")).toMatchObject({
        severity: "warning",
        count: 1,
        items: [{ label: "CS-1 (Common) × 2", key: "cs-1" }],
      });
    });
    it("sorts critical issues before warnings and info", () => {
      const issues = check(
        (d, recs) => {
          d.warnings.push("Imported from a test workbook.");
          d.securities.push(option("opt-2", { issued: "1", outstanding: "2", vested: "0" }));
          recs.splice(0, 1);
        },
        { billing: { canEdit: false } },
      );
      const order = issues.map((i) => i.severity);
      expect(order).toEqual(
        [...order].sort(
          (a, b) =>
            ["critical", "warning", "info"].indexOf(a) - ["critical", "warning", "info"].indexOf(b),
        ),
      );
      expect(issues[0]!.code).toBe("outstanding_exceeds_issued");
      expect(issues.at(-1)!.code).toBe("import_warnings");
    });
  });

  describe("options and exercise windows", () => {
    it("flags options past expiration without also flagging their window", () => {
      const issues = check((d) => {
        d.securities.push(
          option("opt-2", {
            fields: { "Expiration Date": "2026-06-29", "Termination Date": "2025-01-01" },
          }),
          option("opt-3", { fields: { "Expiration Date": "2026-06-30" } }),
          option("opt-4", {
            outstanding: "0",
            vested: "0",
            fields: { "Expiration Date": "2020-01-01" },
          }),
        );
      });
      expect(find(issues, "options_expired")?.items.map((i) => i.key)).toEqual(["opt-2"]);
      expect(find(issues, "exercise_window_expired")).toBeUndefined();
    });
    it("flags closed and closing post-termination windows", () => {
      const issues = check((d) => {
        d.stakeholders.push(
          person("kim", "Kim Former", {
            relationship: "Ex-Employee",
            fields: { "Termination Date": "2026-01-15", "Termination Type": "Voluntary" },
          }),
          person("lee", "Lee Former", {
            relationship: "Ex-Employee",
            fields: { "Termination Date": "2026-04-15", "Termination Type": "Involuntary" },
          }),
        );
        d.securities.push(
          // 3 months after Jan 15: closed Apr 15.
          option("opt-k", { stakeholderKey: "kim" }),
          // Involuntary: 3 months after Apr 15 closes Jul 15, within 30 days.
          option("opt-l", {
            stakeholderKey: "lee",
            fields: { "Involuntary Termination": "3 Months" },
          }),
          // A one-year involuntary window is not flagged.
          option("opt-l2", {
            stakeholderKey: "lee",
            fields: { "Involuntary Termination": "1 Year" },
          }),
          // Already cancelled.
          option("opt-k2", { stakeholderKey: "kim", outstanding: "0", vested: "0" }),
        );
      });
      expect(find(issues, "exercise_window_expired")).toMatchObject({
        severity: "warning",
        count: 1,
        items: [{ key: "opt-k", label: expect.stringContaining("deadline 2026-04-15") }],
      });
      expect(find(issues, "exercise_window_ending")).toMatchObject({
        count: 1,
        items: [{ key: "opt-l", label: expect.stringContaining("exercise by 2026-07-15") }],
      });
    });
  });

  describe("pool", () => {
    it("flags plans under 10% available", () => {
      expect(
        find(
          check((d) => void (d.plans[0]!.available = "100000")),
          "pool_low",
        ),
      ).toBeUndefined();
      expect(
        find(
          check((d) => void (d.plans[0]!.available = "99999")),
          "pool_low",
        ),
      ).toMatchObject({
        severity: "warning",
        items: [
          {
            kind: "plan",
            key: "2022 Plan",
            label: "2022 Plan: 99,999 of 1,000,000 available (10.00%)",
          },
        ],
      });
    });
    it("flags expired plans that still have available shares", () => {
      expect(
        find(
          check((d) => void (d.plans[0]!.status = "Expired")),
          "plan_expired",
        )?.count,
      ).toBe(1);
      const lapsed = check((d) => {
        d.plans[0]!.boardApproval = "2016-06-30";
      });
      expect(find(lapsed, "plan_expired")?.items[0]?.label).toBe("2022 Plan: 800,000 available");
      const empty = check((d) => {
        d.plans[0]!.status = "Expired";
        d.plans[0]!.available = "0";
      });
      expect(find(empty, "plan_expired")).toBeUndefined();
    });
  });

  it("flags treasury-like holders counted in fully diluted", () => {
    const issues = check((d) => {
      d.stakeholders.push(person("tr", "Acme Robotics Treasury", { relationship: "Other" }));
      d.securities.push(
        stock("cs-t", {
          stakeholderKey: "tr",
          outstanding: "250000",
          issued: "250000",
          vested: "250000",
        }),
      );
      d.classes[0]!.reportedOutstanding = "6250000";
    });
    expect(find(issues, "treasury_in_fully_diluted")?.items).toEqual([
      { kind: "stakeholder", key: "tr", label: "Acme Robotics Treasury · 250,000 shares" },
    ]);
  });
  it("flags holders without an email, but not contacts without holdings", () => {
    const issues = check((d) => {
      d.stakeholders.push(
        person("nomail", "No Mail", { email: "" }),
        person("contact", "Contact", { email: "" }),
      );
      d.securities.push(option("opt-n", { stakeholderKey: "nomail" }));
    });
    expect(find(issues, "missing_emails")?.items).toEqual([
      { kind: "stakeholder", key: "nomail", label: "No Mail" },
    ]);
  });
  it("flags vesting schedules that cannot be projected", () => {
    const issues = check((d) => {
      d.securities.push(
        option("opt-c", { vestingSchedule: "Custom - See Grant Agreement" }),
        option("opt-e", {
          vestingSchedule: "Custom",
          vestEvents: [{ date: "2026-01-01", shares: "200000" }],
        }),
        option("opt-v", { vestingSchedule: "Custom", vested: "200000" }),
      );
    });
    expect(find(issues, "vesting_unprojectable")).toMatchObject({
      count: 1,
      items: [{ key: "opt-c", label: "OPT-C · Sam Engineer · Custom - See Grant Agreement" }],
    });
  });

  describe("grant acceptance", () => {
    it("lists pending grants from enriched data", () => {
      const issues = check((d) => {
        d.securities.push(option("opt-p", { fields: { "Acceptance Status": "Pending" } }));
      });
      expect(find(issues, "grants_pending_acceptance")).toMatchObject({
        severity: "warning",
        count: 1,
        items: [{ key: "opt-p" }],
      });
      expect(find(issues, "grants_acceptance_unknown")).toBeUndefined();
    });
    it("reports unknown, not none, when the data was not enriched", () => {
      const issues = check((d) => {
        for (const s of d.securities) s.fields = { "Expiration Date": "2035-01-01" };
      });
      expect(find(issues, "grants_pending_acceptance")).toBeUndefined();
      expect(find(issues, "grants_acceptance_unknown")).toMatchObject({
        severity: "info",
        unknown: true,
        count: 2,
        items: [],
      });
    });
    it("ignores convertibles and cancelled grants", () => {
      const issues = check((d) => {
        d.securities.push(
          stock("safe-1", { kind: "safe", fields: {} }),
          option("opt-x", {
            outstanding: "0",
            vested: "0",
            fields: { "Pulley ID": "", "Acceptance Status": "" },
          }),
        );
      });
      expect(find(issues, "grants_acceptance_unknown")).toBeUndefined();
    });
  });

  describe("83(b) elections", () => {
    const unvested = (overrides: Partial<Security> = {}) =>
      stock("cs-u", {
        stakeholderKey: "sam",
        issued: "400000",
        outstanding: "400000",
        vested: "100000",
        ...overrides,
      });
    it("flags enriched unvested stock with no election", () => {
      const issues = check((d) => {
        d.securities.push(unvested());
        d.classes[0]!.reportedOutstanding = "6400000";
      });
      expect(find(issues, "possible_missing_83b")).toMatchObject({
        severity: "warning",
        count: 1,
        items: [{ key: "cs-u", label: "CS-U · Sam Engineer · issued 2022-01-01" }],
      });
    });
    it("accepts a filed flag or an 83(b) document listing the certificate", () => {
      const filed = check((d) => {
        d.securities.push(unvested({ fields: { "Pulley ID": "x", "83(b) Election": "Filed" } }));
        d.classes[0]!.reportedOutstanding = "6400000";
      });
      expect(find(filed, "possible_missing_83b")).toBeUndefined();
      const documented = check((d, recs) => {
        d.securities.push(unvested({ fields: {} }));
        d.classes[0]!.reportedOutstanding = "6400000";
        recs.push(
          record("document", "Sam 83(b)", {
            category: "83(b) Elections",
            certificates: "CS-9, CS-U",
          }),
        );
      });
      expect(find(documented, "possible_missing_83b")).toBeUndefined();
      expect(find(documented, "83b_status_unknown")).toBeUndefined();
    });
    it("reports unknown when the import did not include filing status", () => {
      const issues = check((d) => {
        d.securities.push(
          unvested({ fields: { "Shares Unvested": "0" } }),
          stock("cs-r", {
            stakeholderKey: "sam",
            vested: null,
            issued: "10",
            outstanding: "10",
            fields: { "Shares Subject to Repurchase (Unvested)": "1,000" },
          }),
        );
        d.classes[0]!.reportedOutstanding = "6400010";
      });
      expect(find(issues, "possible_missing_83b")).toBeUndefined();
      expect(find(issues, "83b_status_unknown")).toMatchObject({
        severity: "info",
        unknown: true,
        count: 2,
      });
    });
    it("finds restricted stock mirrored by an RSA", () => {
      const issues = check((d) => {
        d.securities.push(stock("rsa-1", { kind: "rsa", certificate: "CS-1" }));
      });
      expect(find(issues, "possible_missing_83b")?.items.map((i) => i.key)).toEqual(["cs-1"]);
    });
    it("finds early-exercised stock recorded in Capy", () => {
      const issues = check((d) => {
        d.securities[1]!.fields["Early Exercise"] = "Yes";
        d.securities.push(
          stock("cs-x", {
            certificate: "CS-X",
            stakeholderKey: "sam",
            issued: "1000",
            outstanding: "1000",
            vested: "1000",
            sourceSheet: "Recorded in Capy",
            fields: { Source: "Exercised from OPT-1", "Exercise Date": "2026-06-01" },
          }),
        );
        d.classes[0]!.reportedOutstanding = "6001000";
      });
      expect(find(issues, "possible_missing_83b")?.items.map((i) => i.key)).toEqual(["cs-x"]);
      expect(find(issues, "grants_acceptance_unknown")?.count).toBe(1);
    });
  });

  describe("records", () => {
    it("flags draft approvals and consents, and lists draft offers", () => {
      const issues = check((_, recs) => {
        recs.push(
          record(
            "approval",
            "Option grants",
            { Notes: "Still awaiting signature from Jane Founder." },
            "Draft",
          ),
          record("consent", "Stockholder consent", {}, "Draft"),
          record("approval", "Signed approval", {}, "Recorded"),
          record("offer", "Offer to Pat", {}, "Draft"),
        );
      });
      expect(find(issues, "unsigned_approvals")?.items).toEqual([
        {
          kind: "record",
          key: "approval-Option grants",
          label: "Option grants · awaiting signatures",
        },
        {
          kind: "record",
          key: "consent-Stockholder consent",
          label: "Stockholder consent · draft",
        },
      ]);
      expect(find(issues, "draft_offers")).toMatchObject({ severity: "info", count: 1 });
    });
    it("flags a missing 409A as a warning when options are outstanding", () => {
      expect(
        find(
          check((_, recs) => void recs.splice(1, 1)),
          "valuation_missing",
        )?.severity,
      ).toBe("warning");
      const noOptions = check((d, recs) => {
        recs.splice(1, 1);
        d.securities.splice(1, 1);
      });
      expect(find(noOptions, "valuation_missing")?.severity).toBe("info");
      const archived = check((_, recs) => void (recs[1]!.status = "Archived"));
      expect(find(archived, "valuation_missing")).toBeDefined();
    });
    it("flags an expired or expiring 409A using the latest valuation", () => {
      const latest = "valuation-2026 409A";
      const expired = check((_, recs) => {
        recs[1]!.data["Expiration Date"] = "2026-06-01";
        recs.push(record("valuation", "Old 409A", { "Valuation Date": "2024-01-01" }));
      });
      expect(find(expired, "valuation_expired")).toMatchObject({
        severity: "warning",
        items: [{ key: latest }],
      });
      const implied = check((_, recs) => {
        recs[1]!.data = { "Valuation Date": "2025-06-01" };
      });
      expect(find(implied, "valuation_expired")?.detail).toMatch(/2026-06-01 \(12 months after/);
      const soon = check((_, recs) => void (recs[1]!.data["Expiration Date"] = "2026-07-20"));
      expect(find(soon, "valuation_expiring")?.severity).toBe("info");
    });
    it("notes when no documents are uploaded", () => {
      expect(
        find(
          check((_, recs) => void recs.splice(0, 1)),
          "no_documents",
        ),
      ).toMatchObject({
        severity: "info",
        count: 1,
      });
    });
  });

  it("lists outstanding convertibles and notes past maturity", () => {
    const issues = check((d) => {
      d.stakeholders.push(person("vc", "Seed Fund LP", { relationship: "Investor" }));
      d.securities.push(
        stock("safe-1", {
          kind: "safe",
          stakeholderKey: "vc",
          issued: "500000",
          outstanding: "500000",
          fields: { "Maturity Date": "2020-01-01" },
        }),
        stock("note-1", {
          kind: "note",
          stakeholderKey: "vc",
          issued: "250000",
          outstanding: "250000",
          fields: { "Maturity Date": "2026-06-01" },
        }),
        stock("note-2", {
          kind: "note",
          stakeholderKey: "vc",
          issued: "100000",
          outstanding: "100000",
          fields: { "Maturity Date": "2027-06-01" },
        }),
        stock("safe-2", {
          kind: "safe",
          stakeholderKey: "vc",
          issued: "100000",
          outstanding: "0",
          status: "Converted",
        }),
      );
    });
    expect(find(issues, "convertibles_outstanding")).toMatchObject({
      severity: "info",
      count: 3,
      detail: expect.stringContaining("$850,000 outstanding principal"),
    });
    expect(find(issues, "notes_past_maturity")?.items.map((i) => i.key)).toEqual(["note-1"]);
  });
  it("flags an incomplete company profile only when a profile is given", () => {
    expect(
      find(
        check(undefined, { profile: { "Legal Name": "Acme Robotics, Inc." } }),
        "profile_incomplete",
      )?.items.map((i) => i.label),
    ).toEqual(["State of Incorporation", "Address", "Incorporation Date"]);
    expect(find(check(undefined, { profile: null }), "profile_incomplete")).toBeUndefined();
  });
  it("passes import warnings through and caps items at 25", () => {
    const issues = check((d) => {
      d.warnings = Array.from({ length: 30 }, (_, i) => `Warning ${i + 1}`);
    });
    const warnings = find(issues, "import_warnings")!;
    expect(warnings).toMatchObject({ severity: "info", count: 30 });
    expect(warnings.items).toHaveLength(25);
    expect(warnings.items[0]).toEqual({ label: "Warning 1", kind: "company" });
  });
});

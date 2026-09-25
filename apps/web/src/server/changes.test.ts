import { describe, expect, it } from "vite-plus/test";
import {
  applySecurityEvent,
  applySecurityToMetadata,
  mergeStakeholder,
  nextCertificate,
  prepareChange,
  recordStatusSchema,
  recordTitleSchema,
  securityValuesError,
} from "@capy/equity/changes";
import { securitySchema, stakeholderSchema } from "@capy/equity";
import { convexToJson } from "convex/values";
import type { EquityImport, Security } from "@capy/equity";

const base: Security = {
  key: "",
  certificate: "",
  stakeholderKey: "",
  kind: "option",
  className: "Common",
  planName: "2024 Plan",
  issued: "0",
  outstanding: "0",
  price: "0.5",
  capital: null,
  vested: "0",
  issuedOn: "2025-06-30",
  vestingStart: "2025-06-30",
  vestingSchedule: "1/48 monthly, 25% vest at 12 month cliff",
  status: "Outstanding",
  sourceSheet: "Test",
  sourceRow: 1,
  fields: {},
};
function company(): EquityImport {
  const person = (key: string, name: string, relationship: string) => ({
    key,
    name,
    relationship,
    email: `${key}@acme.example`,
    entityType: "Individual",
    externalId: "",
    fields: { Title: relationship },
  });
  return {
    name: "Acme Robotics",
    asOf: "2026-06-30",
    stakeholders: [
      person("jane", "Jane Founder", "Founder"),
      person("sam", "Sam Engineer", "Employee"),
      person("riley", "Riley Advisor", "Advisor"),
      person("taylor", "Taylor Designer", "Employee"),
      person("seed", "Seed Fund", "Investor"),
    ],
    securities: [
      {
        ...base,
        key: "cs-1",
        certificate: "CS-1",
        stakeholderKey: "jane",
        kind: "share",
        planName: "",
        issued: "8000000",
        outstanding: "8000000",
        price: "0.00001",
        capital: "80",
        vested: "8000000",
        issuedOn: "2024-01-01",
        vestingStart: "",
        vestingSchedule: "",
      },
      {
        ...base,
        key: "es-1",
        certificate: "ES-1",
        stakeholderKey: "sam",
        issued: "100000",
        outstanding: "100000",
        vested: "25000",
      },
      {
        ...base,
        key: "es-2",
        certificate: "ES-2",
        stakeholderKey: "riley",
        issued: "20000",
        outstanding: "20000",
        issuedOn: "2026-06-01",
        vestingStart: "2026-06-01",
        fields: { "Early Exercise": "Yes", "Expiration Date": "2036-06-01" },
      },
      {
        ...base,
        key: "safe-1",
        certificate: "SAFE-1",
        stakeholderKey: "seed",
        kind: "safe",
        className: "",
        planName: "",
        issued: "500000",
        outstanding: "500000",
        price: null,
        vested: null,
        issuedOn: "2025-01-01",
        vestingStart: "",
        vestingSchedule: "",
        fields: {
          "Valuation Cap": "10000000",
          "Conversion Type": "Post-Money",
          "Conversion Discount": "0",
        },
      },
    ],
    classes: [
      {
        name: "Common",
        kind: "Common",
        authorized: "20000000",
        reportedOutstanding: "8000000",
        capital: "80",
      },
    ],
    plans: [
      { name: "2024 Plan", authorized: "2000000", available: "1880000", className: "Common" },
    ],
    warnings: [],
    sheets: [],
  };
}
function ok(input: unknown, data = company()) {
  const result = prepareChange(data, input, { today: "2026-07-20" });
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result;
}
type Prepared = ReturnType<typeof ok>;
const before = (r: Prepared) =>
  Object.fromEntries(
    r.preview.values.filter((v) => v.before !== undefined).map((v) => [v.label, v.before]),
  );
const after = (r: Prepared) => Object.fromEntries(r.preview.values.map((v) => [v.label, v.after]));
function errors(input: unknown, data = company()) {
  const result = prepareChange(data, input, { today: "2026-07-20" });
  if (result.ok) throw new Error("Expected the change to be rejected.");
  return result.errors;
}
const grant = {
  kind: "option_grant",
  stakeholderKey: "taylor",
  planName: "2024 Plan",
  shares: "50,000",
  exercisePrice: "0.50",
  grantType: "ISO",
  issuedOn: "2026-07-15",
  vestingSchedule: "1/48 monthly, 25% vest at 12 month cliff",
};

describe("change engine: option grants", () => {
  it("previews a grant from the pool without changing fully diluted shares", () => {
    const r = ok(grant);
    expect(r.preview.title).toBe("Grant 50,000 ISO options to Taylor Designer");
    expect(r.preview.totalsBefore).toMatchObject({
      outstandingStock: "8000000",
      outstandingAwards: "120000",
      available: "1880000",
      fullyDiluted: "10000000",
    });
    expect(r.preview.totalsAfter).toMatchObject({
      outstandingAwards: "170000",
      available: "1830000",
      fullyDiluted: "10000000",
      stakeholdersWithSecurities: 5,
    });
    expect(before(r)).toEqual({
      "2024 Plan available": "1880000",
      "Taylor Designer fully diluted shares": "0",
    });
    expect(after(r)["2024 Plan available"]).toBe("1830000");
    expect(r.preview.ownership).toEqual([
      { name: "Taylor Designer", before: "0.0000", after: "0.5000" },
    ]);
    expect(r.preview.warnings).toEqual([]);
    expect(r.input).toMatchObject({ shares: "50000", exercisePrice: "0.5" });
    if (r.apply.action !== "saveSecurity") throw new Error("Wrong apply step.");
    const s = r.apply.data;
    expect(securitySchema.safeParse(s).success).toBe(true);
    expect(s).toMatchObject({
      certificate: "ES-3",
      kind: "option",
      className: "Common",
      planName: "2024 Plan",
      issued: "50000",
      outstanding: "50000",
      price: "0.5",
      vested: "0",
      balanceAsOf: "2026-07-15",
      vestingStart: "2026-07-15",
      sourceSheet: "Recorded in Capy",
      fields: { "Grant Type": "ISO" },
    });
    expect(r.apply.reason).toBe(r.preview.title);
  });
  it("records RSUs, board approval, expiration and early exercise terms", () => {
    const r = ok({
      ...grant,
      grantType: "RSU",
      exercisePrice: 0,
      certificate: "RSU-7",
      expirationDate: "2036-07-15",
      boardApprovalDate: "2026-07-10",
    });
    if (r.apply.action !== "saveSecurity") throw new Error("Wrong apply step.");
    expect(r.apply.data).toMatchObject({
      kind: "rsu",
      certificate: "RSU-7",
      fields: { "Expiration Date": "2036-07-15", "Board Approval Date": "2026-07-10" },
    });
    expect(r.preview.title).toBe("Grant 50,000 RSUs to Taylor Designer");
    expect(ok({ ...grant, earlyExercise: true }).apply).toMatchObject({
      data: { fields: { "Early Exercise": "Yes" } },
    });
  });
  it("vests the elapsed part of a grant whose vesting started earlier", () => {
    const r = ok({ ...grant, shares: "48000", vestingStart: "2025-07-15" });
    if (r.apply.action !== "saveSecurity") throw new Error("Wrong apply step.");
    expect(r.apply.data.vested).toBe("12000");
    expect(r.preview.warnings).toContain(
      "12,000 shares are already vested because vesting starts 2025-07-15.",
    );
  });
  it("warns about schedules Capy can't project, reused labels and future dates", () => {
    const r = ok({
      ...grant,
      vestingSchedule: "Six Month Monthly",
      certificate: "ES-1",
      issuedOn: "2026-08-01",
    });
    expect(r.preview.warnings).toEqual([
      expect.stringContaining("can’t project the vesting schedule"),
      "Certificate ES-1 is already used by another security.",
      "The grant date is in the future.",
    ]);
    expect(ok({ ...grant, vestingSchedule: undefined }).preview.warnings[0]).toContain(
      "No vesting schedule",
    );
  });
  it("rejects grants the recording mutation would reject", () => {
    expect(errors({ ...grant, stakeholderKey: "nobody" })).toEqual([
      "stakeholderKey: No stakeholder with that key. Use find_stakeholders, or draft a stakeholder_update to add them first.",
    ]);
    expect(errors({ ...grant, shares: "1880001" })).toEqual([
      "The plan does not have enough available shares for this change.",
    ]);
    const noClass = company();
    noClass.plans[0]!.className = "Preferred";
    expect(errors(grant, noClass)).toEqual(["Select an existing share class."]);
  });
  it("reports every input problem at once", () => {
    expect(
      errors({ ...grant, planName: "Old Plan", shares: "0", expirationDate: "2026-01-01" }),
    ).toEqual([
      'planName: Choose one of "2024 Plan".',
      "shares: Enter a positive number of shares.",
      "expirationDate: The expiration date must be after the grant date.",
    ]);
    expect(errors({ ...grant, issuedOn: "July 15", shares: "-5", vestingCliff: 12 })).toEqual([
      expect.stringMatching(/^shares: /),
      expect.stringMatching(/^issuedOn: /),
      expect.stringContaining("vestingCliff"),
    ]);
    expect(errors({ ...grant, grantType: "RSU", earlyExercise: true })).toEqual([
      "earlyExercise: RSUs can’t be early exercised.",
    ]);
  });
});

describe("change engine: exercises", () => {
  const exercise = {
    kind: "exercise",
    securityKey: "es-1",
    shares: "10000",
    date: "2026-07-15",
    certificate: "CS-2",
  };
  it("moves exercised options into stock without changing fully diluted shares", () => {
    const r = ok(exercise);
    expect(r.target).toEqual({ type: "security", key: "es-1" });
    expect(r.preview.title).toBe("Exercise 10,000 options from ES-1 for Sam Engineer");
    expect(r.preview.totalsAfter).toMatchObject({
      outstandingStock: "8010000",
      outstandingAwards: "110000",
      available: "1880000",
      fullyDiluted: "10000000",
    });
    expect(before(r)).toMatchObject({
      Outstanding: "100000",
      "Vested on 2026-07-15": "25000",
    });
    expect(after(r)).toMatchObject({
      Outstanding: "90000",
      "Vested on 2026-07-15": "15000",
      "New stock certificate": "CS-2",
      "Exercise payment": "5000",
    });
    expect(r.preview.ownership).toEqual([
      { name: "Sam Engineer", before: "1.0000", after: "1.0000" },
    ]);
    expect(r.apply).toEqual({
      action: "securityEvent",
      securityKey: "es-1",
      event: "exercise",
      quantity: "10000",
      date: "2026-07-15",
      reason: r.preview.title,
      certificate: "CS-2",
    });
  });
  it("flags unvested shares in an early exercise", () => {
    const r = ok({ ...exercise, securityKey: "es-2", shares: "5000", date: "2026-07-01" });
    expect(r.preview.warnings).toEqual([
      "5,000 of these shares are unvested (early exercise). The holder has 30 days to file an 83(b) election.",
    ]);
  });
  it("rejects exercises the mutation would reject", () => {
    expect(errors({ ...exercise, shares: "25001" })).toEqual([
      "Exercise exceeds the vested balance. Confirm vesting first.",
    ]);
    expect(errors({ ...exercise, shares: "100001" })).toEqual([
      "Enter a positive quantity no greater than the outstanding balance.",
    ]);
    expect(errors({ ...exercise, date: "2026-06-01" })).toEqual([
      "Record events on or after the imported snapshot and issue date. Use Edit to correct historical data.",
    ]);
    expect(errors({ ...exercise, securityKey: "cs-1" })).toEqual([
      "Only options can be exercised here.",
    ]);
    expect(errors({ ...exercise, securityKey: "missing" })).toEqual(["Security not found."]);
    const full = company();
    full.classes[0]!.authorized = "8005000";
    expect(errors(exercise, full)).toEqual([
      "This exercise would exceed the share class authorization.",
    ]);
    expect(errors({ ...exercise, certificate: undefined })).toEqual([
      expect.stringMatching(/^certificate: /),
    ]);
  });
});

describe("change engine: cancellations", () => {
  const cancel = { kind: "cancellation", securityKey: "es-1", shares: "90000", date: "2026-07-15" };
  it("returns cancelled options to the plan", () => {
    const r = ok(cancel);
    expect(r.preview.totalsAfter).toMatchObject({
      outstandingAwards: "30000",
      available: "1970000",
      fullyDiluted: "10000000",
    });
    expect(before(r)).toMatchObject({ "2024 Plan available": "1880000" });
    expect(after(r)).toMatchObject({
      Outstanding: "10000",
      "Vested on 2026-07-15": "10000",
      "2024 Plan available": "1970000",
    });
    expect(r.preview.warnings).toEqual(["15,000 of the cancelled shares are vested."]);
    expect(r.apply).toMatchObject({ action: "securityEvent", event: "cancel" });
    expect(after(ok({ ...cancel, shares: "100000" })).Status).toBe("Cancelled");
  });
  it("cancels stock without returning it to a plan", () => {
    const r = ok({ ...cancel, securityKey: "cs-1", shares: "1000000" });
    expect(r.preview.totalsAfter).toMatchObject({
      outstandingStock: "7000000",
      fullyDiluted: "9000000",
    });
    expect(r.preview.ownership).toEqual([
      { name: "Jane Founder", before: "80.0000", after: "77.7778" },
    ]);
  });
  it("rejects cancellations the mutation would reject", () => {
    expect(errors({ ...cancel, shares: "0" })).toEqual([
      "Enter a positive quantity no greater than the outstanding balance.",
    ]);
    expect(errors({ ...cancel, date: "2026-02-30" })).toEqual([expect.stringMatching(/^date: /)]);
  });
});

describe("change engine: stakeholder updates", () => {
  it("merges a patch into the stored stakeholder", () => {
    const r = ok({
      kind: "stakeholder_update",
      stakeholderKey: "sam",
      patch: { email: "sam@new.example", fields: { Phone: "555-0100" } },
    });
    expect(r.preview.title).toBe("Update Sam Engineer: email, phone");
    expect(before(r)).toEqual({ Email: "sam@acme.example", Phone: "" });
    expect(after(r)).toEqual({ Email: "sam@new.example", Phone: "555-0100" });
    expect(r.preview.totalsAfter).toEqual(r.preview.totalsBefore);
    expect(r.target).toEqual({ type: "stakeholder", key: "sam" });
    expect(r.apply).toEqual({
      action: "saveStakeholder",
      stakeholderKey: "sam",
      data: {
        key: "sam",
        name: "Sam Engineer",
        relationship: "Employee",
        email: "sam@new.example",
        entityType: "Individual",
        externalId: "",
        fields: { Title: "Employee", Phone: "555-0100" },
      },
    });
  });
  it("adds a new stakeholder", () => {
    const r = ok({
      kind: "stakeholder_update",
      patch: { name: "Morgan Hire", email: "morgan", relationship: "Employee" },
    });
    expect(r.target).toBeUndefined();
    expect(r.preview.title).toBe("Add stakeholder Morgan Hire");
    expect(r.preview.warnings).toEqual(['"morgan" doesn’t look like an email address.']);
    if (r.apply.action !== "saveStakeholder") throw new Error("Wrong apply step.");
    expect(r.apply.stakeholderKey).toBeUndefined();
    expect(stakeholderSchema.safeParse(r.apply.data).success).toBe(true);
    expect(
      ok({ kind: "stakeholder_update", patch: { name: "jane founder" } }).preview.warnings,
    ).toEqual(["Another stakeholder is already named jane founder."]);
  });
  it("rejects unknown people, empty patches and nameless new stakeholders", () => {
    expect(errors({ kind: "stakeholder_update", stakeholderKey: "x", patch: {} })).toEqual([
      "Stakeholder not found.",
    ]);
    expect(
      errors({
        kind: "stakeholder_update",
        stakeholderKey: "sam",
        patch: { name: "Sam Engineer" },
      }),
    ).toEqual(["patch: This update doesn’t change anything."]);
    expect(errors({ kind: "stakeholder_update", patch: { email: "a@b.example" } })).toEqual([
      "patch.name: Enter a name for the new stakeholder.",
    ]);
    expect(
      errors({ kind: "stakeholder_update", stakeholderKey: "sam", patch: { key: "other" } }),
    ).toEqual([expect.stringContaining("key")]);
  });
});

describe("change engine: records", () => {
  it("drafts a board consent without touching the cap table", () => {
    const r = ok({
      kind: "board_consent",
      title: "Approve option grant to Taylor Designer",
      effectiveDate: "2026-07-15",
      boardMembers: "Jane Founder",
      text: "RESOLVED, that the Board approves the grant.",
    });
    expect(r.preview.totalsAfter).toEqual(r.preview.totalsBefore);
    expect(r.apply).toEqual({
      action: "saveRecord",
      kind: "approval",
      title: "Approve option grant to Taylor Designer",
      status: "Draft",
      data: {
        "Approval Type": "Board consent",
        "Effective Date": "2026-07-15",
        "Board Members": "Jane Founder",
        Notes: "RESOLVED, that the Board approves the grant.",
      },
    });
    expect(errors({ kind: "board_consent", title: " ", text: "" })).toEqual([
      expect.stringMatching(/^title: /),
      expect.stringMatching(/^text: /),
    ]);
  });
  it("saves a round scenario with its modeled ownership", () => {
    const r = ok({ kind: "round_scenario", preMoney: "20000000", investment: 5000000 });
    expect(r.preview.totalsAfter).toEqual(r.preview.totalsBefore);
    expect(after(r)).toMatchObject({ "Post-money valuation": "25000000" });
    const investors = r.preview.ownership!.find((o) => o.name === "New investors")!;
    expect(investors).toEqual({ name: "New investors", before: "0.00", after: "20.00" });
    expect(r.preview.ownership!.find((o) => o.name === "Seed Fund")!.after).toBe("4.00");
    expect(r.apply).toEqual({
      action: "saveRecord",
      kind: "fundraising",
      title: "Round model 2026-07-20",
      status: "Draft",
      data: { "Pre-money Valuation": "20000000", Investment: "5000000" },
    });
    expect(errors({ kind: "round_scenario", preMoney: "0", investment: "1" })).toEqual([
      "Enter a positive valuation and a nonnegative investment.",
    ]);
  });
  it("rejects unknown kinds", () => {
    expect(errors({ kind: "issue_shares" })).toEqual([
      "kind: Choose one of option_grant, exercise, cancellation, stakeholder_update, board_consent, round_scenario.",
    ]);
    expect(errors(null)[0]).toMatch(/^kind: /);
  });
});

describe("change engine: stored data", () => {
  it("keeps names out of field names, so Convex can store any preview", () => {
    const data = company();
    data.stakeholders.find((p) => p.key === "taylor")!.name = "José Núñez";
    for (const p of data.plans) if (p.name === "2024 Plan") p.name = "Plan – Série A";
    for (const x of data.securities) if (x.planName === "2024 Plan") x.planName = "Plan – Série A";
    const r = ok({ ...grant, planName: "Plan – Série A" }, data);
    expect(before(r)).toEqual({
      "Plan – Série A available": "1880000",
      "José Núñez fully diluted shares": "0",
    });
    expect(() => convexToJson({ input: r.input, preview: r.preview } as never)).not.toThrow();
    expect(
      errors({
        kind: "stakeholder_update",
        stakeholderKey: "sam",
        patch: { fields: { Año: "1" } },
      }),
    ).toEqual(["patch.fields: Field names use plain ASCII characters and can’t start with $."]);
    expect(
      errors({ kind: "stakeholder_update", stakeholderKey: "sam", patch: { fields: { $x: "1" } } }),
    ).toHaveLength(1);
  });
  it("stores amounts as plain decimals", () => {
    expect(ok({ ...grant, shares: "$1,000.0", exercisePrice: 0.25 }).input).toMatchObject({
      shares: "1000",
      exercisePrice: "0.25",
    });
    expect(errors({ ...grant, shares: "0x3E8", exercisePrice: "1e-1" })).toEqual([
      expect.stringMatching(/^shares: Enter a plain number/),
      expect.stringMatching(/^exercisePrice: Enter a plain number/),
    ]);
    expect(errors({ ...grant, shares: 1e21 })[0]).toMatch(/^shares: /);
  });
  it("says how each preview value reads", () => {
    const round = ok({ kind: "round_scenario", preMoney: "20000000", investment: "5000000" });
    const unit = (r: Prepared, label: string) =>
      r.preview.values.find((v) => v.label === label)?.unit;
    expect(unit(round, "Price per share")).toBe("price");
    expect(unit(round, "Post-money valuation")).toBe("usd");
    expect(unit(round, "New investor shares")).toBe("shares");
    const exercise = ok({
      kind: "exercise",
      securityKey: "es-1",
      shares: "100",
      date: "2026-07-15",
      certificate: "CS-2",
    });
    expect(unit(exercise, "Exercise payment")).toBe("usd");
    expect(unit(exercise, "Status")).toBe("text");
  });
  it("stops vesting at the holder's termination date", () => {
    const cancel = { kind: "cancellation", securityKey: "es-1", shares: "1", date: "2027-06-30" };
    const vested = (r: Prepared) => before(r)["Vested on 2027-06-30"];
    const terminated = company();
    terminated.stakeholders.find((p) => p.key === "sam")!.fields = {
      "Termination Date": "2026-08-15",
    };
    const onTermination = ok({ ...cancel, date: "2026-08-15" });
    expect(vested(ok(cancel, terminated))).toBe(before(onTermination)["Vested on 2026-08-15"]);
    expect(vested(ok(cancel))).not.toBe(vested(ok(cancel, terminated)));
  });
  it("explains a round on a company with no shares", () => {
    const empty = { ...company(), securities: [], plans: [] };
    expect(
      errors({ kind: "round_scenario", preMoney: "10000000", investment: "2000000" }, empty),
    ).toEqual(["This company has no shares on its cap table yet."]);
  });
});

describe("rules shared with the equity mutations", () => {
  const share = company().securities[0]!;
  it("checks recorded security values in the mutation's order", () => {
    expect(securityValuesError(share, " ")).toBe("Enter a reason for the recorded change.");
    expect(securityValuesError({ ...share, outstanding: "9000000" }, "x")).toBe(
      "Outstanding cannot exceed issued, and vested cannot exceed outstanding.",
    );
    expect(securityValuesError({ ...share, issuedOn: "" }, "x")).toBe("Enter a valid issue date.");
    expect(securityValuesError({ ...share, balanceAsOf: "2023-12-31" }, "x")).toBe(
      "Balance date must be on or after the issue date.",
    );
    expect(securityValuesError(share, "x")).toBeNull();
  });
  it("keeps class and plan totals in step with recorded securities", () => {
    const meta = company();
    expect(applySecurityToMetadata(meta, { ...share, key: "cs-9", planName: "2024 Plan" })).toBe(
      "Record plan stock by exercising its option grant.",
    );
    expect(applySecurityToMetadata(meta, { ...share, kind: "option" }, share)).toBe(
      "Security type, class and plan are fixed after creation.",
    );
    expect(
      applySecurityToMetadata(meta, { ...share, issued: "13000000", outstanding: "13000000" }),
    ).toBe("This issuance exceeds the share class authorization.");
    const ok = company();
    expect(
      applySecurityToMetadata(ok, { ...share, issued: "1000", outstanding: "1000", capital: "5" }),
    ).toBeNull();
    expect(ok.classes[0]).toMatchObject({ reportedOutstanding: "8001000", capital: "85" });
    const option = company().securities[1]!;
    expect(applySecurityToMetadata(ok, { ...option, issued: "80000" }, option)).toBeNull();
    expect(ok.plans[0]!.available).toBe("1900000");
  });
  it("records an exercise the way the mutation always has", () => {
    const data = company();
    const option = data.securities[1]!;
    const result = applySecurityEvent(
      data,
      option,
      {
        event: "exercise",
        quantity: "25000",
        date: "2026-07-15",
        reason: "Paid",
        certificate: "CS-2",
      },
      "new",
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.before.outstanding).toBe("100000");
    expect(option).toMatchObject({
      outstanding: "75000",
      vested: "0",
      balanceAsOf: "2026-07-15",
      status: "Outstanding",
      fields: {
        "Exercised/Settled": "25000",
        "Dates of Exercise/Settlements": "25000 options exercised on 2026-07-15",
      },
    });
    expect(result.share).toMatchObject({
      key: "new",
      certificate: "CS-2",
      kind: "share",
      issued: "25000",
      vested: "25000",
      capital: "12500",
      fields: { Source: "Exercised from ES-1", "Exercise Date": "2026-07-15", Comments: "Paid" },
    });
    expect(data.classes[0]).toMatchObject({ reportedOutstanding: "8025000", capital: "12580" });
    expect(
      applySecurityEvent(
        data,
        option,
        { event: "cancel", quantity: "75000", date: "2026-07-16", reason: " " },
        "x",
      ),
    ).toEqual({ ok: false, error: "Enter the event date and reason." });
  });
  it("validates records with the same schemas as records.save", () => {
    expect(recordTitleSchema.safeParse("  ").success).toBe(false);
    expect(recordTitleSchema.safeParse("x".repeat(301)).success).toBe(false);
    expect(recordStatusSchema.safeParse("Pending").success).toBe(false);
  });
  it("merges stakeholder patches without dropping fields", () => {
    const sam = company().stakeholders[1]!;
    expect(mergeStakeholder(sam, { fields: { Title: null, Phone: "1" } })).toEqual({
      ...sam,
      fields: { Title: null, Phone: "1" },
    });
    expect(sam.fields).toEqual({ Title: "Employee" });
  });
  it("continues the most common certificate series", () => {
    const s = (certificate: string): Security => ({ ...base, certificate });
    expect(nextCertificate([s("OPT-009"), s("OPT-010"), s("X-1")], "option")).toBe("OPT-011");
    expect(nextCertificate([], "rsu")).toBe("RSU-1");
  });
});

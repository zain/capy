import { z } from "zod";
import {
  D,
  Decimal,
  formatNumber,
  isConvertible,
  percentage,
  stakeholderSchema,
  stakeholderShares,
  sum,
  totals,
} from "./index";
import type { EquityImport, Security, Stakeholder } from "./index";
import { canProjectVesting, modelRound, projectedVested } from "./modeling";

export type Totals = ReturnType<typeof totals>;
type Metadata = Pick<EquityImport, "asOf" | "classes" | "plans">;
const isoDate = (value: string) => z.iso.date().safeParse(value).success;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// Rules shared by the equity mutations and the change engine, so previews and edits cannot drift.

export const recordKindSchema = z.enum([
  "document",
  "approval",
  "offer",
  "communication",
  "fundraising",
  "vesting",
  "contact",
  "valuation",
  "template",
  "consent",
  "draft",
  "service",
  "liquidity",
]);
export const recordStatusSchema = z.enum(["Draft", "Recorded", "Archived"]);
export const recordTitleSchema = z.string().trim().min(1).max(300);
export const recordDataSchema = z.record(z.string().max(100), z.string().max(100000));

/** Checks a security's own values, before its holder and prior version are looked up. */
export function securityValuesError(s: Security, reason: string): string | null {
  if (!reason.trim()) return "Enter a reason for the recorded change.";
  if (D(s.outstanding).gt(s.issued) || D(s.vested).gt(s.outstanding))
    return "Outstanding cannot exceed issued, and vested cannot exceed outstanding.";
  if (!isoDate(s.issuedOn)) return "Enter a valid issue date.";
  if (s.balanceAsOf && (!isoDate(s.balanceAsOf) || s.balanceAsOf < s.issuedOn))
    return "Balance date must be on or after the issue date.";
  return null;
}

/** Records a new or edited security against its class and plan totals. Mutates `meta`. */
export function applySecurityToMetadata(
  meta: Pick<EquityImport, "classes" | "plans">,
  s: Security,
  old?: Security,
): string | null {
  if (old && (old.kind !== s.kind || old.planName !== s.planName || old.className !== s.className))
    return "Security type, class and plan are fixed after creation.";
  const shareClass = meta.classes.find((c) => c.name === s.className);
  if (!isConvertible(s) && !shareClass) return "Select an existing share class.";
  if (s.planName && !old && s.kind === "share")
    return "Record plan stock by exercising its option grant.";
  if (s.planName && s.kind !== "share") {
    const plan = meta.plans.find((p) => p.name === s.planName);
    if (!plan || plan.className !== s.className) return "Select a plan for this share class.";
    const available = D(plan.available).minus(D(s.issued).minus(old?.issued || 0));
    if (available.lt(0) || available.gt(plan.authorized))
      return "The plan does not have enough available shares for this change.";
    plan.available = available.toFixed();
  }
  if (s.kind === "share" && shareClass) {
    if (shareClass.capital !== null)
      shareClass.capital = D(shareClass.capital)
        .plus(D(s.capital).minus(old?.capital || 0))
        .toFixed();
    if (shareClass.reportedOutstanding !== null)
      shareClass.reportedOutstanding = D(shareClass.reportedOutstanding)
        .plus(D(s.outstanding).minus(old?.outstanding || 0))
        .toFixed();
    if (
      shareClass.authorized !== null &&
      shareClass.reportedOutstanding !== null &&
      D(shareClass.reportedOutstanding).gt(shareClass.authorized)
    )
      return "This issuance exceeds the share class authorization.";
  }
  return null;
}

export type SecurityEvent = {
  event: "cancel" | "exercise";
  quantity: string;
  date: string;
  reason: string;
  certificate?: string;
  /** The holder, whose termination date stops vesting when the security has none. */
  holder?: Pick<Stakeholder, "fields"> | null;
};
/**
 * Applies an exercise or cancellation, mutating `s` and the class and plan totals in `meta`.
 * An exercise returns the new stock security, keyed `createdKey`.
 */
export function applySecurityEvent(
  meta: Metadata,
  s: Security,
  e: SecurityEvent,
  createdKey: string,
): { ok: false; error: string } | { ok: true; before: Security; share: Security | null } {
  const fail = (error: string) => ({ ok: false as const, error });
  const qty = D(e.quantity);
  if (qty.lte(0) || qty.gt(s.outstanding))
    return fail("Enter a positive quantity no greater than the outstanding balance.");
  if (!isoDate(e.date) || !e.reason.trim()) return fail("Enter the event date and reason.");
  if (e.date < (s.balanceAsOf || meta.asOf) || (s.issuedOn && e.date < s.issuedOn))
    return fail(
      "Record events on or after the imported snapshot and issue date. Use Edit to correct historical data.",
    );
  const before = { ...s, fields: { ...s.fields } };
  const vestedAtEvent = projectedVested(s, meta.asOf, e.date, e.holder);
  if (vestedAtEvent !== null) s.vested = vestedAtEvent;
  const plan = meta.plans.find((p) => p.name === s.planName),
    cls = meta.classes.find((c) => c.name === s.className);
  let share: Security | null = null;
  if (e.event === "exercise") {
    if (s.kind !== "option") return fail("Only options can be exercised here.");
    if (!e.certificate?.trim() || !cls || s.price === null)
      return fail(
        "Enter a certificate label and ensure the option has an exercise price and share class.",
      );
    if (s.fields["Early Exercise"] !== "Yes" && (s.vested === null || qty.gt(s.vested)))
      return fail("Exercise exceeds the vested balance. Confirm vesting first.");
    if (
      cls.authorized !== null &&
      cls.reportedOutstanding !== null &&
      D(cls.reportedOutstanding).plus(qty).gt(cls.authorized)
    )
      return fail("This exercise would exceed the share class authorization.");
    const paid = qty.mul(s.price).toFixed();
    share = {
      ...s,
      key: createdKey,
      certificate: e.certificate,
      kind: "share",
      issued: qty.toFixed(),
      outstanding: qty.toFixed(),
      vested: s.vested === null ? null : Decimal.min(s.vested, qty).toFixed(),
      capital: paid,
      issuedOn: e.date,
      balanceAsOf: e.date,
      status: "Outstanding",
      sourceSheet: "Recorded in Capy",
      sourceRow: 0,
      fields: {
        Source: `Exercised from ${s.certificate}`,
        "Exercise Date": e.date,
        Comments: e.reason,
      },
    };
    s.fields["Exercised/Settled"] = D(s.fields["Exercised/Settled"]).plus(qty).toFixed();
    s.fields["Dates of Exercise/Settlements"] = [
      s.fields["Dates of Exercise/Settlements"],
      `${qty.toFixed()} options exercised on ${e.date}`,
    ]
      .filter(Boolean)
      .join("; ");
    if (s.vested !== null) s.vested = Decimal.max(0, D(s.vested).minus(qty)).toFixed();
    if (cls.capital !== null) cls.capital = D(cls.capital).plus(paid).toFixed();
    if (cls.reportedOutstanding !== null)
      cls.reportedOutstanding = D(cls.reportedOutstanding).plus(qty).toFixed();
  } else {
    const field = s.kind === "share" ? "Shares Cancelled" : "Amount Cancelled";
    s.fields[field] = D(s.fields[field]).plus(qty).toFixed();
    s.fields["Cancellation Date"] = e.date;
    s.fields["Cancellation Reason"] = e.reason;
    if (plan && s.kind !== "share") plan.available = D(plan.available).plus(qty).toFixed();
    if (cls && s.kind === "share" && cls.reportedOutstanding !== null)
      cls.reportedOutstanding = D(cls.reportedOutstanding).minus(qty).toFixed();
    if (s.vested !== null) s.vested = Decimal.min(s.vested, D(s.outstanding).minus(qty)).toFixed();
  }
  s.outstanding = D(s.outstanding).minus(qty).toFixed();
  s.balanceAsOf = e.date;
  if (D(s.outstanding).eq(0)) s.status = e.event === "exercise" ? "Exercised" : "Cancelled";
  return { ok: true, before, share };
}

/** A partial stakeholder update. Fields merge into the existing ones; a null field value clears it. */
export function mergeStakeholder(
  prior: Stakeholder | undefined,
  patch: {
    name?: string;
    email?: string;
    relationship?: string;
    fields?: Record<string, string | null>;
  },
): Stakeholder {
  const base: Stakeholder = prior ?? {
    key: "",
    name: "",
    relationship: "",
    email: "",
    entityType: "",
    externalId: "",
  };
  const merged: Stakeholder = { ...base, fields: base.fields ? { ...base.fields } : undefined };
  if (patch.name !== undefined) merged.name = patch.name;
  if (patch.email !== undefined) merged.email = patch.email;
  if (patch.relationship !== undefined) merged.relationship = patch.relationship;
  if (patch.fields && Object.keys(patch.fields).length)
    merged.fields = { ...merged.fields, ...patch.fields };
  if (!merged.fields) delete merged.fields;
  return merged;
}

// The change engine: validates a drafted change and computes its preview and apply step.

const amount = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).replace(/[,\s]/g, "").replace(/^\$/, ""))
  .pipe(
    z
      .string()
      .regex(/^\d+(\.\d+)?$/, "Enter a plain number of zero or more, such as 1000 or 0.25."),
  )
  .transform((value) => D(value).toFixed());
const date = z.iso.date();
const label = z.string().trim().min(1).max(100);
export const changeKinds = [
  "option_grant",
  "exercise",
  "cancellation",
  "stakeholder_update",
  "board_consent",
  "round_scenario",
] as const;
export const changeInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("option_grant"),
    stakeholderKey: z.string().min(1),
    planName: z.string().min(1),
    shares: amount,
    exercisePrice: amount,
    grantType: z.enum(["ISO", "NSO", "RSU"]).optional(),
    issuedOn: date,
    vestingStart: date.optional(),
    vestingSchedule: z.string().trim().max(200).optional(),
    certificate: label.optional(),
    expirationDate: date.optional(),
    earlyExercise: z.boolean().optional(),
    boardApprovalDate: date.optional(),
  }),
  z.strictObject({
    kind: z.literal("exercise"),
    securityKey: z.string().min(1),
    shares: amount,
    date,
    certificate: label,
  }),
  z.strictObject({
    kind: z.literal("cancellation"),
    securityKey: z.string().min(1),
    shares: amount,
    date,
  }),
  z.strictObject({
    kind: z.literal("stakeholder_update"),
    stakeholderKey: z.string().min(1).optional(),
    patch: z.strictObject({
      name: z.string().trim().min(1).max(300).optional(),
      email: z.string().trim().max(300).optional(),
      relationship: z.string().trim().max(100).optional(),
      // Convex only stores plain ASCII field names that don't start with $.
      fields: z
        .record(z.string().max(200), z.string().max(20000).nullable())
        .refine(
          (fields) => Object.keys(fields).every((k) => /^(?!\$)[\x20-\x7e]+$/.test(k)),
          "Field names use plain ASCII characters and can’t start with $.",
        )
        .optional(),
    }),
  }),
  z.strictObject({
    kind: z.literal("board_consent"),
    title: z.string().trim().min(1).max(300),
    effectiveDate: date.optional(),
    boardMembers: z.string().trim().max(2000).optional(),
    text: z.string().trim().min(1).max(100000),
  }),
  z.strictObject({
    kind: z.literal("round_scenario"),
    preMoney: amount,
    investment: amount,
    title: z.string().trim().min(1).max(300).optional(),
  }),
]);
export type ChangeInput = z.output<typeof changeInputSchema>;
export type ChangeKind = ChangeInput["kind"];
const perShare = (value: string | null) => {
  const d = D(value);
  return `$${d.toFixed(Math.max(2, d.decimalPlaces()))}`;
};
/** How a preview value reads: a share count, US dollars, a price per share, or plain text. */
export type PreviewUnit = "shares" | "usd" | "price" | "text";
/** One labeled value the change sets. `before` is absent when the change adds something new. */
export type PreviewValue = { label: string; before?: string; after: string; unit: PreviewUnit };
export type ChangePreview = {
  title: string;
  summary: string;
  /** Labels are built from names, so they are kept as data, never as object keys. */
  values: PreviewValue[];
  totalsBefore: Totals;
  totalsAfter: Totals;
  /** Percent of fully diluted shares for the stakeholders the change affects. */
  ownership?: { name: string; before: string; after: string }[];
  warnings: string[];
};
/** What applying the change does, as arguments for the matching mutation helper. */
export type ChangeApply =
  | { action: "saveSecurity"; data: Security; reason: string }
  | {
      action: "securityEvent";
      securityKey: string;
      event: "exercise" | "cancel";
      quantity: string;
      date: string;
      reason: string;
      certificate?: string;
    }
  | { action: "saveStakeholder"; stakeholderKey?: string; data: Stakeholder }
  | {
      action: "saveRecord";
      kind: "approval" | "fundraising";
      title: string;
      status: "Draft";
      data: Record<string, string>;
    };
/** The existing row a change edits. Its revision at draft time detects later edits. */
export type ChangeTarget = { type: "security" | "stakeholder"; key: string };
export type PreparedChange =
  | {
      ok: true;
      input: ChangeInput;
      preview: ChangePreview;
      apply: ChangeApply;
      target?: ChangeTarget;
    }
  | { ok: false; errors: string[] };
type Options = { today?: string };
type CapTable = Pick<EquityImport, "stakeholders" | "securities" | "plans" | "classes">;

const fail = (...errors: string[]) => ({ ok: false as const, errors });
const issues = (error: z.ZodError) =>
  error.issues.slice(0, 10).map((i) => (i.path.length ? `${i.path.join(".")}: ` : "") + i.message);

/** Validates a drafted change against the current cap table and computes what applying it would do. */
export function prepareChange(
  data: EquityImport,
  raw: unknown,
  options: Options = {},
): PreparedChange {
  const kind = (raw as { kind?: unknown } | null)?.kind;
  if (!changeKinds.includes(kind as ChangeKind))
    return fail(`kind: Choose one of ${changeKinds.join(", ")}.`);
  const parsed = changeInputSchema.safeParse(raw);
  if (!parsed.success) return fail(...issues(parsed.error));
  const input = parsed.data;
  switch (input.kind) {
    case "option_grant":
      return optionGrant(data, input, options);
    case "exercise":
    case "cancellation":
      return securityEvent(data, input, options);
    case "stakeholder_update":
      return stakeholderUpdate(data, input);
    case "board_consent":
      return boardConsent(data, input);
    case "round_scenario":
      return roundScenario(data, input, options);
  }
}

function ownership(before: CapTable, after: CapTable, people: Stakeholder[]) {
  const fdBefore = totals(before).fullyDiluted,
    fdAfter = totals(after).fullyDiluted;
  return people.map((p) => ({
    name: p.name,
    before: percentage(stakeholderShares(before.securities, p.key), fdBefore),
    after: percentage(stakeholderShares(after.securities, p.key), fdAfter),
  }));
}
function awardLabel(grantType: string | undefined) {
  return grantType === "RSU" ? "RSUs" : grantType ? `${grantType} options` : "options";
}
function trailingNumber(label: string): [string, string, string] | null {
  let i = label.length;
  while (i > 0 && label.charCodeAt(i - 1) >= 48 && label.charCodeAt(i - 1) <= 57) i--;
  return i < label.length ? [label, label.slice(0, i), label.slice(i)] : null;
}
function looksLikeEmail(value: string) {
  const [local, domain, ...rest] = value.split("@");
  return (
    !rest.length && !!local && !!domain && !/\s/.test(value) && domain.slice(1, -1).includes(".")
  );
}
/** The next unused label in the most common numbered series for this kind, such as ES-42. */
export function nextCertificate(securities: Security[], kind: Security["kind"]) {
  const series = new Map<string, { count: number; highest: number; width: number }>();
  for (const s of securities) {
    const match = s.kind === kind ? trailingNumber(s.certificate) : null;
    if (!match) continue;
    const item = series.get(match[1]!) ?? { count: 0, highest: 0, width: 0 };
    item.count++;
    if (Number(match[2]) >= item.highest) {
      item.highest = Number(match[2]);
      item.width = match[2]!.length;
    }
    series.set(match[1]!, item);
  }
  const [prefix, best] = [...series].sort((a, b) => b[1].count - a[1].count)[0] ?? [
    kind === "rsu" ? "RSU-" : "ES-",
    { count: 0, highest: 0, width: 1 },
  ];
  const used = new Set(securities.map((s) => s.certificate));
  let n = best.highest + 1;
  while (used.has(prefix + String(n).padStart(best.width, "0"))) n++;
  return prefix + String(n).padStart(best.width, "0");
}
function scheduleWarning(s: Security) {
  if (!s.vestingSchedule)
    return "No vesting schedule was given, so Capy shows the grant as unvested until one is added.";
  if (!canProjectVesting(s))
    return `Capy can’t project the vesting schedule "${s.vestingSchedule}", so vested amounts won’t update automatically. Supported schedules look like "1/48 monthly, 25% vest at 12 month cliff".`;
  return null;
}

function optionGrant(
  data: EquityImport,
  input: Extract<ChangeInput, { kind: "option_grant" }>,
  { today }: Options,
): PreparedChange {
  const holder = data.stakeholders.find((p) => p.key === input.stakeholderKey);
  const plan = data.plans.find((p) => p.name === input.planName);
  const errors: string[] = [];
  if (!holder)
    errors.push(
      "stakeholderKey: No stakeholder with that key. Use find_stakeholders, or draft a stakeholder_update to add them first.",
    );
  if (!plan)
    errors.push(
      data.plans.length
        ? `planName: Choose one of ${data.plans.map((p) => `"${p.name}"`).join(", ")}.`
        : "planName: This company has no equity plan.",
    );
  if (D(input.shares).lte(0)) errors.push("shares: Enter a positive number of shares.");
  if (input.expirationDate && input.expirationDate <= input.issuedOn)
    errors.push("expirationDate: The expiration date must be after the grant date.");
  if (input.earlyExercise && input.grantType === "RSU")
    errors.push("earlyExercise: RSUs can’t be early exercised.");
  if (!holder || !plan || errors.length) return fail(...errors);
  const kind = input.grantType === "RSU" ? "rsu" : "option";
  const vestingSchedule = input.vestingSchedule ?? "";
  const fields: Record<string, string> = {};
  if (input.grantType && input.grantType !== "RSU") fields["Grant Type"] = input.grantType;
  if (input.earlyExercise !== undefined)
    fields["Early Exercise"] = input.earlyExercise ? "Yes" : "No";
  if (input.expirationDate) fields["Expiration Date"] = input.expirationDate;
  if (input.boardApprovalDate) fields["Board Approval Date"] = input.boardApprovalDate;
  const s: Security = {
    key: "",
    certificate: input.certificate ?? nextCertificate(data.securities, kind),
    stakeholderKey: holder.key,
    kind,
    className: plan.className,
    planName: plan.name,
    issued: input.shares,
    outstanding: input.shares,
    price: input.exercisePrice,
    capital: "0",
    vested: "0",
    balanceAsOf: input.issuedOn,
    issuedOn: input.issuedOn,
    vestingStart: input.vestingStart ?? (vestingSchedule ? input.issuedOn : ""),
    vestingSchedule,
    status: "Outstanding",
    sourceSheet: "Recorded in Capy",
    sourceRow: 0,
    fields,
  };
  // A vesting start before the grant date means part of the grant is already vested.
  if (s.vestingStart && s.vestingStart < s.issuedOn)
    s.vested = projectedVested({ ...s, balanceAsOf: undefined }, s.vestingStart, s.issuedOn) ?? "0";
  const title = `Grant ${formatNumber(input.shares)} ${awardLabel(input.grantType)} to ${holder.name}`;
  const meta = clone({ classes: data.classes, plans: data.plans });
  const error = securityValuesError(s, title) ?? applySecurityToMetadata(meta, s);
  if (error) return fail(error);
  const after = { ...data, ...meta, securities: [...data.securities, s] };
  const planAfter = meta.plans.find((p) => p.name === plan.name)!;
  const warnings = [scheduleWarning(s)].filter((w): w is string => Boolean(w));
  if (data.securities.some((x) => x.certificate === s.certificate))
    warnings.push(`Certificate ${s.certificate} is already used by another security.`);
  if (plan.status?.toLowerCase() === "expired") warnings.push(`${plan.name} is marked expired.`);
  if (today && s.issuedOn > today) warnings.push("The grant date is in the future.");
  if (D(s.vested).gt(0))
    warnings.push(
      `${formatNumber(s.vested)} shares are already vested because vesting starts ${s.vestingStart}.`,
    );
  const price = input.grantType === "RSU" ? "" : ` at ${perShare(input.exercisePrice)} per share`;
  const vesting = vestingSchedule ? `, vesting ${vestingSchedule} from ${s.vestingStart}` : "";
  return {
    ok: true,
    input,
    preview: {
      title,
      summary: `${holder.name} receives ${formatNumber(s.issued)} ${awardLabel(input.grantType)} under ${plan.name}${price}, granted ${s.issuedOn}${vesting}. Certificate ${s.certificate}.`,
      values: [
        {
          label: `${plan.name} available`,
          before: plan.available,
          after: planAfter.available,
          unit: "shares",
        },
        {
          label: `${holder.name} fully diluted shares`,
          before: stakeholderShares(data.securities, holder.key),
          after: stakeholderShares(after.securities, holder.key),
          unit: "shares",
        },
      ],
      totalsBefore: totals(data),
      totalsAfter: totals(after),
      ownership: ownership(data, after, [holder]),
      warnings,
    },
    apply: { action: "saveSecurity", data: s, reason: title },
  };
}

function securityEvent(
  data: EquityImport,
  input: Extract<ChangeInput, { kind: "exercise" | "cancellation" }>,
  { today }: Options,
): PreparedChange {
  const original = data.securities.find((s) => s.key === input.securityKey);
  if (!original) return fail("Security not found.");
  const holder = data.stakeholders.find((p) => p.key === original.stakeholderKey);
  const holderName = holder?.name ?? "an unknown holder";
  const exercise = input.kind === "exercise";
  const title = exercise
    ? `Exercise ${formatNumber(input.shares)} options from ${original.certificate} for ${holderName}`
    : `Cancel ${formatNumber(input.shares)} of ${original.certificate} held by ${holderName}`;
  const meta = clone({ asOf: data.asOf, classes: data.classes, plans: data.plans });
  const s = clone(original);
  const certificate = input.kind === "exercise" ? input.certificate : undefined;
  const result = applySecurityEvent(
    meta,
    s,
    {
      event: exercise ? "exercise" : "cancel",
      quantity: input.shares,
      date: input.date,
      reason: title,
      certificate,
      holder,
    },
    "new-share",
  );
  if (!result.ok) return fail(result.error);
  const securities = data.securities.map((x) => (x.key === s.key ? s : x));
  if (result.share) securities.push(result.share);
  const after = { ...data, ...meta, securities };
  const vestedAtEvent = projectedVested(original, data.asOf, input.date, holder) ?? original.vested;
  const plan = data.plans.find((p) => p.name === original.planName),
    planAfter = meta.plans.find((p) => p.name === original.planName);
  const values: PreviewValue[] = [
    { label: "Outstanding", before: original.outstanding, after: s.outstanding, unit: "shares" },
    {
      label: `Vested on ${input.date}`,
      before: vestedAtEvent ?? "unknown",
      after: s.vested ?? "unknown",
      unit: "shares",
    },
    { label: "Status", before: original.status, after: s.status, unit: "text" },
  ];
  if (plan && planAfter && plan.available !== planAfter.available)
    values.push({
      label: `${plan.name} available`,
      before: plan.available,
      after: planAfter.available,
      unit: "shares",
    });
  const warnings: string[] = [];
  if (today && input.date > today) warnings.push("The event date is in the future.");
  const expiration = original.fields["Expiration Date"];
  if (exercise && expiration && input.date > expiration)
    warnings.push(`This option expired on ${expiration}.`);
  let summary: string;
  if (result.share) {
    values.push(
      { label: "New stock certificate", after: result.share.certificate, unit: "text" },
      { label: "Exercise payment", after: result.share.capital ?? "0", unit: "usd" },
    );
    if (data.securities.some((x) => x.certificate === result.share!.certificate))
      warnings.push(`Certificate ${result.share.certificate} is already used by another security.`);
    const unvested = D(input.shares).minus(vestedAtEvent ?? 0);
    if (unvested.gt(0))
      warnings.push(
        `${formatNumber(unvested.toFixed())} of these shares are unvested (early exercise). The holder has 30 days to file an 83(b) election.`,
      );
    summary = `${holderName} exercises ${formatNumber(input.shares)} options from ${original.certificate} on ${input.date} at ${perShare(original.price)} per share, paying $${formatNumber(result.share.capital)}. Capy records ${result.share.certificate} for ${formatNumber(input.shares)} ${original.className} shares.`;
  } else {
    const vestedCancelled = Decimal.min(
      input.shares,
      D(vestedAtEvent ?? 0).minus(s.vested ?? 0),
    ).toFixed();
    if (original.kind !== "share" && D(vestedCancelled).gt(0))
      warnings.push(`${formatNumber(vestedCancelled)} of the cancelled shares are vested.`);
    if (original.kind === "share" && original.planName)
      warnings.push("Cancelled plan stock does not return to the plan’s available shares.");
    summary = `Cancels ${formatNumber(input.shares)} of ${original.certificate} (${holderName}) on ${input.date}${plan && original.kind !== "share" ? `, returning them to ${plan.name}` : ""}.`;
  }
  return {
    ok: true,
    input,
    target: { type: "security", key: original.key },
    preview: {
      title,
      summary,
      values,
      totalsBefore: totals(data),
      totalsAfter: totals(after),
      ownership: holder ? ownership(data, after, [holder]) : undefined,
      warnings,
    },
    apply: {
      action: "securityEvent",
      securityKey: original.key,
      event: exercise ? "exercise" : "cancel",
      quantity: input.shares,
      date: input.date,
      reason: title,
      ...(certificate ? { certificate } : {}),
    },
  };
}

function stakeholderUpdate(
  data: EquityImport,
  input: Extract<ChangeInput, { kind: "stakeholder_update" }>,
): PreparedChange {
  const prior = input.stakeholderKey
    ? data.stakeholders.find((p) => p.key === input.stakeholderKey)
    : undefined;
  if (input.stakeholderKey && !prior) return fail("Stakeholder not found.");
  if (!prior && !input.patch.name) return fail("patch.name: Enter a name for the new stakeholder.");
  const merged = mergeStakeholder(prior, input.patch);
  const parsed = stakeholderSchema.safeParse(merged);
  if (!parsed.success) return fail(...issues(parsed.error));
  const labels: [string, string | null | undefined, string | null | undefined][] = [
    ["Name", prior?.name, merged.name],
    ["Email", prior?.email, merged.email],
    ["Relationship", prior?.relationship, merged.relationship],
    ...Object.keys(input.patch.fields ?? {}).map(
      (k) => [k, prior?.fields?.[k], merged.fields?.[k]] as [string, string | null, string | null],
    ),
  ];
  const changed = labels.filter(([, a, b]) => (a ?? "") !== (b ?? ""));
  if (prior && !changed.length) return fail("patch: This update doesn’t change anything.");
  const warnings: string[] = [];
  if (merged.email && !looksLikeEmail(merged.email))
    warnings.push(`"${merged.email}" doesn’t look like an email address.`);
  const name = merged.name.trim().toLocaleLowerCase("en-US");
  if (
    data.stakeholders.some(
      (p) => p.key !== prior?.key && p.name.trim().toLocaleLowerCase("en-US") === name,
    )
  )
    warnings.push(`Another stakeholder is already named ${merged.name}.`);
  const t = totals(data);
  const title = prior
    ? `Update ${prior.name}: ${changed.map(([k]) => k.toLowerCase()).join(", ")}`
    : `Add stakeholder ${merged.name}`;
  return {
    ok: true,
    input,
    ...(prior ? { target: { type: "stakeholder" as const, key: prior.key } } : {}),
    preview: {
      title,
      summary: prior
        ? `Updates ${changed.map(([k]) => k).join(", ")} for ${prior.name}. Holdings don’t change.`
        : `Adds ${merged.name} as a stakeholder with no holdings.`,
      values: changed.map(([label, a, b]) => ({
        label,
        ...(prior ? { before: a ?? "" } : {}),
        after: b ?? "",
        unit: "text" as const,
      })),
      totalsBefore: t,
      totalsAfter: t,
      warnings,
    },
    apply: {
      action: "saveStakeholder",
      ...(prior ? { stakeholderKey: prior.key } : {}),
      data: merged,
    },
  };
}

function boardConsent(
  data: EquityImport,
  input: Extract<ChangeInput, { kind: "board_consent" }>,
): PreparedChange {
  const values: Record<string, string> = {
    "Approval Type": "Board consent",
    "Effective Date": input.effectiveDate ?? "",
    "Board Members": input.boardMembers ?? "",
    Notes: input.text,
  };
  const t = totals(data);
  const warnings = ["Nothing on the cap table changes until the related changes are recorded."];
  if (!input.boardMembers) warnings.push("No board members are listed.");
  return {
    ok: true,
    input,
    preview: {
      title: `Draft board consent: ${input.title}`,
      summary: `Adds "${input.title}" to Board Approvals as a draft${input.effectiveDate ? `, effective ${input.effectiveDate}` : ""}.`,
      values: [
        { label: "Title", after: input.title, unit: "text" },
        { label: "Status", after: "Draft", unit: "text" },
        { label: "Effective Date", after: values["Effective Date"]!, unit: "text" },
        { label: "Board Members", after: values["Board Members"]!, unit: "text" },
      ],
      totalsBefore: t,
      totalsAfter: t,
      warnings,
    },
    apply: {
      action: "saveRecord",
      kind: "approval",
      title: input.title,
      status: "Draft",
      data: values,
    },
  };
}

function roundScenario(
  data: EquityImport,
  input: Extract<ChangeInput, { kind: "round_scenario" }>,
  { today }: Options,
): PreparedChange {
  let model: ReturnType<typeof modelRound>;
  try {
    model = modelRound(data, input.preMoney, input.investment);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
  const t = totals(data);
  const recordTitle = input.title ?? `Round model ${today ?? data.asOf}`;
  const rows = model.rows
    .filter((r) => D(r.before).gt(0) || D(r.afterRound).gt(0))
    .sort((a, b) => D(b.afterRound).cmp(a.afterRound));
  const top = rows.slice(0, 10);
  const investors = rows.find((r) => r.key === "new-investors");
  if (investors && !top.includes(investors)) top.push(investors);
  return {
    ok: true,
    input,
    preview: {
      title: `Save round scenario: $${formatNumber(input.preMoney)} pre-money, $${formatNumber(input.investment)} investment`,
      summary: `Saves "${recordTitle}" to Fundraising. At ${perShare(model.price)} per share, new investors get ${formatNumber(model.newShares, 0)} shares and converting SAFEs and notes get ${formatNumber(model.safeShares, 0)}.`,
      values: [
        { label: "Price per share", after: model.price, unit: "price" },
        { label: "New investor shares", after: model.newShares, unit: "shares" },
        { label: "SAFE and note conversion shares", after: model.safeShares, unit: "shares" },
        {
          label: "Fully diluted shares",
          before: model.before,
          after: model.afterRound,
          unit: "shares",
        },
        {
          label: "Post-money valuation",
          after: sum([input.preMoney, input.investment]),
          unit: "usd",
        },
      ],
      totalsBefore: t,
      totalsAfter: t,
      ownership: top.map((r) => ({ name: r.name, before: r.beforePercent, after: r.roundPercent })),
      warnings: [
        "Saving a scenario does not change the cap table.",
        "The model does not include a pool increase, pro rata rights, MFN terms or liquidation preferences.",
      ],
    },
    apply: {
      action: "saveRecord",
      kind: "fundraising",
      title: recordTitle,
      status: "Draft",
      data: { "Pre-money Valuation": input.preMoney, Investment: input.investment },
    },
  };
}

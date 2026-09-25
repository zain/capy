import { D, Decimal, formatNumber as n, isConvertible, percentage, sum } from "./index";
import type { EquityImport, Security } from "./index";
import { canProjectVesting } from "./modeling";
import { stakeholderHoldings } from "./ownership";
import { addDays, addMonths, isIsoDate, postTerminationDeadline } from "./vesting";

/** SAFEs and notes are USD principal, not shares. */
const usd = (value: string) => "$" + n(value);

export type HealthItem = {
  label: string;
  kind: "stakeholder" | "security" | "record" | "plan" | "class" | "company";
  key?: string;
};
export type HealthIssue = {
  severity: "critical" | "warning" | "info";
  code: string;
  title: string;
  detail: string;
  count: number;
  items: HealthItem[];
  /** The data cannot answer this check (enrichment-only fields are absent); not the same as "none found". */
  unknown?: boolean;
};
export type HealthRecord = {
  _id?: string;
  kind: string;
  title: string;
  status: string;
  data: Record<string, unknown>;
};
const severities = ["critical", "warning", "info"] as const;
const profileFields = ["Legal Name", "State of Incorporation", "Address", "Incorporation Date"];
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
function amount(value: unknown) {
  const cleaned = text(value).replace(/,/g, "");
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(cleaned)) return D(0);
  return D(cleaned);
}
const certificates = (r: HealthRecord) =>
  text(r.data.certificates)
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

export function healthCheck({
  data,
  records,
  now,
  billing,
  profile,
}: {
  data: EquityImport;
  records: HealthRecord[];
  now: number | string;
  billing?: { canEdit: boolean };
  profile?: Record<string, string>;
}): HealthIssue[] {
  const today =
    typeof now === "number" ? new Date(now).toISOString().slice(0, 10) : now.slice(0, 10);
  const soon = addDays(today, 30);
  const issues: HealthIssue[] = [];
  const add = (
    severity: HealthIssue["severity"],
    code: string,
    title: string,
    detail: string,
    items: HealthItem[],
    extra: { count?: number; unknown?: boolean } = {},
  ) => {
    const count = extra.count ?? items.length;
    if (!count) return;
    issues.push({
      severity,
      code,
      title,
      detail,
      count,
      items: items.slice(0, 25),
      ...(extra.unknown ? { unknown: true } : {}),
    });
  };
  const people = new Map(data.stakeholders.map((p) => [p.key, p]));
  const holderName = (s: Security) => people.get(s.stakeholderKey)?.name || "Unknown holder";
  const securityItem = (s: Security, note = ""): HealthItem => ({
    label: `${s.certificate} · ${holderName(s)}${note ? ` · ${note}` : ""}`,
    kind: "security",
    key: s.key,
  });
  const recordItem = (r: HealthRecord, note = ""): HealthItem => ({
    label: r.title + (note ? ` · ${note}` : ""),
    kind: "record",
    ...(r._id ? { key: r._id } : {}),
  });
  const live = data.securities.filter((s) => D(s.outstanding).gt(0));
  const options = live.filter((s) => s.kind === "option");

  if (billing && !billing.canEdit)
    add(
      "warning",
      "read_only",
      "Account is read-only",
      "Editing has ended for this company's account owner. Viewing and exports still work; recording or applying changes needs an active plan in Billing.",
      [{ label: "Billing", kind: "company" }],
    );

  // Data invariants.
  add(
    "critical",
    "outstanding_exceeds_issued",
    "Outstanding exceeds issued",
    "These securities show more outstanding than issued. Correct the balances.",
    data.securities
      .filter((s) => D(s.outstanding).gt(s.issued))
      .map((s) => securityItem(s, `${n(s.outstanding)} outstanding of ${n(s.issued)} issued`)),
  );
  add(
    "critical",
    "vested_exceeds_outstanding",
    "Vested exceeds outstanding",
    "These securities show more vested than outstanding. Correct the vested balances.",
    data.securities
      .filter((s) => s.vested !== null && D(s.vested).gt(s.outstanding))
      .map((s) => securityItem(s, `${n(s.vested)} vested of ${n(s.outstanding)} outstanding`)),
  );
  add(
    "critical",
    "holder_missing",
    "Securities without a holder",
    "These securities point to a stakeholder that is not on the cap table.",
    data.securities
      .filter((s) => !people.has(s.stakeholderKey))
      .map((s) => ({
        label: `${s.certificate} · missing holder ${s.stakeholderKey || "(blank)"}`,
        kind: "security" as const,
        key: s.key,
      })),
  );
  const classShares = new Map(
    data.classes.map((c) => [
      c.name,
      sum(
        data.securities
          .filter((s) => s.kind === "share" && s.className === c.name)
          .map((s) => s.outstanding),
      ),
    ]),
  );
  add(
    "critical",
    "class_outstanding_mismatch",
    "Share class totals do not match",
    "The share rows in these classes do not add up to the class's reported outstanding shares.",
    data.classes
      .filter(
        (c) =>
          c.reportedOutstanding !== null && !D(classShares.get(c.name)).eq(c.reportedOutstanding),
      )
      .map((c) => ({
        label: `${c.name}: ${n(classShares.get(c.name))} on securities, ${n(c.reportedOutstanding)} reported`,
        kind: "class" as const,
        key: c.name,
      })),
  );
  add(
    "critical",
    "authorized_exceeded",
    "Authorization exceeded",
    "Issued shares exceed a class's authorized shares, or a plan's available shares fall outside its reserve.",
    [
      ...data.classes.flatMap((c) => {
        if (c.authorized === null) return [];
        const outstanding = Decimal.max(classShares.get(c.name)!, c.reportedOutstanding ?? 0);
        return outstanding.gt(c.authorized)
          ? [
              {
                label: `${c.name}: ${n(outstanding.toFixed())} outstanding, ${n(c.authorized)} authorized`,
                kind: "class" as const,
                key: c.name,
              },
            ]
          : [];
      }),
      ...data.plans
        .filter((p) => D(p.available).gt(p.authorized) || D(p.available).lt(0))
        .map((p) => ({
          label: `${p.name}: ${n(p.available)} available, ${n(p.authorized)} authorized`,
          kind: "plan" as const,
          key: p.name,
        })),
    ],
  );
  const labels = new Map<string, Security[]>();
  for (const s of data.securities.filter((s) => s.kind !== "rsa")) {
    const id = `${s.className}:${s.certificate}`;
    const list = labels.get(id);
    if (list) list.push(s);
    else labels.set(id, [s]);
  }
  const duplicates = [...labels.values()].filter((list) => list.length > 1);
  add(
    "warning",
    "duplicate_certificates",
    "Duplicate certificate labels",
    "More than one security in the same class uses these certificate labels. Refer to them by security key.",
    duplicates.map((list) => ({
      label: `${list[0]!.certificate}${list[0]!.className ? ` (${list[0]!.className})` : ""} × ${list.length}`,
      kind: "security" as const,
      key: list[0]!.key,
    })),
  );

  // Options past expiration or their post-termination exercise window.
  const expired = options.filter(
    (s) => isIsoDate(s.fields["Expiration Date"]) && s.fields["Expiration Date"]! < today,
  );
  add(
    "warning",
    "options_expired",
    "Expired options still outstanding",
    "These options are past their expiration date but still count as outstanding. Cancel them to return the shares to the pool.",
    expired.map((s) => securityItem(s, `expired ${s.fields["Expiration Date"]}`)),
  );
  const windows = options
    .filter((s) => !expired.includes(s))
    .map((s) => ({ s, ...postTerminationDeadline(s, people.get(s.stakeholderKey)) }))
    .filter((w): w is typeof w & { deadline: string } => w.deadline !== null);
  add(
    "warning",
    "exercise_window_expired",
    "Post-termination exercise windows have closed",
    "These former holders' options are past their post-termination exercise deadline but still outstanding. Cancel them to return the shares to the pool.",
    windows
      .filter((w) => w.deadline < today)
      .map((w) => securityItem(w.s, `deadline ${w.deadline} (${w.basis})`)),
  );
  add(
    "warning",
    "exercise_window_ending",
    "Post-termination exercise windows closing within 30 days",
    "These former holders must exercise soon or their options lapse.",
    windows
      .filter((w) => w.deadline >= today && w.deadline <= soon)
      .map((w) => securityItem(w.s, `exercise by ${w.deadline} (${w.basis})`)),
  );

  // Pool.
  add(
    "warning",
    "pool_low",
    "Option pool running low",
    "Less than 10% of these plans' reserves is available for new grants.",
    data.plans
      .filter((p) => D(p.authorized).gt(0) && D(p.available).div(p.authorized).lt(0.1))
      .map((p) => ({
        label: `${p.name}: ${n(p.available)} of ${n(p.authorized)} available (${percentage(p.available, p.authorized, 2)}%)`,
        kind: "plan" as const,
        key: p.name,
      })),
  );
  add(
    "warning",
    "plan_expired",
    "Expired plan with available shares",
    "These plans have expired but their unallocated shares still count toward fully diluted. Retire the remaining reserve or extend the plan.",
    data.plans
      .filter((p) => {
        if (!D(p.available).gt(0)) return false;
        if (/expired/i.test(p.status || "")) return true;
        const years = Number(p.termYears);
        return (
          isIsoDate(p.boardApproval) &&
          years > 0 &&
          addMonths(p.boardApproval, Math.round(years * 12)) <= today
        );
      })
      .map((p) => ({
        label: `${p.name}: ${n(p.available)} available`,
        kind: "plan" as const,
        key: p.name,
      })),
  );

  // Treasury-like holders.
  const holdings = stakeholderHoldings(data);
  add(
    "warning",
    "treasury_in_fully_diluted",
    "Treasury shares may be counted as outstanding",
    "These holders look like company treasury accounts. Their shares count toward outstanding and fully diluted totals; cancel or repurchase them if the company holds them.",
    data.stakeholders
      .filter((p) => /treasury/i.test(p.name) && D(holdings.get(p.key)).gt(0))
      .map((p) => ({
        label: `${p.name} · ${n(holdings.get(p.key))} shares`,
        kind: "stakeholder" as const,
        key: p.key,
      })),
  );

  // Stakeholder contact details.
  const holders = new Set(live.map((s) => s.stakeholderKey));
  add(
    "warning",
    "missing_emails",
    "Holders without an email",
    "Add emails so these holders can be reached and invited to view their holdings.",
    data.stakeholders
      .filter((p) => holders.has(p.key) && !p.email)
      .map((p) => ({ label: p.name, kind: "stakeholder" as const, key: p.key })),
  );

  // Vesting.
  add(
    "warning",
    "vesting_unprojectable",
    "Vesting schedules Capy cannot project",
    "These securities' vested balances are known as of the snapshot, but future vesting needs their individual vesting events.",
    live
      .filter(
        (s) => !isConvertible(s) && s.kind !== "rsa" && s.vestingSchedule && !canProjectVesting(s),
      )
      .map((s) => securityItem(s, s.vestingSchedule)),
  );

  // Grant acceptance: only a Pulley API import records it.
  const acceptable = live.filter((s) => !isConvertible(s) && s.kind !== "rsa");
  const acceptanceKnown = (s: Security) =>
    Boolean(s.fields["Pulley ID"]) || Boolean(s.fields["Acceptance Status"]);
  add(
    "warning",
    "grants_pending_acceptance",
    "Grants pending acceptance",
    "These holders have not accepted their grants or certificates.",
    acceptable
      .filter((s) => acceptanceKnown(s) && s.fields["Acceptance Status"] === "Pending")
      .map((s) => securityItem(s)),
  );
  const acceptanceUnknown = acceptable.filter((s) => !acceptanceKnown(s));
  add(
    "info",
    "grants_acceptance_unknown",
    "Grant acceptance status unknown",
    "Acceptance status comes only from a Pulley API import. For these securities Capy cannot tell whether the holder accepted; this is not the same as none pending.",
    [],
    { count: acceptanceUnknown.length, unknown: true },
  );

  // 83(b) elections.
  const electionDocuments = new Set(
    records
      .filter((r) => r.kind === "document" && text(r.data.category) === "83(b) Elections")
      .flatMap(certificates),
  );
  const restricted = (s: Security) => {
    if (s.kind !== "share") return false;
    if (
      amount(s.fields["Shares Unvested"]).gt(0) ||
      amount(s.fields["Shares Subject to Repurchase (Unvested)"]).gt(0) ||
      (s.vested !== null && D(s.vested).lt(s.outstanding))
    )
      return true;
    if (
      data.securities.some(
        (r) =>
          r.kind === "rsa" &&
          r.stakeholderKey === s.stakeholderKey &&
          r.className === s.className &&
          r.certificate === s.certificate &&
          D(r.outstanding).eq(s.outstanding),
      )
    )
      return true;
    const source = text(s.fields.Source).match(/^Exercised from (.+)$/)?.[1];
    const option =
      source &&
      data.securities.find(
        (o) =>
          o.kind === "option" && o.certificate === source && o.stakeholderKey === s.stakeholderKey,
      );
    return Boolean(
      option &&
      (option.fields["Early Exercise"] === "Yes" ||
        amount(option.fields["Unvested Exercised"]).gt(0)),
    );
  };
  const unfiled = live.filter(
    (s) =>
      restricted(s) &&
      s.fields["83(b) Election"] !== "Filed" &&
      !electionDocuments.has(s.certificate),
  );
  // Pulley-enriched rows carry the filing flag; stock recorded in Capy has only Capy's documents.
  const electionKnown = (s: Security) =>
    Boolean(s.fields["Pulley ID"]) || s.sourceSheet === "Recorded in Capy";
  add(
    "warning",
    "possible_missing_83b",
    "Possible missing 83(b) elections",
    "These unvested or early-exercised shares have no 83(b) election on file. Elections must be filed within 30 days of issuance; upload filed elections to the Data Room under 83(b) Elections.",
    unfiled
      .filter(electionKnown)
      .map((s) => securityItem(s, s.issuedOn ? `issued ${s.issuedOn}` : "")),
  );
  const electionUnknown = unfiled.filter((s) => !electionKnown(s));
  add(
    "info",
    "83b_status_unknown",
    "83(b) status unknown",
    "These unvested or early-exercised shares have no 83(b) document in Capy, and the import did not include filing status. Capy cannot tell whether an election was filed.",
    electionUnknown.map((s) => securityItem(s)),
    { unknown: true },
  );

  // Approvals and consents.
  add(
    "warning",
    "unsigned_approvals",
    "Board approvals or consents not finalized",
    "These approvals or consents are still drafts or awaiting signatures.",
    records
      .filter((r) => (r.kind === "approval" || r.kind === "consent") && r.status === "Draft")
      .map((r) =>
        recordItem(
          r,
          /awaiting signature/i.test(text(r.data.Notes)) ? "awaiting signatures" : "draft",
        ),
      ),
  );
  add(
    "info",
    "draft_offers",
    "Draft offers",
    "These offer letters are still drafts.",
    records.filter((r) => r.kind === "offer" && r.status === "Draft").map((r) => recordItem(r)),
  );

  // Convertibles.
  const convertibles = live.filter(isConvertible);
  add(
    "info",
    "convertibles_outstanding",
    "Outstanding convertibles",
    `${convertibles.length} SAFEs or notes with ${usd(sum(convertibles.map((s) => s.outstanding)))} outstanding principal are not included in fully diluted shares until they convert.`,
    convertibles.map((s) => securityItem(s, `${usd(s.outstanding)} principal`)),
  );
  add(
    "warning",
    "notes_past_maturity",
    "Convertible notes past maturity",
    "These notes are past their maturity date and still outstanding. Convert, repay or extend them.",
    convertibles
      .filter(
        (s) =>
          s.kind === "note" &&
          isIsoDate(s.fields["Maturity Date"]) &&
          s.fields["Maturity Date"]! < today,
      )
      .map((s) => securityItem(s, `matured ${s.fields["Maturity Date"]}`)),
  );

  // 409A valuations.
  const valuations = records
    .filter((r) => r.kind === "valuation" && r.status !== "Archived")
    .sort((a, b) => text(b.data["Valuation Date"]).localeCompare(text(a.data["Valuation Date"])));
  const grantsOptions = live.some((s) => s.kind === "option" || s.kind === "rsu");
  if (!valuations.length)
    add(
      grantsOptions ? "warning" : "info",
      "valuation_missing",
      "No 409A valuation recorded",
      "Record the company's current 409A valuation in Compliance so option exercise prices can be checked against it.",
      [{ label: "409A valuations", kind: "company" }],
    );
  else {
    const latest = valuations[0]!;
    const valued = text(latest.data["Valuation Date"]),
      stated = text(latest.data["Expiration Date"]);
    const expires = isIsoDate(stated) ? stated : isIsoDate(valued) ? addMonths(valued, 12) : null;
    if (expires && expires < today)
      add(
        "warning",
        "valuation_expired",
        "409A valuation expired",
        `The latest 409A valuation expired on ${expires}${isIsoDate(stated) ? "" : " (12 months after its valuation date)"}. Get a new valuation before granting options.`,
        [recordItem(latest)],
      );
    else if (expires && expires <= soon)
      add(
        "info",
        "valuation_expiring",
        "409A valuation expiring soon",
        `The latest 409A valuation expires on ${expires}.`,
        [recordItem(latest)],
      );
  }

  // Company records.
  if (!records.some((r) => r.kind === "document"))
    add(
      "info",
      "no_documents",
      "No documents uploaded",
      "Upload signed agreements, certificates and board consents to the Data Room.",
      [{ label: "Data Room", kind: "company" }],
    );
  if (profile)
    add(
      "info",
      "profile_incomplete",
      "Company profile incomplete",
      "Fill in the missing company profile fields.",
      profileFields
        .filter((k) => !text(profile[k]))
        .map((k) => ({ label: k, kind: "company" as const })),
    );
  add(
    "info",
    "import_warnings",
    "Import notes",
    "Notes recorded when the cap table was imported.",
    data.warnings.map((w) => ({ label: w, kind: "company" as const })),
  );

  return issues
    .map((issue, i) => ({ issue, i }))
    .sort(
      (a, b) =>
        severities.indexOf(a.issue.severity) - severities.indexOf(b.issue.severity) || a.i - b.i,
    )
    .map(({ issue }) => issue);
}

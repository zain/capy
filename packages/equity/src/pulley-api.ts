import { D, importSchema, isConvertible, type EquityImport } from "./index";
import { canProjectVesting } from "./modeling";

// Pulley's web API returns loosely typed JSON; these helpers read only the fields Capy uses.
type Json = Record<string, any>;

/** A read-only snapshot of one company from Pulley's web API. */
export interface PulleySnapshot {
  securities: Json[];
  /** Security detail responses by Pulley security id; these carry vest events. */
  securityDetails: Record<string, Json>;
  convertibles: Json[];
  stakeholders: Json[];
  shareClasses: Json[];
  employees: Json[];
  boardApprovals: Json[];
  boardMembers: Json[];
  valuations: Json[];
  /** Company settings, for the Capy company profile. */
  company?: Json;
  /** Every file in Pulley's data room (the DocumentLibrary query's `fileUploads`). */
  library?: Json[];
  /** User-created data room folders. */
  folders?: Json[];
  /** Stock certificates Pulley issued. */
  certificates?: Json[];
  /** Pulley's audit log for the company. */
  auditLog?: Json[];
}
export interface ImportRecord {
  kind: string;
  title: string;
  status: "Recorded" | "Draft";
  data: Record<string, string>;
}
export interface ImportDocument {
  /** Stable source identifier, so a file is never uploaded twice. */
  source: string;
  /** Path to the file, relative to the company folder. */
  file: string;
  filename: string;
  category: string;
  /** Certificate labels the file belongs to, for showing it on each security. */
  certificates: string[];
}

const day = (value?: string | null) => (value ? String(value).slice(0, 10) : "");
const words = (value?: string | null) =>
  value
    ? String(value)
        .toLowerCase()
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : "";
const certificateOf = (s: Json) => `${s.display_id_prefix}-${s.display_id_override}`;
const decimal = (value: unknown) =>
  value === null || value === undefined || value === "" ? null : D(String(value)).toFixed();
function present(values: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values))
    if (v !== null && v !== undefined && String(v).trim() !== "") out[k] = String(v).trim();
  return out;
}
/** Adds values only where the export left a field blank, so export values stay authoritative. */
function fill(fields: Record<string, string | null>, values: Record<string, unknown>) {
  const out = { ...fields };
  for (const [k, v] of Object.entries(present(values))) if (!out[k]) out[k] = v;
  return out;
}

/**
 * Adds what Pulley's Excel export omits: stakeholder contact details, dated vesting events,
 * share class prices and missing SAFE terms. Balances still come from the export.
 */
export function enrichFromPulley(base: EquityImport, api: PulleySnapshot): EquityImport {
  const people = new Map(api.stakeholders.map((p) => [String(p.name).trim().toLowerCase(), p]));
  const employeeFor = (email?: string) =>
    email ? api.employees.find((e) => e.email?.toLowerCase() === email.toLowerCase()) : undefined;
  const stakeholders = base.stakeholders.map((s) => {
    const p = people.get(s.name.trim().toLowerCase());
    if (!p) return s;
    const e = employeeFor(p.email);
    return {
      ...s,
      email: s.email || p.email || "",
      entityType: s.entityType || words(p.stakeholder_type),
      relationship: s.relationship || words(p.relationship),
      externalId: s.externalId || p.company_defined_external_id || "",
      fields: {
        ...s.fields,
        ...present({
          Address: p.address ?? e?.street_address,
          City: p.city ?? e?.city,
          State: p.state ?? e?.state,
          "Postal Code": p.zip_code ?? e?.zip_code,
          Country: p.country ?? e?.country,
          Phone: p.phone_number,
          "Hire Date": day(p.hire_date ?? e?.start_date),
          "Termination Date": day(p.termination_date ?? e?.end_date),
          "Termination Type": words(p.termination_type),
          "Pulley ID": p.id,
        }),
        ...(p.comment && !s.fields?.Notes ? { Notes: String(p.comment).trim() } : {}),
      },
    };
  });

  // The export only lists stakeholders who hold securities; keep the rest as contacts on the cap table.
  const known = new Set(base.stakeholders.map((s) => s.name.trim().toLowerCase()));
  for (const p of api.stakeholders)
    if (!p.deleted_at && !known.has(String(p.name).trim().toLowerCase()))
      stakeholders.push({
        key: `pulley-${p.id}`,
        name: String(p.name).trim(),
        relationship: words(p.relationship),
        email: p.email || "",
        entityType: words(p.stakeholder_type),
        externalId: p.company_defined_external_id || "",
        fields: present({ "Pulley ID": p.id, Notes: "Holds no securities in Pulley." }),
      });

  const filed83b = new Set(
    (api.library ?? [])
      .filter((f) => f.relation === "securities" && f.type === "83b")
      .map((f) => f.relationId),
  );
  const pulleySecurities = new Map(api.securities.map((s) => [certificateOf(s), s]));
  const pulleyConvertibles = new Map(api.convertibles.map((c) => [certificateOf(c), c]));
  const securities = base.securities.map((s) => {
    if (isConvertible(s)) {
      const c = pulleyConvertibles.get(s.certificate);
      if (!c) return s;
      return {
        ...s,
        fields: fill(s.fields, {
          "Valuation Cap": decimal(c.valuation_cap),
          "Conversion Discount": decimal(c.conversion_discount),
          "Interest Rate": decimal(c.interest_rate),
          "Maturity Date": day(c.maturity_date),
          "MFN Date": day(c.mfn_date),
          "Pro Rata":
            c.pro_rata === null || c.pro_rata === undefined ? "" : c.pro_rata ? "Yes" : "No",
          "Board Approval Date": day(c.board_approval_date),
          "Pulley ID": c.id,
        }),
      };
    }
    const p = pulleySecurities.get(s.certificate);
    if (!p) return s;
    const events = (api.securityDetails[p.id]?.vest_events ?? [])
      .filter((e: Json) => e.status !== "CANCELLED" && e.date_vest && D(e.num_vest).gt(0))
      .map((e: Json) => ({ date: day(e.date_vest), shares: D(e.num_vest).toFixed() }))
      .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
    return {
      ...s,
      ...(events.length ? { vestEvents: events } : {}),
      fields: fill(s.fields, {
        "Board Approval Date": day(p.board_approval_date),
        "Acceptance Status": words(p.acceptance_status),
        "83(b) Election": filed83b.has(p.id) ? "Filed" : "",
        "Pulley ID": p.id,
      }),
    };
  });

  const classes = base.classes.map((c) => {
    const p = api.shareClasses.find((x) => x.name === c.name);
    if (!p) return c;
    return {
      ...c,
      authorized: c.authorized ?? decimal(p.authorized_number_of_shares),
      pricePerShare: c.pricePerShare ?? decimal(p.price_per_share),
      parValue: c.parValue ?? decimal(p.par_value),
    };
  });

  const warnings = base.warnings.filter(
    (w) =>
      !/stakeholder emails|document files, approvals|can’t project|duplicate certificate label/i.test(
        w,
      ),
  );
  const unprojectable = securities.filter(
    (s) =>
      !isConvertible(s) &&
      s.kind !== "rsa" &&
      s.vestingSchedule &&
      D(s.outstanding).gt(0) &&
      !canProjectVesting(s),
  );
  if (unprojectable.length)
    warnings.push(
      `${unprojectable.map((s) => s.certificate).join(", ")} have no vesting events in Pulley, so Capy can’t project their future vesting.`,
    );
  const holders = new Set(
    securities.filter((s) => D(s.outstanding).gt(0)).map((s) => s.stakeholderKey),
  );
  const missingEmail = stakeholders.filter((s) => holders.has(s.key) && !s.email);
  if (missingEmail.length)
    warnings.push(`No email in Pulley for ${missingEmail.map((s) => s.name).join(", ")}.`);

  return importSchema.parse({ ...base, stakeholders, securities, classes, warnings });
}

/** Board approvals, 409A valuations and board members, as Capy records. */
export function pulleyRecords(api: PulleySnapshot, companyName: string): ImportRecord[] {
  const certificates = new Map(
    [...api.securities, ...api.convertibles].map((s) => [s.id, certificateOf(s)]),
  );
  const records: ImportRecord[] = [];
  for (const a of api.boardApprovals) {
    const signatures: Json[] = a.board_member_signatures ?? [];
    const signed = signatures.filter((s) => s.status === "SIGNED");
    const pending = signatures.filter((s) => s.status !== "SIGNED");
    const consent = (a.fileuploads ?? []).find((f: Json) => f.id === a.consent_doc_id);
    const covered = (a.security_ids ?? []).map((id: number) => certificates.get(id) ?? String(id));
    const lastSigned = signed
      .map((s) => day(s.signed_at))
      .sort()
      .pop();
    records.push({
      kind: "approval",
      title: `${a.name || "Board approval"}, ${day(a.requested_date)}`,
      status: pending.length ? "Draft" : "Recorded",
      data: present({
        "Approval Type": "Board consent",
        "Effective Date": pending.length ? "" : lastSigned || day(a.requested_date),
        "Board Members": signatures
          .map(
            (s) =>
              `${s.board_member?.name} (${s.status === "SIGNED" ? `signed ${day(s.signed_at)}` : "not signed"})`,
          )
          .join("; "),
        "Consent Document": consent?.filename,
        Notes: [
          `Requested ${day(a.requested_date)} in Pulley.`,
          covered.length ? `Covers ${covered.join(", ")}.` : "",
          pending.length
            ? `Still awaiting signature from ${pending.map((s) => s.board_member?.name).join(", ")}.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      }),
    });
  }
  for (const v of api.valuations) {
    const common = (v.fmv_share_classes ?? []).find((c: Json) => c.preference_type === "COMMON");
    records.push({
      kind: "valuation",
      title: `409A valuation, ${day(v.effective_date)}`,
      status: "Recorded",
      data: present({
        "Valuation Date": day(v.effective_date),
        Provider: v.valuation_provider,
        "Fair Market Value Per Share": decimal(common?.price_per_share),
        "Expiration Date": day(v.expiration_date),
        Notes: `${words(v.report_version)} ${words(v.valuation_type).replace("Fmv 409a", "409A")} report, imported from Pulley.`,
      }),
    });
  }
  for (const m of api.boardMembers)
    records.push({
      kind: "contact",
      title: m.name,
      status: "Recorded",
      data: present({
        Name: m.name,
        Email: m.email,
        Role: m.title ? `Board member, ${m.title}` : "Board member",
        Company: companyName,
      }),
    });
  return records;
}

/** Company details for the Capy company profile. */
export function pulleyProfile(company: Json): Record<string, string> {
  const a = company.address_details ?? {};
  return present({
    "Legal Name": company.legal_name || company.name,
    "State of Incorporation": company.incorporation_state,
    "Incorporation Date": day(company.incorporation_date),
    Address: [a.address, a.city, [a.state, a.zip_code].filter(Boolean).join(" "), a.country]
      .filter(Boolean)
      .join(", "),
  });
}

/**
 * Every data room file and stock certificate, filed into Capy data room categories and linked to
 * the certificates they belong to. `files` maps Pulley file and security ids to downloaded paths.
 */
export function pulleyDocuments(
  api: PulleySnapshot,
  files: { library: Map<number, string>; certificates: Map<number, string> },
): ImportDocument[] {
  const securities = new Map(api.securities.map((s) => [s.id, certificateOf(s)]));
  const convertibles = new Map(api.convertibles.map((c) => [c.id, certificateOf(c)]));
  const folders = new Map((api.folders ?? []).map((f) => [f.id, String(f.name)]));
  const categories: Record<string, string> = {
    convertibles: "SAFEs",
    board_approval: "Board Approvals",
    fmv: "Valuation",
    share_classes: "Corporate Records",
    equity_plans: "Corporate Records",
    document_group: "Form Documents",
    stakeholder_company: "Stakeholders",
    theme: "Branding",
  };
  const documents: ImportDocument[] = [];
  for (const f of api.library ?? []) {
    const file = files.library.get(f.id);
    if (!file) continue;
    const certificate =
      f.relation === "securities"
        ? securities.get(f.relationId)
        : f.relation === "convertibles"
          ? convertibles.get(f.relationId)
          : undefined;
    const category =
      f.relation === "securities"
        ? f.type === "83b"
          ? "83(b) Elections"
          : "Stock & Options"
        : f.relation === "custom"
          ? (folders.get(f.relationId) ?? "Company")
          : (categories[f.relation] ?? "Company");
    documents.push({
      source: `file:${f.id}`,
      file,
      filename: f.filename,
      category,
      certificates: certificate ? [certificate] : [],
    });
  }
  for (const c of api.certificates ?? []) {
    const file = files.certificates.get(c.id);
    if (!file) continue;
    documents.push({
      source: `certificate:${c.id}`,
      file,
      filename: `Stock Certificate ${c.certificate_id} - ${c.stakeholder_company_name}.pdf`,
      category: "Stock Certificates",
      certificates: [c.certificate_id],
    });
  }
  return documents;
}

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
/** Pulley's audit log as a readable CSV, oldest first. */
export function pulleyAuditCsv(api: PulleySnapshot): string {
  const securities = new Map(api.securities.map((s) => [s.id, certificateOf(s)]));
  const convertibles = new Map(api.convertibles.map((c) => [c.id, certificateOf(c)]));
  const actions: Record<string, string> = { I: "Created", U: "Updated", D: "Deleted" };
  const rows = [...(api.auditLog ?? [])]
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
    .map((e) => {
      const record =
        (e.security && securities.get(e.security.id)) ||
        (e.convertible && convertibles.get(e.convertible.id)) ||
        e.stakeholder_company?.view?.name ||
        e.security_class?.name ||
        e.equity_plan?.name ||
        e.vesting_schedule?.name ||
        e.role?.view?.name ||
        e.row_data?.filename ||
        e.row_data?.name ||
        e.row_id;
      const changes = Object.fromEntries(
        Object.entries(e.changed_fields ?? {}).filter(
          ([k]) => !/^(updated_at|created_at)$/.test(k),
        ),
      );
      return [
        String(e.timestamp ?? "")
          .replace("T", " ")
          .slice(0, 19),
        actions[e.action] ?? e.action,
        words(e.table_name),
        record,
        Object.keys(changes).length ? JSON.stringify(changes).slice(0, 2000) : "",
        [e.acting_user?.name, e.acting_user?.email && `<${e.acting_user.email}>`]
          .filter(Boolean)
          .join(" "),
      ];
    });
  return [["Date (UTC)", "Action", "Record Type", "Record", "Changes", "By"], ...rows]
    .map((r) => r.map(csvCell).join(","))
    .join("\n");
}

import { D, sum, totals, importSchema } from "./index";
import type { EquityImport, Security, Stakeholder, ShareClass, EquityPlan } from "./index";

export type Cell = string | number | null;
export type ImportSheet = { name: string; rows: Cell[][] };
const text = (v: Cell | undefined) => (v === null || v === undefined ? "" : String(v).trim());
const normal = (v: Cell | undefined) =>
  text(v)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
function decimal(v: Cell | undefined, context: string, required = false): string | null {
  if (v === null || v === undefined || text(v) === "") {
    if (required)
      throw new Error(
        `${context}: a required value is missing. Export the detailed cap table again.`,
      );
    return null;
  }
  const value = text(v).replace(/[$,\s]/g, "");
  try {
    const d = D(value);
    if (d.isFinite() && d.gte(0)) return d.toFixed();
  } catch {
    /* Report the source cell below. */
  }
  throw new Error(`${context}: “${text(v)}” is not a nonnegative number.`);
}
function table(sheet: ImportSheet, keys: string[]) {
  const index = sheet.rows.findIndex((row) =>
    keys.every((key) => row.some((c) => normal(c) === normal(key))),
  );
  if (index < 0) return null;
  const headers = sheet.rows[index]!.map(text);
  return {
    index,
    headers,
    rows: sheet.rows.slice(index + 1).map((cells, i) => ({
      cells,
      row: index + i + 2,
      fields: Object.fromEntries(
        headers.flatMap((h, j) =>
          h ? [[h, cells[j] === null || cells[j] === undefined ? null : String(cells[j])]] : [],
        ),
      ),
    })),
  };
}
export function parsePulleySheets(
  sheets: ImportSheet[],
  fallbackName = "Imported company",
): EquityImport {
  const securities: Security[] = [],
    stakeholders: Stakeholder[] = [],
    classes: ShareClass[] = [],
    plans: EquityPlan[] = [];
  const warnings: string[] = [],
    sheetInfo: EquityImport["sheets"] = [];
  const people = new Map<string, Stakeholder>();
  const summary = sheets.find((s) => normal(s.name) === "summary");
  const ownership = sheets.find((s) => normal(s.name) === "ownership");
  const name =
    text(summary?.rows[0]?.[0]).replace(/\s+Summary Capitalization Table$/i, "") ||
    text(ownership?.rows[0]?.[0]) ||
    fallbackName;
  const dateText = text(summary?.rows[1]?.[0]);
  const dateMatch = dateText.match(/data to (\d{2})-(\d{2})-(\d{4})/);
  const asOf = dateMatch ? `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}` : "";
  function person(name: string) {
    const normalized = name.trim().toLocaleLowerCase("en-US");
    let p = people.get(normalized);
    if (!p) {
      p = {
        key: `person-${people.size + 1}`,
        name: name.trim(),
        relationship: "",
        email: "",
        externalId: "",
        entityType: "",
      };
      people.set(normalized, p);
      stakeholders.push(p);
    }
    return p;
  }
  if (ownership) {
    const ownershipNames = new Set<string>();
    const t = table(ownership, ["Stakeholder", "Stakeholder Type"]);
    if (t)
      for (const { fields } of t.rows) {
        const label = text(fields.Stakeholder);
        if (!label || /^(total|available)|\bavailable$/i.test(label)) continue;
        const normalized = label.toLocaleLowerCase("en-US");
        if (ownershipNames.has(normalized))
          throw new Error(
            `More than one stakeholder is named “${label}”. Give them distinct names or export unique stakeholder identifiers before importing.`,
          );
        ownershipNames.add(normalized);
        const p = person(label);
        p.relationship = text(fields["Stakeholder Type"]);
        p.externalId = text(fields["Stakeholder External ID"]);
      }
  }
  const contactSheet = sheets.find((s) => table(s, ["Name", "Email"]));
  if (contactSheet)
    for (const contact of parseStakeholderSheets([contactSheet])) {
      const p = person(contact.name);
      Object.assign(p, contact, { key: p.key });
    }
  // Summary uses indented section labels, with stable semantic column headers.
  if (summary) {
    const header = summary.rows.find((r) => r.some((c) => normal(c) === "authorized"));
    const col = (label: string) => header?.findIndex((c) => normal(c) === normal(label)) ?? -1;
    const auth = col("Authorized"),
      outstanding = col("Issued and Outstanding"),
      capital = col("Capital Contribution");
    let section = "",
      plan: EquityPlan | undefined;
    for (const row of summary.rows) {
      if (text(row[0])) {
        section = text(row[0]);
        plan = undefined;
      }
      if (normal(row[1]) === "plansize") {
        plan = {
          name: section,
          authorized: decimal(row[auth], `${section} plan size`, true)!,
          available: "0",
          className: "",
        };
        plans.push(plan);
      }
      if (plan && normal(row[1]) === "sharesavailable")
        plan.available = decimal(row[outstanding], `${section} available shares`, true)!;
      if (plan && normal(row[1]) === "planstatus") plan.status = text(row[2]);
      if (plan && normal(row[1]) === "boardapproval") plan.boardApproval = text(row[2]);
      if (plan && normal(row[1]) === "termyears")
        plan.termYears = decimal(row[2], `${section} term years`);
      if (plan && normal(row[1]) === "planshareclass") plan.className = text(row[2]);
      if (
        normal(section) === "stock" &&
        text(row[2]) &&
        row[auth] !== null &&
        row[auth] !== undefined
      ) {
        classes.push({
          name: text(row[2]),
          kind: /preferred/i.test(text(row[2])) ? "Preferred" : "Common",
          authorized: decimal(row[auth], "Authorized shares"),
          reportedOutstanding: decimal(row[outstanding], "Outstanding shares"),
          capital: decimal(row[capital], "Capital contribution"),
          parValue: decimal(row[col("Par Value")], "Par value"),
          pricePerShare: decimal(row[col("Price per Share")], "Price per share"),
        });
      }
    }
  }
  for (const sheet of sheets) {
    const stock = table(sheet, ["Certificate ID", "Stakeholder Name", "Shares Outstanding"]);
    const award = table(sheet, ["Certificate ID", "Stakeholder Name", "Grant Type", "Outstanding"]);
    const convertible = table(sheet, ["Convertible ID", "Stakeholder", "Principal Outstanding"]);
    const t = stock || award || convertible;
    if (!t) {
      sheetInfo.push({
        name: sheet.name,
        rows: sheet.rows.length,
        kind:
          /summary|ownership/i.test(sheet.name) || sheet === contactSheet
            ? "summary"
            : "unrecognized",
      });
      if (!/summary|ownership/i.test(sheet.name) && sheet !== contactSheet)
        warnings.push(
          `The “${sheet.name}” sheet was not recognized. Its records were not imported.`,
        );
      continue;
    }
    sheetInfo.push({
      name: sheet.name,
      rows: t.rows.length,
      kind: stock ? "shares" : award ? "awards" : "convertibles",
    });
    const className = stock ? (text(sheet.rows[0]?.[0]) || sheet.name).replace(/^[^-]+-/, "") : "";
    if (stock && !classes.some((c) => c.name === className))
      classes.push({
        name: className,
        kind: /preferred|^PS-/i.test(sheet.name) ? "Preferred" : "Common",
        authorized: null,
        reportedOutstanding: null,
        capital: null,
      });
    if (stock) {
      const cls = classes.find((c) => c.name === className);
      if (cls && /^PS-/i.test(sheet.name)) cls.kind = "Preferred";
    }
    for (const { fields: f, row } of t.rows) {
      const certificate = text(f[convertible ? "Convertible ID" : "Certificate ID"]);
      const personName = text(f[convertible ? "Stakeholder" : "Stakeholder Name"]);
      // Totals and the plan's below-table summary are not security rows.
      if (!certificate || !personName || /^(total|summary of)/i.test(certificate)) continue;
      const get = (key: string, required = false) =>
        decimal(f[key], `${sheet.name} row ${row}, ${key}`, required);
      const grantType = text(f["Grant Type"]).toLowerCase();
      const kind: Security["kind"] = stock
        ? /warrant/i.test(sheet.name)
          ? "warrant"
          : "share"
        : convertible
          ? /safe/i.test(text(f["Security Type"]) || certificate)
            ? "safe"
            : "note"
          : ["rsa", "rsu", "piu", "warrant"].includes(grantType)
            ? (grantType as "rsa" | "rsu" | "piu" | "warrant")
            : "option";
      const outstanding = get(
        stock ? "Shares Outstanding" : convertible ? "Principal Outstanding" : "Outstanding",
        true,
      )!;
      const issued = get(
        stock ? "Shares Issued" : convertible ? "Principal Issued" : "Granted",
        true,
      )!;
      const planName = text(f["Equity Plan"] || f["Equity Plan Name"]);
      let status = text(f.Status) || "Outstanding";
      if (D(outstanding).eq(0))
        status = text(f["Converted Date"])
          ? "Converted"
          : D(get("Shares Repurchased") || 0).gt(0)
            ? "Repurchased"
            : D(get("Exercised/Settled") || 0).gte(issued)
              ? "Exercised"
              : "Cancelled";
      const s: Security = {
        key: `${sheet.name}:${row}`,
        certificate,
        stakeholderKey: person(personName).key,
        kind,
        className: stock ? className : text(f["Share Class Name"]),
        planName,
        issued,
        outstanding,
        price: get(stock ? "Price Per Share" : "Exercise Price"),
        capital: get("Capital Contribution"),
        vested: get(stock ? "Shares Vested" : "Vested Outstanding"),
        balanceAsOf: text(f["Balance As Of"]) || asOf,
        issuedOn: text(f[stock ? "Issue Date" : "Grant Date"]),
        vestingStart: text(f["Vesting Start Date"]),
        vestingSchedule: text(f["Vesting Schedule"]),
        status,
        sourceSheet: sheet.name,
        sourceRow: row,
        fields: f,
      };
      securities.push(s);
      if (planName) {
        let p = plans.find((p) => p.name === planName);
        if (!p && award) {
          const size = sheet.rows.find((r) => normal(r[0]) === "authorizedshares");
          const avail = sheet.rows.find((r) => normal(r[0]) === "availableforissuance");
          const lastNumber = (r: Cell[] | undefined) =>
            r?.find((c, i) => i > 0 && c !== null && c !== "");
          if (size && avail) {
            p = {
              name: planName,
              authorized: decimal(lastNumber(size), `${planName} authorized`, true)!,
              available: decimal(lastNumber(avail), `${planName} available`, true)!,
              className: s.className,
            };
            plans.push(p);
          } else
            warnings.push(
              `“${planName}” is missing plan reserves; the fully diluted total excludes its unallocated shares.`,
            );
        }
        if (p && !p.className) p.className = s.className;
      }
    }
  }
  if (!securities.length)
    throw new Error(
      "No detailed securities found. Upload Pulley’s Download Cap Table Excel export, including its security sheets.",
    );
  for (const rsa of securities.filter((s) => s.kind === "rsa")) {
    if (
      !securities.some(
        (s) =>
          s.kind === "share" &&
          s.stakeholderKey === rsa.stakeholderKey &&
          s.className === rsa.className &&
          s.certificate === rsa.certificate &&
          D(s.outstanding).eq(rsa.outstanding),
      )
    )
      throw new Error(
        `Restricted stock award ${rsa.certificate} could not be matched to its underlying stock certificate. This export needs a restricted-stock mapping before it can be imported without double-counting.`,
      );
  }
  for (const c of classes) {
    const actual = sum(
      securities
        .filter((s) => s.kind === "share" && s.className === c.name)
        .map((s) => s.outstanding),
    );
    if (c.reportedOutstanding !== null && !D(actual).eq(c.reportedOutstanding))
      throw new Error(
        `${c.name}: security rows total ${actual} outstanding shares, but the summary reports ${c.reportedOutstanding}. Check that the export is complete.`,
      );
  }
  const keys = new Set<string>();
  for (const s of securities) {
    const id = `${s.className}:${s.certificate}`;
    if (keys.has(id))
      warnings.push(
        `Duplicate certificate label “${s.certificate}” preserved as separate records.`,
      );
    keys.add(id);
  }
  if (securities.some((s) => /custom/i.test(s.vestingSchedule)))
    warnings.push(
      "Custom vesting schedules include balances but not individual events. Import the underlying schedule before projecting future vesting.",
    );
  warnings.push(
    contactSheet
      ? "Document files, approvals and account access are not included. Add those separately."
      : "This workbook does not include stakeholder emails, document files, approvals or account access. Add those separately.",
  );
  if (!asOf)
    warnings.push("The export date could not be detected. Set the as-of date before importing.");
  const result = importSchema.parse({
    name,
    asOf,
    stakeholders,
    securities,
    plans,
    classes,
    warnings: [...new Set(warnings)],
    sheets: sheetInfo,
  });
  totals(result);
  return result;
}

export function parseStakeholderSheets(sheets: ImportSheet[]): Stakeholder[] {
  const sheet = sheets.find((s) => table(s, ["Name", "Email"]));
  if (!sheet)
    throw new Error(
      "Choose Pulley’s Stakeholders → Actions → Download export, with Name and Email columns.",
    );
  const t = table(sheet, ["Name", "Email"])!;
  return t.rows
    .filter((r) => text(r.fields.Name) && normal(r.fields.Name) !== "total")
    .map(({ fields: f }, i) => ({
      key: `contact-${i}`,
      name: text(f.Name),
      email: text(f.Email),
      entityType: text(f.Type),
      externalId: text(f["External ID"]),
      relationship: text(f.Relationship).replace(/^Former Employee$/i, "Ex-Employee"),
      fields: Object.fromEntries(Object.entries(f).filter(([key]) => normal(key) !== "ssn")),
    }));
}

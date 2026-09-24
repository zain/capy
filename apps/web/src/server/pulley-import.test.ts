import { describe, expect, it } from "vite-plus/test";
import { projectedVested } from "@capy/equity/modeling";
import {
  enrichFromPulley,
  pulleyAuditCsv,
  pulleyDocuments,
  pulleyProfile,
  pulleyRecords,
  type PulleySnapshot,
} from "@capy/equity/pulley";
import type { EquityImport, Security } from "@capy/equity";

const share: Security = {
  key: "CS-Common:5",
  certificate: "CS-1",
  stakeholderKey: "person-1",
  kind: "share",
  className: "Common",
  planName: "",
  issued: "1200",
  outstanding: "1200",
  price: "0.001",
  capital: "1.2",
  vested: "300",
  balanceAsOf: "2026-09-24",
  issuedOn: "2025-09-24",
  vestingStart: "2025-09-24",
  vestingSchedule: "Founder schedule",
  status: "Outstanding",
  sourceSheet: "CS-Common",
  sourceRow: 5,
  fields: {},
};
const safe: Security = {
  ...share,
  key: "Convertibles:4",
  certificate: "SAFE-1",
  stakeholderKey: "person-2",
  kind: "safe",
  className: "",
  issued: "50000",
  outstanding: "50000",
  vested: null,
  vestingSchedule: "",
  fields: { "Valuation Cap": null, "Conversion Type": "Post-Money" },
};
const base: EquityImport = {
  name: "Example",
  asOf: "2026-09-24",
  stakeholders: [
    {
      key: "person-1",
      name: "Ada Founder",
      relationship: "Founder",
      email: "",
      entityType: "",
      externalId: "",
    },
    {
      key: "person-2",
      name: "Seed Fund",
      relationship: "Investor",
      email: "",
      entityType: "",
      externalId: "",
    },
  ],
  securities: [share, safe],
  classes: [
    {
      name: "Common",
      kind: "Common",
      authorized: "10000",
      reportedOutstanding: "1200",
      capital: "1.2",
    },
    {
      name: "Seed",
      kind: "Preferred",
      authorized: "5000",
      reportedOutstanding: null,
      capital: null,
    },
  ],
  plans: [],
  warnings: [
    "CS-1 use vesting schedules Capy can’t project from this export. Their vested balances as of the export are imported, but future vesting needs each schedule’s individual events.",
    "This workbook does not include stakeholder emails, document files, approvals or account access. Add those separately.",
  ],
  sheets: [],
};
const api: PulleySnapshot = {
  securities: [
    {
      id: 11,
      display_id_prefix: "CS",
      display_id_override: "1",
      board_approval_date: "2025-09-20",
      acceptance_status: "PENDING",
    },
  ],
  securityDetails: {
    11: {
      vest_events: [
        { date_vest: "2026-09-24", num_vest: "300.00", status: "COMPLETED" },
        { date_vest: "2027-09-24", num_vest: "900.00", status: "PENDING" },
        { date_vest: "2027-03-24", num_vest: "500.00", status: "CANCELLED" },
      ],
    },
  },
  convertibles: [
    {
      id: 21,
      display_id_prefix: "SAFE",
      display_id_override: "1",
      valuation_cap: "8000000",
      mfn_date: null,
      pro_rata: true,
    },
  ],
  stakeholders: [
    {
      id: 1,
      name: "Ada Founder",
      email: "ada@example.com",
      stakeholder_type: "INDIVIDUAL",
      relationship: "FOUNDER",
      termination_date: null,
      comment: "Holds through a family trust",
    },
    {
      id: 2,
      name: "Seed Fund",
      email: "ops@seed.example",
      stakeholder_type: "INSTITUTION",
      relationship: "INVESTOR",
    },
    {
      id: 3,
      name: "Advisor LLC",
      email: "hi@advisor.example",
      stakeholder_type: "INSTITUTION",
      relationship: "CONSULTANT",
    },
  ],
  shareClasses: [
    {
      name: "Seed",
      price_per_share: "1.5",
      par_value: "0.00001",
      authorized_number_of_shares: 5000,
    },
  ],
  employees: [],
  boardApprovals: [
    {
      id: 31,
      name: "Option Grant",
      requested_date: "2025-09-01",
      consent_doc_id: 41,
      fileuploads: [{ id: 41, filename: "Consent.pdf" }],
      security_ids: [11],
      board_member_signatures: [
        {
          status: "SIGNED",
          signed_at: "2025-09-02T10:00:00Z",
          board_member: { name: "Ada Founder" },
        },
        { status: "PENDING", signed_at: null, board_member: { name: "Bo Director" } },
      ],
    },
  ],
  boardMembers: [{ name: "Bo Director", email: "bo@example.com", title: "Director" }],
  valuations: [
    {
      effective_date: "2025-06-01",
      expiration_date: "2026-05-31",
      valuation_provider: "Carta",
      report_version: "FINAL",
      valuation_type: "FMV_409A",
      fmv_share_classes: [{ preference_type: "COMMON", price_per_share: "0.25" }],
    },
  ],
  company: {
    name: "Example",
    legal_name: "Example, Inc.",
    incorporation_state: "DE",
    incorporation_date: "2025-01-15T00:00:00Z",
    address_details: {
      address: "1 Main St",
      city: "Dover",
      state: "DE",
      zip_code: "19901",
      country: "US",
    },
  },
  library: [
    { id: 1, filename: "Stock agreement.pdf", relation: "securities", relationId: 11, type: null },
    { id: 2, filename: "83b.pdf", relation: "securities", relationId: 11, type: "83b" },
    {
      id: 3,
      filename: "SAFE.pdf",
      relation: "convertibles",
      relationId: 21,
      type: "generated_safe",
    },
    { id: 4, filename: "Charter.pdf", relation: "share_classes", relationId: 7, type: null },
    { id: 5, filename: "Deck.pdf", relation: "custom", relationId: 900, type: null },
    { id: 6, filename: "Not downloaded.pdf", relation: "custom", relationId: 900, type: null },
  ],
  folders: [{ id: 900, name: "Pitch Deck" }],
  certificates: [{ id: 11, certificate_id: "CS-1", stakeholder_company_name: "Ada Founder" }],
  auditLog: [
    {
      timestamp: "2025-09-24T12:00:00+00:00",
      action: "U",
      table_name: "security",
      security: { id: 11 },
      changed_fields: { price_per_share: "0.001", updated_at: "x" },
      acting_user: { name: "Ada Founder", email: "ada@example.com" },
    },
    {
      timestamp: "2025-09-01T12:00:00+00:00",
      action: "I",
      table_name: "stakeholder_company",
      stakeholder_company: { view: { name: "Seed Fund, LP" } },
      changed_fields: null,
      acting_user: null,
    },
  ],
};

describe("Pulley API enrichment", () => {
  const data = enrichFromPulley(base, api);
  it("fills stakeholder emails and keeps stakeholders without securities", () => {
    expect(data.stakeholders.find((s) => s.name === "Ada Founder")?.email).toBe("ada@example.com");
    const advisor = data.stakeholders.find((s) => s.name === "Advisor LLC");
    expect(advisor).toMatchObject({ email: "hi@advisor.example", relationship: "Consultant" });
  });
  it("adds dated vesting events, skipping cancelled ones", () => {
    const s = data.securities.find((s) => s.key === share.key)!;
    expect(s.vestEvents).toEqual([
      { date: "2026-09-24", shares: "300" },
      { date: "2027-09-24", shares: "900" },
    ]);
    expect(projectedVested(s, data.asOf, "2027-09-24")).toBe("1200");
    expect(s.fields["Acceptance Status"]).toBe("Pending");
  });
  it("fills only blank terms and missing share class prices", () => {
    const s = data.securities.find((s) => s.key === safe.key)!;
    expect(s.fields["Valuation Cap"]).toBe("8000000");
    expect(s.fields["Conversion Type"]).toBe("Post-Money");
    expect(data.classes.find((c) => c.name === "Seed")?.pricePerShare).toBe("1.5");
  });
  it("drops warnings the API data resolves", () => {
    expect(data.warnings).toEqual([]);
  });
  it("records unsigned board consents as drafts and keeps the 409A price", () => {
    const records = pulleyRecords(api, "Example");
    const approval = records.find((r) => r.kind === "approval")!;
    expect(approval).toMatchObject({ status: "Draft", title: "Option Grant, 2025-09-01" });
    expect(approval.data.Notes).toContain("Bo Director");
    expect(approval.data.Notes).toContain("CS-1");
    expect(records.find((r) => r.kind === "valuation")?.data["Fair Market Value Per Share"]).toBe(
      "0.25",
    );
    expect(records.find((r) => r.kind === "contact")?.data.Role).toBe("Board member, Director");
  });
  it("files every downloaded data room file and certificate", () => {
    const docs = pulleyDocuments(api, {
      library: new Map([1, 2, 3, 4, 5].map((id) => [id, `documents/${id}.pdf`])),
      certificates: new Map([[11, "certificates/11.pdf"]]),
    });
    expect(docs.map((d) => [d.source, d.category, d.certificates])).toEqual([
      ["file:1", "Stock & Options", ["CS-1"]],
      ["file:2", "83(b) Elections", ["CS-1"]],
      ["file:3", "SAFEs", ["SAFE-1"]],
      ["file:4", "Corporate Records", []],
      ["file:5", "Pitch Deck", []],
      ["certificate:11", "Stock Certificates", ["CS-1"]],
    ]);
    expect(docs.at(-1)?.filename).toBe("Stock Certificate CS-1 - Ada Founder.pdf");
  });
  it("carries stakeholder notes and filed 83(b) elections", () => {
    expect(data.stakeholders.find((s) => s.key === "person-1")?.fields?.Notes).toBe(
      "Holds through a family trust",
    );
    expect(data.securities.find((s) => s.key === share.key)?.fields["83(b) Election"]).toBe(
      "Filed",
    );
  });
  it("builds the company profile", () => {
    expect(pulleyProfile(api.company!)).toEqual({
      "Legal Name": "Example, Inc.",
      "State of Incorporation": "DE",
      "Incorporation Date": "2025-01-15",
      Address: "1 Main St, Dover, DE 19901, US",
    });
  });
  it("writes the audit log oldest first, naming records and quoting commas", () => {
    const [header, first, second] = pulleyAuditCsv(api).split("\n");
    expect(header).toBe("Date (UTC),Action,Record Type,Record,Changes,By");
    expect(first).toBe('2025-09-01 12:00:00,Created,Stakeholder Company,"Seed Fund, LP",,');
    expect(second).toContain("Updated,Security,CS-1,");
    expect(second).toContain('""price_per_share"":""0.001""');
    expect(second).not.toContain("updated_at");
  });
});

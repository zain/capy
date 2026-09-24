import { describe, expect, it } from "vite-plus/test";
import { projectedVested } from "@capy/equity/modeling";
import {
  enrichFromPulley,
  pulleyDocuments,
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
  it("links documents to their certificates and data room categories", () => {
    const docs = pulleyDocuments(api, [
      { id: 1, filename: "Stock agreement.pdf", owners: ["security:11"] },
      { id: 2, filename: "SAFE.pdf", owners: ["convertible:21"] },
      { id: 41, filename: "Consent.pdf", owners: ["board_approval:31", "board_consent:31"] },
    ]);
    expect(docs.map((d) => [d.category, d.certificates])).toEqual([
      ["Stock & Options", ["CS-1"]],
      ["SAFEs", ["SAFE-1"]],
      ["Board Approvals", []],
    ]);
  });
});

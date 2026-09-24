import { useState } from "react";
import type { ReactNode } from "react";
import { Link, Navigate, useNavigate, useLocation } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@capy/backend/convex/_generated/dataModel";
import { api } from "@capy/backend/convex/_generated/api";
import type { Security, Stakeholder } from "@capy/equity";
import {
  D,
  formatNumber as number,
  percentage,
  stakeholderShares,
  sum,
  isConvertible,
} from "@capy/equity";
import {
  Building2,
  Calculator,
  ChevronRight,
  Download,
  FileBadge,
  HeartHandshake,
  Home,
  Landmark,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Table2,
  ThumbsUp,
  Users,
  CircleUserRound,
  ChevronDown,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { ImportCompany } from "./import";
import { StartWithoutImport } from "./onboarding";
import { BillingNotice } from "./billing";
import { clearPendingImport } from "@/lib/pending-import";
import { DataTable, Empty, Field, Modal } from "./ui";
import { downloadCapTable } from "../../lib/export-workbook";
import { PortalManager, MyPortals } from "./portal";
import type { Column } from "./ui";
import { ConfigurationForm, SecurityActions, SecurityForm } from "./workflows";
import { ContactImport } from "./contact-import";
import { ImportHelp } from "./import-help";
import { DataRoom, LinkedDocuments, recordSections, RecordsPage } from "./records";
import { projectedVested } from "@capy/equity/modeling";
import {
  Compliance,
  Fundraising,
  HireAndRetain,
  Reports,
  SecuritiesStatus,
  VestingPage,
} from "./sections";
import "./equity.css";

import { CompanyContext, useCompany } from "./context";
import type { CompanyView } from "./context";
const date = (value: string) => {
  if (!value) return "—";
  const d = new Date(value + "T12:00:00");
  return Number.isNaN(d.valueOf())
    ? value
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
// Imported caps can be text such as "Uncapped", which is shown as written.
const money = (value: string | null) =>
  value === null ? "—" : /^\d/.test(value.trim()) ? "$" + number(value, 2) : value;
function CompanyLink({ page, children }: { page: string; children: ReactNode }) {
  const { company } = useCompany();
  return (
    <Link to="/companies/$companyId/$" params={{ companyId: company._id, _splat: page }}>
      {children}
    </Link>
  );
}
const groups = [
  { label: "Dashboard", path: "dashboard", icon: Home },
  {
    label: "Cap Table",
    path: "captable",
    icon: Table2,
    children: [
      ["Drafts", "drafts"],
      ["Share Classes", "security_classes"],
      ["Equity Plans", "equity_plans"],
      ["Securities Status", "securities_status"],
      ["Vesting", "vesting_schedules"],
    ],
  },
  { label: "Compliance & Tax", path: "compliance", icon: ShieldCheck },
  {
    label: "Hire and Retain",
    path: "hire_and_retain",
    icon: HeartHandshake,
    children: [
      ["Equity Plans", "equity_plans"],
      ["Offer Letters", "offer_letters_v2"],
      ["Stakeholder Portal", "stakeholder_portal"],
    ],
  },
  { label: "Fundraising", path: "fundraising", icon: Landmark },
  { label: "Stakeholders", path: "stakeholders", icon: Users },
  {
    label: "Company",
    path: "profile",
    icon: Building2,
    children: [
      ["Templates", "templates"],
      ["Data Room", "data_room"],
      ["Reports", "report_generator"],
      ["Recent Activity", "auditLog"],
      ["Import Report", "imports"],
      ["Form Documents", "form_documents"],
      ["External Contacts", "external_contacts"],
    ],
  },
  {
    label: "Approvals",
    path: "board_approvals",
    icon: ThumbsUp,
    children: [
      ["Board Approvals", "board_approvals"],
      ["Stockholder Consents", "stockholder_consents"],
    ],
  },
  {
    label: "Certificates",
    path: "certificates",
    icon: FileBadge,
    children: [["Templates", "certificate_templates"]],
  },
];
const pageTitles: Record<string, string> = {
  dashboard: "Dashboard",
  captable: "Cap Table",
  security_classes: "Share Classes",
  equity_plans: "Equity Plans",
  vesting_schedules: "Vesting",
  stakeholders: "Stakeholders",
  profile: "Company Profile",
  auditLog: "Recent Activity",
  imports: "Import Report",
  import: "Import Cap Table",
  calculator: "Share Calculator",
  data_room: "Data Room",
  report_generator: "Reports",
  drafts: "Drafts",
  securities_status: "Securities Status",
  fundraising: "Fundraising",
  compliance: "Compliance & Tax",
  hire_and_retain: "Hire and Retain",
  board_approvals: "Board Approvals",
  communications_hub: "Communications Hub",
  certificates: "Certificates",
  offer_letters_v2: "Offer Letters",
  stakeholder_portal: "Stakeholder Portal",
  stockholder_consents: "Stockholder Consents",
  templates: "Templates",
  form_documents: "Form Documents",
  certificate_templates: "Certificate Templates",
  external_contacts: "External Contacts",
  securities: "Security Details",
  convertibles: "Convertible Details",
  issuance: "Record Security",
};
function Topbar({ companyId }: { companyId?: string }) {
  const companies = useQuery(api.equity.companies),
    user = useQuery(api.auth.getCurrentUser);
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState("");
  return (
    <header className="eq-topbar">
      <Link className="eq-brand" to="/dashboard">
        Capy
      </Link>
      <select
        aria-label="Company"
        className="eq-company-switch"
        value={companyId || ""}
        onChange={(e) => {
          if (e.target.value)
            void navigate({
              to: "/companies/$companyId/$",
              params: { companyId: e.target.value, _splat: "dashboard" },
            });
          else void navigate({ to: "/dashboard" });
        }}
      >
        <option value="">Your companies</option>
        {companies?.map(
          (c) =>
            c && (
              <option value={c._id} key={c._id}>
                {c.name}
              </option>
            ),
        )}
      </select>
      {companyId && (
        <form
          className="eq-global-search"
          onSubmit={(e) => {
            e.preventDefault();
            void navigate({
              to: "/companies/$companyId/$",
              params: { companyId, _splat: "stakeholders" },
              hash: encodeURIComponent(search),
            });
          }}
        >
          <Search size={17} />
          <input
            aria-label="Search company"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
      )}
      <div className="eq-user">
        <div className="eq-menu-wrap">
          <button
            className="eq-account-button"
            aria-label="Account menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <CircleUserRound size={20} />
            <span>Account</span>
            <ChevronDown size={14} />
          </button>
          {menu && (
            <div className="eq-popover eq-account-menu">
              <div className="eq-account-identity">
                <strong>{user?.email}</strong>
                {companies?.find((c) => c?._id === companyId)?.ownerId === user?._id && user && (
                  <span>Admin</span>
                )}
              </div>
              <Link to="/dashboard">Your companies</Link>
              <Link to="/billing">Billing</Link>
              <a href="mailto:hello@capyinc.com">Contact support</a>
              <button
                onClick={async () => {
                  // Leave authenticated queries before ending their session.
                  await clearPendingImport().catch(() => {});
                  await navigate({ to: "/" });
                  const result = await authClient.signOut();
                  if (result.error) {
                    toast.error("Could not sign out. Please try again.");
                    await navigate({ to: "/dashboard" });
                  } else {
                    window.location.assign("/dashboard");
                  }
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
export function AccountHome() {
  const companies = useQuery(api.equity.companies);
  return (
    <div className="equity-app">
      <Topbar />
      <BillingNotice />
      <MyPortals />
      {companies && companies.length === 0 && <StartWithoutImport />}
      {!!companies?.length && (
        <section className="eq-company-cards">
          <h2>Your companies</h2>
          {companies.map(
            (c) =>
              c && (
                <Link
                  className="eq-company-card"
                  to="/companies/$companyId/$"
                  params={{ companyId: c._id, _splat: "dashboard" }}
                  key={c._id}
                >
                  <strong>{c.name}</strong>
                  <ChevronRight size={18} />
                </Link>
              ),
          )}
        </section>
      )}
      <ImportCompany />
    </div>
  );
}
export function CompanyApp({ companyId, path }: { companyId: string; path: string }) {
  const result = useQuery(api.equity.company, { companyId: companyId as Id<"companies"> });
  const [newMenu, setNewMenu] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const section = path.split("/")[0] || "dashboard";
  if (!result)
    return (
      <div className="equity-app">
        <Topbar companyId={companyId} />
        <main className="eq-main" role="status">
          Loading your cap table…
        </main>
      </div>
    );
  const expanded =
    open ??
    (groups.find((g) => g.path === section || g.children?.some((c) => c[1] === section))?.path ||
      "");
  return (
    <CompanyContext.Provider value={result}>
      <div className="equity-app">
        <Topbar companyId={companyId} />
        <BillingNotice />
        <div className="eq-body">
          <aside className="eq-sidebar">
            <div className="eq-menu-wrap">
              <button
                className="eq-button eq-new"
                aria-label="New"
                onClick={() => setNewMenu(!newMenu)}
              >
                <Plus size={14} />
                <span className="eq-nav-text">New</span>
              </button>
              {newMenu && (
                <div className="eq-popover">
                  {[
                    ["Stakeholder", "stakeholders/new"],
                    ["Security", "issuance"],
                    ["Share Class", "security_classes/new"],
                    ["Equity Plan", "equity_plans/new"],
                  ].map(([label, page]) => (
                    <div key={page} onClick={() => setNewMenu(false)}>
                      <CompanyLink page={page!}>{label}</CompanyLink>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="eq-nav-caption">ESSENTIALS</div>
            {groups.map((g) => (
              <div key={g.path}>
                <Link
                  className={`eq-nav-link ${section === g.path ? "active" : ""}`}
                  to="/companies/$companyId/$"
                  params={{ companyId, _splat: g.path }}
                  onClick={() => setOpen(g.children ? g.path : null)}
                  title={g.label}
                >
                  <g.icon />
                  <span className="eq-nav-text">{g.label}</span>
                  {g.children && <ChevronRight className="eq-chevron" />}
                </Link>
                {g.children && expanded === g.path && (
                  <div className="eq-subnav">
                    {g.children.map(([label, sub]) => (
                      <Link
                        className={`eq-nav-link ${section === sub ? "active" : ""}`}
                        key={sub}
                        to="/companies/$companyId/$"
                        params={{ companyId, _splat: sub! }}
                      >
                        {label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="eq-nav-caption">TOOLS</div>
            {[
              ["Communications Hub", "communications_hub", Send],
              ["% Share Calculator", "calculator", Calculator],
            ].map(([label, sub, Icon]) => {
              const I = Icon as typeof Send;
              return (
                <Link
                  title={String(label)}
                  key={String(sub)}
                  className={`eq-nav-link ${section === sub ? "active" : ""}`}
                  to="/companies/$companyId/$"
                  params={{ companyId, _splat: String(sub) }}
                >
                  <I />
                  <span className="eq-nav-text">{String(label)}</span>
                </Link>
              );
            })}
          </aside>
          <main className="eq-main">
            {section !== "dashboard" && (
              <nav className="eq-breadcrumb">
                <CompanyLink page="dashboard">{result.company.name}</CompanyLink>
                <ChevronRight size={12} />
                <span>{pageTitles[section] || section.replaceAll("_", " ")}</span>
              </nav>
            )}
            <CompanyPage key={path} path={path || "dashboard"} />
          </main>
        </div>
      </div>
    </CompanyContext.Provider>
  );
}
function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="eq-page-header">
      <h1>{title}</h1>
      <div className="eq-actions">{children}</div>
    </div>
  );
}
function ExportButton() {
  const { data } = useCompany();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        className="eq-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await downloadCapTable(data);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Export failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download size={17} />
        {busy ? "Preparing…" : "Download"}
      </button>
      {error && (
        <span role="alert" className="eq-error">
          {error}
        </span>
      )}
    </>
  );
}
function CompanyPage({ path }: { path: string }) {
  const { company } = useCompany();
  const [section, id] = path.split("/");
  if (recordSections.includes(section || "")) return <RecordsPage section={section} />;
  switch (section) {
    case "dashboard":
      return <Dashboard />;
    case "captable":
      return <CapTable />;
    case "stakeholders":
      return id ? <StakeholderDetail personKey={id} /> : <Stakeholders />;
    case "securities":
    case "convertibles":
      return <SecurityDetail securityKey={decodeURIComponent(id || "")} />;
    case "security_classes":
      return <ShareClasses selected={id ? decodeURIComponent(id) : undefined} />;
    case "equity_plans":
      return <EquityPlans selected={id ? decodeURIComponent(id) : undefined} />;
    case "vesting_schedules":
      return <VestingPage />;
    case "profile":
      return <Profile />;
    case "auditLog":
      return <Activity />;
    case "imports":
      return <ImportReport />;
    case "import":
      return <ImportCompany companyId={company._id} />;
    case "calculator":
      return <CalculatorPage />;
    case "issuance":
      return (
        <SecurityForm
          key={id || "new"}
          initialKind={id === "new-safe" ? "safe" : id === "new-option" ? "option" : "share"}
          securityKey={id && !id.startsWith("new-") ? decodeURIComponent(id) : undefined}
        />
      );
    case "data_room":
      return <DataRoom />;
    case "report_generator":
      return <Reports />;
    case "fundraising":
      return <Fundraising />;
    case "compliance":
      return <Compliance />;
    case "hire_and_retain":
      return <HireAndRetain />;
    case "stakeholder_portal":
      return <PortalManager />;
    case "securities_status":
      return <SecuritiesStatus />;
    case "certificates":
      return <SecuritiesStatus certificates />;
    case "service-requests":
    case "sbcReports":
    case "liquidity":
    case "tender_offers":
    case "dataSharingRequests":
      return (
        <Navigate
          to="/companies/$companyId/$"
          params={{ companyId: company._id, _splat: "dashboard" }}
          replace
        />
      );
    default:
      return <MissingPage />;
  }
}
function Dashboard() {
  const user = useQuery(api.auth.getCurrentUser);
  const { company, data, totals: t, activity } = useCompany();
  const documents = useQuery(api.records.list, { companyId: company._id, kind: "document" });
  // Pulley writes relationships as "Ex Employee", "EX_EMPLOYEE" or "Ex-Employee", so compare letters only.
  const relationship = (p: Stakeholder) => p.relationship.toLowerCase().replace(/[^a-z]/g, "");
  const groups: [string, string, string[]][] = [
    ["Founders", "#1b4c40", ["founder"]],
    ["Employees", "#a9d6bc", ["employee"]],
    ["Former Employees", "#dce7e1", ["exemployee", "formeremployee"]],
    ["Advisors", "#dcd9ee", ["advisor", "boardmember"]],
    ["Consultants", "#b9cbbf", ["consultant"]],
    ["Investors", "#7e9b8c", ["investor"]],
    ["Others", "#c9d3cd", ["other"]],
  ];
  const grouped = new Set(groups.flatMap(([, , kinds]) => kinds));
  const sharesOf = (people: Stakeholder[]) =>
    sum(people.map((p) => stakeholderShares(data.securities, p.key)));
  const breakdown = [
    ...groups.map(([label, color, kinds]) => ({
      label,
      color,
      shares: sharesOf(data.stakeholders.filter((p) => kinds.includes(relationship(p)))),
    })),
    { label: "Available", color: "#ededed", shares: t.available },
    {
      label: "Unknown",
      color: "#d5dbd7",
      shares: sharesOf(data.stakeholders.filter((p) => !grouped.has(relationship(p)))),
    },
  ];
  const holders = new Set(
    data.securities.filter((s) => D(s.outstanding).gt(0)).map((s) => s.stakeholderKey),
  );
  const missingEmails = data.stakeholders.some((p) => holders.has(p.key) && !p.email);
  const hasDocuments = !!documents?.length;
  let cursor = 0;
  const gradient = breakdown
    .map((b) => {
      const start = cursor;
      cursor += Number(percentage(b.shares, t.fullyDiluted));
      return `${b.color} ${start}% ${cursor}%`;
    })
    .join(",");
  const top = [
    ...data.stakeholders.map((p) => ({
      key: p.key,
      name: p.name,
      shares: stakeholderShares(data.securities, p.key),
      path: `stakeholders/${p.key}`,
    })),
    ...data.plans.map((p) => ({
      key: p.name,
      name: `Available ${p.name}`,
      shares: p.available,
      path: `equity_plans/${encodeURIComponent(p.name)}`,
    })),
  ]
    .sort((a, b) => D(b.shares).cmp(a.shares))
    .slice(0, 5);
  return (
    <div className="eq-dashboard-grid">
      <div className="eq-dashboard-column">
        <section className="eq-panel eq-dashboard-card eq-overview">
          <div>
            <h1>{data.name}</h1>
            <p className="eq-muted">
              {data.sheets.length ? "Cap table imported as of" : "Cap table as of"}{" "}
              {date(data.asOf)}
            </p>
            <p>
              <strong>{money(t.capital)}</strong> Total Capital Contribution
            </p>
            <p>
              <strong>{number(t.fullyDiluted)}</strong> Fully Diluted Shares
            </p>
            <p>
              <strong>{t.stakeholdersWithSecurities}</strong> Stakeholders with Securities
            </p>
          </div>
          <div>
            <ExportButton />
          </div>
        </section>
        <section className="eq-panel eq-dashboard-card">
          <div className="eq-card-title">
            <h2>Employee Equity</h2>
            <CompanyLink page="equity_plans">See More</CompanyLink>
          </div>
          {data.plans.length === 0 && (
            <p className="eq-muted" style={{ marginBottom: 20 }}>
              Add an equity plan to track employee grants and available shares.
            </p>
          )}
          <div className="eq-plan-legend">
            <span>
              <i />
              Granted
            </span>
            <span>
              <i />
              Available
            </span>
          </div>
          {data.plans.map((p) => {
            const granted = D(p.authorized).minus(p.available).toFixed();
            return (
              <div className="eq-plan-row" key={p.name}>
                <div className="eq-plan-top">
                  <CompanyLink page={`equity_plans/${encodeURIComponent(p.name)}`}>
                    {p.name}
                  </CompanyLink>
                  <span>
                    {number(granted)} Granted ({percentage(granted, p.authorized, 2)}%) &nbsp;{" "}
                    {number(p.available)} Available ({percentage(p.available, p.authorized, 2)}%)
                  </span>
                </div>
                <div className="eq-progress">
                  <div style={{ width: percentage(granted, p.authorized) + "%" }} />
                </div>
              </div>
            );
          })}
          <div className="eq-callout">
            <CompanyLink page="offer_letters_v2">Prepare an offer</CompanyLink> or{" "}
            <CompanyLink page="issuance/new-option">grant options</CompanyLink> to new employees.
          </div>
        </section>
        <section className="eq-panel eq-dashboard-card">
          <div className="eq-card-title">
            <h2>Ownership</h2>
            <CompanyLink page="stakeholders">See More</CompanyLink>
          </div>
          <div className="eq-ownership">
            <div className="eq-donut" style={{ background: `conic-gradient(${gradient})` }} />
            <div className="eq-legend">
              {breakdown
                .filter((b) => D(b.shares).gt(0))
                .map((b) => (
                  <div key={b.label}>
                    <i style={{ background: b.color }} />
                    <strong>{b.label}</strong>
                    <span>{percentage(b.shares, t.fullyDiluted, 2)}%</span>
                  </div>
                ))}
            </div>
          </div>
          <h3 style={{ marginBottom: 12 }}>Top Stakeholders</h3>
          <DataTable
            searchable={false}
            rows={top}
            columns={[
              {
                key: "name",
                label: "Stakeholder",
                value: (r) => r.name,
                render: (r) => <CompanyLink page={r.path}>{r.name}</CompanyLink>,
              },
              {
                key: "shares",
                label: "Fully Diluted",
                value: (r) => r.shares,
                render: (r) => number(r.shares),
              },
              {
                key: "ownership",
                label: "Ownership",
                value: (r) => percentage(r.shares, t.fullyDiluted),
                render: (r) => percentage(r.shares, t.fullyDiluted) + "%",
              },
            ]}
          />
        </section>
      </div>
      <div className="eq-dashboard-column">
        <section className="eq-panel eq-dashboard-card">
          <h2 style={{ marginBottom: 20 }}>In-progress securities</h2>
          <CompanyLink page="securities_status">Review securities status</CompanyLink>
        </section>
        <section className="eq-panel eq-dashboard-card">
          <h2 style={{ marginBottom: 20 }}>Reminders</h2>
          <div className="eq-reminder">
            <CompanyLink page="imports">
              {data.sheets.length ? "Review your import" : "Import your cap table"}
            </CompanyLink>
            <p>
              {!data.sheets.length
                ? "Bring your existing records over whenever you’re ready."
                : hasDocuments
                  ? "See what came over from Pulley."
                  : "See what came over from Pulley and get help with a fuller import."}
            </p>
          </div>
          {missingEmails && (
            <div className="eq-reminder">
              <CompanyLink page="stakeholders">Complete stakeholder profiles</CompanyLink>
              <p>Add emails and contact information for your employees and investors.</p>
            </div>
          )}
          {documents && !hasDocuments && (
            <div className="eq-reminder">
              <CompanyLink page="data_room">Upload company documents</CompanyLink>
              <p>Keep your signed agreements and supporting documents together.</p>
            </div>
          )}
          <div className="eq-reminder">
            <CompanyLink page="profile">Edit Company Profile</CompanyLink>
            <p>Keep your company details up to date.</p>
          </div>
        </section>
        <section className="eq-panel eq-dashboard-card">
          <div className="eq-card-title">
            <h2>Recent Activity</h2>
            <CompanyLink page="auditLog">See More</CompanyLink>
          </div>
          {activity.slice(0, 5).map((a) => (
            <p
              key={a._id}
              style={{ fontSize: 12, padding: "12px 0", borderBottom: "1px solid #eee" }}
            >
              {a.description}
              <br />
              <span className="eq-muted">
                {a.actor === user?.name || a.actor === user?.email ? "You" : a.actor} ·{" "}
                {new Date(a._creationTime).toLocaleDateString()}
              </span>
            </p>
          ))}
        </section>
      </div>
    </div>
  );
}
function securityColumns(data: CompanyView, kind = "all"): Column<Security>[] {
  const who = (s: Security) =>
    data.data.stakeholders.find((p) => p.key === s.stakeholderKey)?.name || "Unknown";
  const common: Column<Security>[] = [
    {
      key: "certificate",
      label: "Certificate",
      value: (s) => s.certificate,
      render: (s) => (
        <>
          <CompanyLink
            page={`${isConvertible(s) ? "convertibles" : "securities"}/${encodeURIComponent(s.key)}`}
          >
            {s.certificate}
          </CompanyLink>
          {s.status !== "Outstanding" && <span className="eq-badge">{s.status.toUpperCase()}</span>}
        </>
      ),
    },
    {
      key: "stakeholder",
      label: "Stakeholder",
      value: who,
      render: (s) => <CompanyLink page={`stakeholders/${s.stakeholderKey}`}>{who(s)}</CompanyLink>,
    },
  ];
  if (kind === "safe" || kind === "note")
    return [
      ...common,
      {
        key: "principal",
        label: "Principal",
        value: (s) => s.issued,
        render: (s) => money(s.issued),
      },
      {
        key: "outstanding",
        label: "Outstanding",
        value: (s) => s.outstanding,
        render: (s) => money(s.outstanding),
      },
      {
        key: "issuedOn",
        label: "Issued On",
        value: (s) => s.issuedOn,
        render: (s) => date(s.issuedOn),
      },
      {
        key: "cap",
        label: "Valuation Cap",
        value: (s) => s.fields["Valuation Cap"] || "",
        render: (s) => money(s.fields["Valuation Cap"] || null),
      },
      {
        key: "conversion",
        label: "Conversion Type",
        value: (s) => s.fields["Conversion Type"] || "—",
      },
    ];
  return [
    ...common,
    {
      key: "className",
      label: "Share Class",
      value: (s) => s.className,
      render: (s) => (
        <CompanyLink page={`security_classes/${encodeURIComponent(s.className)}`}>
          {s.className || "—"}
        </CompanyLink>
      ),
    },
    {
      key: "issuedOn",
      label: "Issued On",
      value: (s) => s.issuedOn,
      render: (s) => date(s.issuedOn),
    },
    {
      key: "outstanding",
      label: "Fully Diluted",
      value: (s) => s.outstanding,
      render: (s) => number(s.outstanding),
    },
    {
      key: "ownership",
      label: "Ownership",
      value: (s) => percentage(s.outstanding, data.totals.fullyDiluted),
      render: (s) => percentage(s.outstanding, data.totals.fullyDiluted) + "%",
    },
    {
      key: "price",
      label: "Price / Share",
      value: (s) => (s.kind === "share" ? s.price : null),
      render: (s) => (s.kind === "share" ? money(s.price) : "—"),
    },
    {
      key: "exercise",
      label: "Exercise Price",
      value: (s) => (s.kind !== "share" ? s.price : null),
      render: (s) => (s.kind !== "share" ? money(s.price) : "—"),
    },
    { key: "status", label: "Status", value: (s) => s.status, hidden: true },
    { key: "plan", label: "Equity Plan", value: (s) => s.planName, hidden: true },
  ];
}
function CapTable() {
  const view = useCompany();
  const { data, totals: t } = view;
  const [tab, setTab] = useState("ownership");
  const kinds = [...new Set(data.securities.map((s) => s.kind))];
  const labels: Record<string, string> = {
    share: "Shares",
    option: "Options",
    safe: "SAFEs",
    note: "Convertible Notes",
    rsa: "RSAs",
    rsu: "RSUs",
    warrant: "Warrants",
    piu: "Profit Interests",
  };
  const people = [...data.stakeholders].sort((a, b) => a.name.localeCompare(b.name));
  const stock = (p: Stakeholder) =>
    sum(
      data.securities
        .filter((s) => s.stakeholderKey === p.key && s.kind === "share")
        .map((s) => s.outstanding),
    );
  const ownership: Column<Stakeholder>[] = [
    { key: "external", label: "External ID", value: (p) => p.externalId || "—" },
    {
      key: "name",
      label: "Stakeholder",
      value: (p) => p.name,
      render: (p) => <CompanyLink page={`stakeholders/${p.key}`}>{p.name}</CompanyLink>,
    },
    { key: "relationship", label: "Stakeholder Type", value: (p) => p.relationship || "—" },
    ...data.classes.map((c) => ({
      key: c.name,
      label: c.name,
      value: (p: Stakeholder) =>
        sum(
          data.securities
            .filter(
              (s) => s.kind === "share" && s.className === c.name && s.stakeholderKey === p.key,
            )
            .map((s) => s.outstanding),
        ),
      render: (p: Stakeholder) => {
        const value = sum(
          data.securities
            .filter(
              (s) => s.kind === "share" && s.className === c.name && s.stakeholderKey === p.key,
            )
            .map((s) => s.outstanding),
        );
        return D(value).eq(0) ? "—" : number(value);
      },
    })),
    {
      key: "stock",
      label: "Issued and Outstanding",
      value: stock,
      render: (p) => number(stock(p)),
    },
    {
      key: "stockPercent",
      label: "Issued and Outstanding % Ownership",
      value: (p) => percentage(stock(p), t.outstandingStock, 2) + "%",
    },
    ...data.plans.map((plan) => ({
      key: plan.name,
      label: plan.name,
      value: (p: Stakeholder) =>
        sum(
          data.securities
            .filter(
              (s) => s.stakeholderKey === p.key && s.planName === plan.name && s.kind !== "share",
            )
            .map((s) => s.outstanding),
        ),
      render: (p: Stakeholder) =>
        number(
          sum(
            data.securities
              .filter(
                (s) => s.stakeholderKey === p.key && s.planName === plan.name && s.kind !== "share",
              )
              .map((s) => s.outstanding),
          ),
        ),
    })),
    {
      key: "fd",
      label: "Fully Diluted",
      value: (p) => stakeholderShares(data.securities, p.key),
      render: (p) => number(stakeholderShares(data.securities, p.key)),
    },
    {
      key: "fdp",
      label: "Fully Diluted % Ownership",
      value: (p) => percentage(stakeholderShares(data.securities, p.key), t.fullyDiluted, 2) + "%",
    },
  ];
  return (
    <section className="eq-panel">
      <PageHeader title="Cap Table">
        <ExportButton />
        <CompanyLink page="issuance">
          <span className="eq-button eq-primary">
            Record Security <Plus size={14} />
          </span>
        </CompanyLink>
      </PageHeader>
      <div className="eq-tabs">
        <button className={tab === "ownership" ? "active" : ""} onClick={() => setTab("ownership")}>
          Ownership
        </button>
        {kinds.map((kind) => (
          <button key={kind} className={tab === kind ? "active" : ""} onClick={() => setTab(kind)}>
            {labels[kind]} ({data.securities.filter((s) => s.kind === kind).length})
          </button>
        ))}
      </div>
      {tab === "ownership" ? (
        <>
          <div className="eq-stats">
            {[
              ...data.classes.map((c) => [
                c.name + " Issued",
                sum(
                  data.securities
                    .filter((s) => s.kind === "share" && s.className === c.name)
                    .map((s) => s.outstanding),
                ),
              ]),
              ["Issued and Outstanding", t.outstandingStock],
              ["Issued and Outstanding % Ownership", "100"],
              ...data.plans.map((p) => [
                p.name,
                sum(
                  data.securities
                    .filter((s) => s.planName === p.name && s.kind !== "share")
                    .map((s) => s.outstanding),
                ),
              ]),
              ["Fully Diluted", t.fullyDiluted],
              ["Available", t.available],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>
                  {label?.includes("% Ownership") ? number(value, 2) + "%" : number(value)}
                </strong>
              </div>
            ))}
          </div>
          <DataTable key="ownership" rows={people} columns={ownership} />
        </>
      ) : (
        <DataTable
          key={tab}
          rows={data.securities.filter((s) => s.kind === tab)}
          columns={securityColumns(view, tab)}
        />
      )}
    </section>
  );
}
function Stakeholders() {
  const view = useCompany();
  const search = useLocation({ select: (location) => decodeURIComponent(location.hash) });
  return (
    <section className="eq-panel">
      <PageHeader title="Stakeholders">
        <ContactImport />
        <CompanyLink page="stakeholders/new">
          <span className="eq-button eq-primary">Add Stakeholder</span>
        </CompanyLink>
      </PageHeader>
      <DataTable
        key={search}
        initialSearch={search}
        rows={view.data.stakeholders}
        columns={[
          {
            key: "name",
            label: "Name",
            value: (p) => p.name,
            render: (p) => <CompanyLink page={`stakeholders/${p.key}`}>{p.name}</CompanyLink>,
          },
          { key: "email", label: "Email", value: (p) => p.email || "—" },
          { key: "relationship", label: "Relationship", value: (p) => p.relationship || "—" },
          { key: "type", label: "Type", value: (p) => p.entityType || "—" },
          {
            key: "fd",
            label: "Fully Diluted Shares",
            value: (p) => stakeholderShares(view.data.securities, p.key),
            render: (p) => number(stakeholderShares(view.data.securities, p.key)),
          },
          {
            key: "ownership",
            label: "Ownership",
            value: (p) =>
              percentage(stakeholderShares(view.data.securities, p.key), view.totals.fullyDiluted) +
              "%",
          },
        ]}
      />
    </section>
  );
}
function StakeholderDetail({ personKey }: { personKey: string }) {
  const view = useCompany(),
    record = view.people.find((p) => p.key === personKey);
  const [editing, setEditing] = useState(personKey === "new");
  const navigate = useNavigate();
  const save = useMutation(api.equity.saveStakeholder);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Stakeholder>(
    record?.data || {
      key: "",
      name: "",
      email: "",
      relationship: "",
      entityType: "Individual",
      externalId: "",
    },
  );
  const p = record?.data;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const key = await save({
        companyId: view.company._id,
        id: record?._id,
        revision: record?.revision,
        data: draft,
      });
      setEditing(false);
      if (!record)
        await navigate({
          to: "/companies/$companyId/$",
          params: { companyId: view.company._id, _splat: `stakeholders/${key}` },
        });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="eq-panel">
        <PageHeader title={p?.name || "New Stakeholder"}>
          <button className="eq-button" onClick={() => setEditing(true)}>
            Edit Stakeholder
          </button>
        </PageHeader>
        {p && (
          <>
            <dl className="eq-detail-grid">
              {[
                ["Name", p.name],
                ["Email", p.email || "—"],
                ["Relationship", p.relationship || "—"],
                ["Type", p.entityType || "—"],
                [
                  "Address",
                  [
                    p.fields?.Address,
                    p.fields?.City,
                    p.fields?.State,
                    p.fields?.["Zip Code"],
                    p.fields?.Country,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—",
                ],
                ["External ID", p.externalId || "—"],
                ["Fully Diluted Shares", number(stakeholderShares(view.data.securities, p.key))],
                [
                  "Ownership",
                  percentage(
                    stakeholderShares(view.data.securities, p.key),
                    view.totals.fullyDiluted,
                  ) + "%",
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <section className="eq-section">
              <h2>Securities</h2>
              <DataTable
                rows={view.data.securities.filter((s) => s.stakeholderKey === p.key)}
                columns={securityColumns(view)}
              />
            </section>
          </>
        )}
      </section>
      {editing && (
        <Modal
          title={record ? "Edit Stakeholder" : "Add Stakeholder"}
          onClose={() => setEditing(false)}
        >
          <form onSubmit={submit}>
            <div className="eq-form-grid">
              <Field label="Name">
                <input
                  required
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </Field>
              <Field label="Relationship">
                <select
                  value={draft.relationship}
                  onChange={(e) => setDraft({ ...draft, relationship: e.target.value })}
                >
                  {[
                    "",
                    "Founder",
                    "Employee",
                    "Ex-Employee",
                    "Advisor",
                    "Investor",
                    "Consultant",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Type">
                <select
                  value={draft.entityType}
                  onChange={(e) => setDraft({ ...draft, entityType: e.target.value })}
                >
                  {["", "Individual", "Institution"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="External ID">
                <input
                  value={draft.externalId}
                  onChange={(e) => setDraft({ ...draft, externalId: e.target.value })}
                />
              </Field>
            </div>
            {error && <p className="eq-error">{error}</p>}
            <div className="eq-form-actions">
              <button type="button" className="eq-button" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button disabled={busy} className="eq-button eq-primary">
                Save Stakeholder
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function DetailList({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return (
    <section className="eq-detail-section">
      <h3>{title}</h3>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
const today = () => new Date().toISOString().slice(0, 10);
const kindTitles: Record<Security["kind"], string> = {
  share: "Shares",
  option: "Options",
  rsa: "Restricted Stock Award",
  rsu: "RSUs",
  warrant: "Warrant",
  piu: "Profit Interest",
  safe: "SAFE",
  note: "Convertible Note",
};
function VestingEvents({ security }: { security: Security }) {
  const now = today();
  let total = D(0);
  const rows = security.vestEvents!.map((e, i) => {
    total = total.plus(e.shares);
    return { ...e, key: String(i), cumulative: total.toFixed() };
  });
  const vested = rows.filter((e) => e.date <= now).length;
  return (
    <details className="eq-section">
      <summary>
        Vesting events ({vested} vested, {rows.length - vested} upcoming)
      </summary>
      <DataTable
        rows={rows}
        columns={[
          { key: "date", label: "Date", value: (e) => e.date, render: (e) => date(e.date) },
          {
            key: "shares",
            label: "Shares",
            value: (e) => e.shares,
            render: (e) => number(e.shares),
          },
          {
            key: "cumulative",
            label: "Total Vested",
            value: (e) => e.cumulative,
            render: (e) => number(e.cumulative),
          },
          {
            key: "status",
            label: "Status",
            value: (e) => (e.date <= now ? "Vested" : "Upcoming"),
          },
        ]}
      />
    </details>
  );
}
function SecurityDetail({ securityKey }: { securityKey: string }) {
  const { data } = useCompany();
  const s = data.securities.find((s) => s.key === securityKey);
  if (!s) return <Empty title="Security not found" />;
  const p = data.stakeholders.find((p) => p.key === s.stakeholderKey);
  const convertible = isConvertible(s);
  const overview: [string, ReactNode][] = convertible
    ? [
        ["Principal", money(s.issued)],
        ["Outstanding", money(s.outstanding)],
        ["Issued On", date(s.issuedOn)],
        ["Valuation Cap", money(s.fields["Valuation Cap"] || null)],
        ["Conversion Discount", s.fields["Conversion Discount"]],
        ["Conversion Type", s.fields["Conversion Type"]],
        ["Interest Rate", s.fields["Interest Rate"]],
        ["Maturity Date", s.fields["Maturity Date"]],
      ]
    : [
        ["Fully Diluted", number(s.outstanding) + " shares"],
        ["Issued", number(s.issued) + " shares"],
        [s.kind === "share" ? "Price per Share" : "Exercise Price", money(s.price)],
        ["Capital Contribution", money(s.capital)],
        ["Issue Date", date(s.issuedOn)],
      ];
  return (
    <section className="eq-panel">
      <PageHeader title={`${s.certificate} ${kindTitles[s.kind]}`}>
        <span className="eq-badge">{s.status.toUpperCase()}</span>
        <SecurityActions securityKey={s.key} />
        <CompanyLink page={`issuance/${encodeURIComponent(s.key)}`}>
          <span className="eq-button eq-primary">Edit Security</span>
        </CompanyLink>
      </PageHeader>
      <div className="eq-detail-columns">
        <DetailList title="Overview" rows={overview} />
        <DetailList
          title="Stakeholder"
          rows={[
            [
              "Stakeholder",
              <CompanyLink page={`stakeholders/${s.stakeholderKey}`}>{p?.name || "—"}</CompanyLink>,
            ],
            ["Email", p?.email || "—"],
            ["Status", s.status],
          ]}
        />
      </div>
      <DetailList
        title="Details"
        rows={[
          [
            "Share Class",
            s.className ? (
              <CompanyLink page={`security_classes/${encodeURIComponent(s.className)}`}>
                {s.className}
              </CompanyLink>
            ) : (
              "—"
            ),
          ],
          [
            "Equity Plan",
            s.planName ? (
              <CompanyLink page={`equity_plans/${encodeURIComponent(s.planName)}`}>
                {s.planName}
              </CompanyLink>
            ) : (
              "—"
            ),
          ],
          ...[
            "Board Approval Date",
            "Federal Exemption",
            "State Exemption",
            "Acceleration",
            "Acceleration Provisions",
            "Rule 144 Date",
            "Source",
          ].map((k) => [k, s.fields[k]] as [string, ReactNode]),
        ]}
      />
      {!convertible && (
        <DetailList
          title="Vesting"
          rows={[
            [
              "Vesting Progress",
              s.vested !== null ? (
                <>
                  <p>
                    {number(s.vested)} of {number(s.issued)} shares (
                    {percentage(s.vested, s.issued, 1)}%) vested as of{" "}
                    {date(s.balanceAsOf || data.asOf)}.
                  </p>
                  <div className="eq-progress" style={{ marginTop: 12 }}>
                    <div style={{ width: percentage(s.vested, s.issued) + "%" }} />
                  </div>
                </>
              ) : (
                "—"
              ),
            ],
            ...(s.vestEvents?.length
              ? ([["Vested Today", number(projectedVested(s, data.asOf, today()))]] as [
                  string,
                  ReactNode,
                ][])
              : []),
            ["Schedule Name", s.vestingSchedule],
            ["Start Date", date(s.vestingStart)],
          ]}
        />
      )}
      {!convertible && !!s.vestEvents?.length && <VestingEvents security={s} />}
      <DetailList
        title="Additional Information"
        rows={[
          ["Comments", s.fields.Comments],
          ["Source", `${s.sourceSheet}, row ${s.sourceRow}`],
        ]}
      />
      <details className="eq-section">
        <summary>All imported fields</summary>
        <dl className="eq-detail-grid" style={{ marginTop: 24 }}>
          {Object.entries(s.fields).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v || "—"}</dd>
            </div>
          ))}
        </dl>
      </details>
      <section className="eq-section">
        <h3>Attachments</h3>
        <LinkedDocuments certificate={s.certificate}>
          <p className="eq-muted" style={{ marginBottom: 16 }}>
            Document names are included in your export. To bring over the files,{" "}
            <a href="mailto:hello@capyinc.com?subject=Full%20Pulley%20import">
              request a full import
            </a>{" "}
            or upload them to the Data Room.
          </p>
          {s.fields.Documents && <p>{s.fields.Documents}</p>}
        </LinkedDocuments>
        <CompanyLink page="data_room">Open Data Room</CompanyLink>
      </section>
    </section>
  );
}
function ShareClasses({ selected }: { selected?: string }) {
  const view = useCompany();
  const { data } = view;
  const c = data.classes.find((c) => c.name === selected);
  const [editing, setEditing] = useState(selected === "new");
  return (
    <section className="eq-panel">
      <PageHeader title={c?.name || "Share Classes"}>
        <button className="eq-button eq-primary" onClick={() => setEditing(true)}>
          {c ? "Edit Share Class" : "Add a Share Class"}
        </button>
      </PageHeader>
      {editing && (
        <ConfigurationForm kind="class" selected={c?.name} onClose={() => setEditing(false)} />
      )}
      {c ? (
        <>
          <dl className="eq-detail-grid">
            {[
              ["Name", c.name],
              ["Type", c.kind],
              ["Authorized", number(c.authorized)],
              [
                "Outstanding",
                number(
                  sum(
                    data.securities
                      .filter((s) => s.kind === "share" && s.className === c.name)
                      .map((s) => s.outstanding),
                  ),
                ),
              ],
              ["Capital Contribution", money(c.capital)],
              ["Par Value", money(c.parValue ?? null)],
              ["Price per Share", money(c.pricePerShare ?? null)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="eq-section">
            <DataTable
              rows={data.securities.filter((s) => s.className === c.name)}
              columns={securityColumns(view)}
            />
          </div>
        </>
      ) : (
        <DataTable
          rows={data.classes.map((c) => ({ ...c, key: c.name }))}
          columns={[
            {
              key: "name",
              label: "Name",
              value: (c) => c.name,
              render: (c) => (
                <CompanyLink page={`security_classes/${encodeURIComponent(c.name)}`}>
                  {c.name}
                </CompanyLink>
              ),
            },
            { key: "kind", label: "Share Class", value: (c) => c.kind },
            {
              key: "parValue",
              label: "Par Value",
              value: (c) => c.parValue ?? null,
              render: (c) => money(c.parValue ?? null),
            },
            {
              key: "pricePerShare",
              label: "Price per Share",
              value: (c) => c.pricePerShare ?? null,
              render: (c) => money(c.pricePerShare ?? null),
            },
            {
              key: "authorized",
              label: "Authorized Shares",
              value: (c) => c.authorized,
              render: (c) => (
                <>
                  {number(c.authorized)}
                  <small style={{ display: "block", fontSize: 11, marginTop: 4 }}>
                    {number(
                      sum(
                        data.securities
                          .filter((s) => s.kind === "share" && s.className === c.name)
                          .map((s) => s.outstanding),
                      ),
                    )}{" "}
                    outstanding
                  </small>
                </>
              ),
            },
            {
              key: "outstanding",
              label: "Outstanding",
              hidden: true,
              value: (c) =>
                sum(
                  data.securities
                    .filter((s) => s.kind === "share" && s.className === c.name)
                    .map((s) => s.outstanding),
                ),
              render: (c) =>
                number(
                  sum(
                    data.securities
                      .filter((s) => s.kind === "share" && s.className === c.name)
                      .map((s) => s.outstanding),
                  ),
                ),
            },
          ]}
        />
      )}
    </section>
  );
}
function EquityPlans({ selected }: { selected?: string }) {
  const view = useCompany();
  const { data } = view;
  const plan = data.plans.find((p) => p.name === selected);
  const [editing, setEditing] = useState(selected === "new");
  return (
    <section className="eq-panel">
      <PageHeader title={plan?.name || "Equity Plans"}>
        <button className="eq-button eq-primary" onClick={() => setEditing(true)}>
          {plan ? "Edit Equity Plan" : "Add Equity Plan"}
        </button>
      </PageHeader>
      {editing && (
        <ConfigurationForm kind="plan" selected={plan?.name} onClose={() => setEditing(false)} />
      )}
      {plan ? (
        <>
          <div className="eq-stats">
            {[
              ["Plan Size", plan.authorized],
              ["Available", plan.available],
              ["Granted", D(plan.authorized).minus(plan.available).toFixed()],
            ].map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <strong>{number(v)}</strong>
              </div>
            ))}
          </div>
          <DataTable
            rows={data.securities.filter((s) => s.planName === plan.name && s.kind !== "share")}
            columns={securityColumns(view)}
          />
        </>
      ) : (
        <DataTable
          rows={data.plans.map((p) => ({ ...p, key: p.name }))}
          columns={[
            {
              key: "name",
              label: "Name",
              value: (p) => p.name,
              render: (p) => (
                <CompanyLink page={`equity_plans/${encodeURIComponent(p.name)}`}>
                  {p.name}
                </CompanyLink>
              ),
            },
            { key: "class", label: "Share Class", value: (p) => p.className, hidden: true },
            { key: "status", label: "Status", value: (p) => p.status || "Outstanding" },
            {
              key: "boardApproval",
              label: "Board approval",
              value: (p) => p.boardApproval || "—",
              render: (p) => date(p.boardApproval || ""),
            },
            {
              key: "size",
              label: "Plan Size",
              value: (p) => p.authorized,
              render: (p) => (
                <>
                  {number(p.authorized)} shares
                  <br />
                  <span className="eq-muted">{number(p.available)} available</span>
                </>
              ),
            },
            {
              key: "ownership",
              label: "Ownership",
              value: (p) => percentage(p.authorized, view.totals.fullyDiluted) + "%",
            },
            {
              key: "term",
              label: "Term of Plan",
              value: (p) => (p.termYears ? `${p.termYears} years` : "—"),
            },
          ]}
        />
      )}
    </section>
  );
}
function Profile() {
  const { company } = useCompany();
  const [edit, setEdit] = useState(false),
    [name, setName] = useState(company.name),
    [profile, setProfile] = useState<Record<string, string>>(company.profile),
    [error, setError] = useState("");
  const save = useMutation(api.equity.saveProfile);
  const labels = [
    "Legal Name",
    "State of Incorporation",
    "Address",
    "Timezone",
    "Incorporation Date",
    "Comments",
  ];
  return (
    <section className="eq-panel">
      <PageHeader title="Company Profile">
        <button className="eq-button" onClick={() => setEdit(true)}>
          Edit Company Profile
        </button>
      </PageHeader>
      <dl className="eq-detail-grid">
        {[["Company Name", company.name], ...labels.map((k) => [k, company.profile[k] || "—"])].map(
          ([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ),
        )}
      </dl>
      {edit && (
        <Modal title="Edit Company Profile" onClose={() => setEdit(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await save({ companyId: company._id, name, profile });
                setEdit(false);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            <Field label="Company Name">
              <input required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            {labels.map((k) => (
              <Field key={k} label={k}>
                <input
                  value={profile[k] || ""}
                  onChange={(e) => setProfile({ ...profile, [k]: e.target.value })}
                />
              </Field>
            ))}
            {error && <p className="eq-error">{error}</p>}
            <button className="eq-button eq-primary">Save Profile</button>
          </form>
        </Modal>
      )}
    </section>
  );
}
function Activity() {
  const user = useQuery(api.auth.getCurrentUser);
  const { activity } = useCompany();
  return (
    <section className="eq-panel">
      <PageHeader title="Recent Activity" />
      <DataTable
        rows={activity.map((a) => ({ ...a, key: a._id }))}
        columns={[
          {
            key: "date",
            label: "Date",
            value: (a) => a._creationTime,
            render: (a) => new Date(a._creationTime).toLocaleString(),
          },
          { key: "activity", label: "Activity", value: (a) => a.description },
          {
            key: "actor",
            label: "User",
            value: (a) => (a.actor === user?.name || a.actor === user?.email ? "You" : a.actor),
          },
        ]}
      />
    </section>
  );
}
function ImportReport() {
  const { data } = useCompany();
  if (!data.sheets.length)
    return (
      <section className="eq-panel">
        <PageHeader title="Import your cap table" />
        <p>Bring your existing cap table into this company when you’re ready.</p>
        {!data.securities.length &&
        !data.stakeholders.length &&
        !data.classes.length &&
        !data.plans.length ? (
          <p style={{ marginTop: 24 }}>
            <CompanyLink page="import">
              <span className="eq-button eq-primary">Choose Pulley export</span>
            </CompanyLink>
          </p>
        ) : (
          <p className="eq-muted" style={{ marginTop: 16 }}>
            You’ve started adding records. Contact us for help combining them with your Pulley
            export.
          </p>
        )}
        <ImportHelp detailed />
      </section>
    );

  return (
    <section className="eq-panel">
      <PageHeader title="Import Report">
        <ExportButton />
      </PageHeader>
      <p>
        {data.securities.length} securities, {data.stakeholders.length} stakeholders and{" "}
        {data.plans.length} equity plans imported as of {date(data.asOf)}.
      </p>
      <ImportHelp detailed />
      <div className="eq-import-notes">
        <h3>Import notes</h3>
        <ul>
          {data.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
      <DataTable
        rows={data.sheets.map((s) => ({ ...s, key: s.name }))}
        columns={[
          { key: "name", label: "Sheet", value: (s) => s.name },
          { key: "kind", label: "Contents", value: (s) => s.kind },
          { key: "rows", label: "Rows", value: (s) => s.rows },
        ]}
      />
    </section>
  );
}
function CalculatorPage() {
  const { totals: t } = useCompany();
  const [shares, setShares] = useState("10000"),
    [valuation, setValuation] = useState("10000000");
  let pct = "—",
    value = "—";
  try {
    if (D(shares).gte(0) && D(valuation).gte(0) && D(t.fullyDiluted).gt(0)) {
      pct = percentage(shares, t.fullyDiluted) + "%";
      value = money(D(shares).div(t.fullyDiluted).mul(valuation).toFixed(2));
    }
  } catch {
    /* Keep invalid input visible. */
  }
  return (
    <section className="eq-panel">
      <PageHeader title="Share Calculator" />
      <div className="eq-form-grid">
        <Field label="Number of shares">
          <input type="number" min="0" value={shares} onChange={(e) => setShares(e.target.value)} />
        </Field>
        <Field label="Company equity value ($)">
          <input
            type="number"
            min="0"
            value={valuation}
            onChange={(e) => setValuation(e.target.value)}
          />
        </Field>
      </div>
      <div className="eq-stats">
        <div>
          <span>Fully diluted ownership</span>
          <strong>{pct}</strong>
        </div>
        <div>
          <span>Pro rata value</span>
          <strong>{value}</strong>
        </div>
        <div>
          <span>Current fully diluted shares</span>
          <strong>{number(t.fullyDiluted)}</strong>
        </div>
      </div>
      <p className="eq-muted">
        Uses current outstanding shares and available reserves. Excludes unconverted SAFEs and
        liquidation preferences.
      </p>
    </section>
  );
}
function MissingPage() {
  return (
    <section className="eq-panel">
      <Empty
        title="Page not found"
        description="This link may have changed. Return to your cap table to continue."
      />
      <div style={{ textAlign: "center" }}>
        <CompanyLink page="captable">Go to Cap Table →</CompanyLink>
      </div>
    </section>
  );
}

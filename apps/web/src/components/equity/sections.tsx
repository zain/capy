import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@capy/backend/convex/_generated/api";
import { D, formatNumber as number, isConvertible } from "@capy/equity";
import type { Security } from "@capy/equity";
import { modelRound, projectedVested } from "@capy/equity/modeling";
import { useCompany } from "./context";
import { DataTable, Field, downloadText, csvCell } from "./ui";
import { downloadCapTable } from "@/lib/export-workbook";
import { DataRoom, RecordsPage } from "./records";
import { ImportHelp } from "./import-help";

export function Fundraising() {
  const view = useCompany();
  const [tab, setTab] = useState("Raise with SAFEs"),
    [terms, setTerms] = useState(false),
    [preMoney, setPreMoney] = useState("27000000"),
    [investment, setInvestment] = useState("5000000"),
    [message, setMessage] = useState("");
  const scenarios = useQuery(api.records.list, {
      companyId: view.company._id,
      kind: "fundraising",
    }),
    save = useMutation(api.records.save);
  const result = useMemo(() => {
    try {
      return { model: modelRound(view.data, preMoney, investment), error: "" };
    } catch (e) {
      return { model: null, error: e instanceof Error ? e.message : "Check the model inputs." };
    }
  }, [view.data, preMoney, investment]);
  return (
    <>
      <section className="eq-panel">
        <div className="eq-page-header">
          <h1>Fundraising</h1>
        </div>
        <div className="eq-tabs">
          {["Raise with SAFEs", "Fundraise Modeler"].map((t) => (
            <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        {tab === "Raise with SAFEs" ? (
          <>
            <div className="eq-page-header">
              <h1>Raise with SAFEs</h1>
              <div className="eq-actions">
                <button className="eq-button" onClick={() => setTerms(!terms)}>
                  New Fundraising Terms
                </button>
                <Link
                  className="eq-button eq-primary"
                  to="/companies/$companyId/$"
                  params={{ companyId: view.company._id, _splat: "issuance/new-safe" }}
                >
                  Record SAFE
                </Link>
              </div>
            </div>
            <div className="eq-callout" style={{ marginBottom: 30 }}>
              <h2>Issue SAFEs with confidence</h2>
              <p style={{ marginTop: 10 }}>
                Prepare fundraising terms, record your board consent, then track signed SAFEs in
                your cap table.
              </p>
            </div>
            <h2 style={{ marginBottom: 20 }}>Issued SAFEs</h2>
            <DataTable
              emptyDescription={<ImportHelp />}
              rows={view.data.securities.filter(isConvertible)}
              columns={[
                {
                  key: "investor",
                  label: "Investor",
                  value: (s) =>
                    view.data.stakeholders.find((p) => p.key === s.stakeholderKey)?.name || "—",
                },
                {
                  key: "certificate",
                  label: "Certificate",
                  value: (s) => s.certificate,
                  render: (s) => (
                    <Link
                      to="/companies/$companyId/$"
                      params={{
                        companyId: view.company._id,
                        _splat: `convertibles/${encodeURIComponent(s.key)}`,
                      }}
                    >
                      {s.certificate}
                    </Link>
                  ),
                },
                {
                  key: "investment",
                  label: "Investment",
                  value: (s) => s.outstanding,
                  render: (s) => "$" + number(s.outstanding, 2),
                },
                { key: "status", label: "Status", value: (s) => s.status },
                {
                  key: "type",
                  label: "Conversion Type",
                  value: (s) => s.fields["Conversion Type"] || "—",
                },
              ]}
            />
          </>
        ) : (
          <>
            <h1 style={{ marginBottom: 10 }}>Fundraising Modeling</h1>
            <p style={{ marginBottom: 24 }}>
              Model dilution before your next priced round without changing your cap table.
            </p>
            <div className="eq-actions" style={{ marginBottom: 24 }}>
              <select
                aria-label="Saved model"
                onChange={(e) => {
                  const model = scenarios?.find((s) => s._id === e.target.value);
                  if (model) {
                    setPreMoney(model.data["Pre-money Valuation"] || "27000000");
                    setInvestment(model.data.Investment || "5000000");
                  }
                }}
              >
                <option value="">Current cap table</option>
                {scenarios
                  ?.filter((s) => s.data.Investment)
                  .map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.title}
                    </option>
                  ))}
              </select>
              <button
                className="eq-button"
                onClick={async () => {
                  try {
                    await save({
                      companyId: view.company._id,
                      kind: "fundraising",
                      title: `Round model ${new Date().toLocaleDateString()}`,
                      status: "Draft",
                      data: { "Pre-money Valuation": preMoney, Investment: investment },
                    });
                    setMessage("Model saved.");
                  } catch (e) {
                    setMessage(String(e));
                  }
                }}
              >
                Save Model
              </button>
              {message && <span className="eq-muted">{message}</span>}
            </div>
            <div className="eq-form-grid">
              <Field label="Pre-money valuation, including converting securities ($)">
                <input
                  type="number"
                  min="1"
                  value={preMoney}
                  onChange={(e) => setPreMoney(e.target.value)}
                />
              </Field>
              <Field label="New investment ($)">
                <input
                  type="number"
                  min="0"
                  value={investment}
                  onChange={(e) => setInvestment(e.target.value)}
                />
              </Field>
            </div>
            {result.error ? (
              <p className="eq-error">{result.error}</p>
            ) : (
              result.model && (
                <>
                  <div className="eq-stats">
                    <div>
                      <span>Price per share</span>
                      <strong>${number(result.model.price, 6)}</strong>
                    </div>
                    <div>
                      <span>New investor shares</span>
                      <strong>{number(result.model.newShares, 0)}</strong>
                    </div>
                    <div>
                      <span>Total after round</span>
                      <strong>{number(result.model.afterRound, 0)}</strong>
                    </div>
                  </div>
                  <DataTable
                    filename="fundraise-model"
                    rows={result.model.rows}
                    columns={[
                      { key: "name", label: "Stakeholder", value: (r) => r.name },
                      {
                        key: "before",
                        label: "Starting Shares",
                        value: (r) => r.before,
                        render: (r) => (
                          <>
                            {r.beforePercent}%<br />
                            <span className="eq-muted">{number(r.before, 0)} shares</span>
                          </>
                        ),
                      },
                      {
                        key: "safes",
                        label: "After SAFEs Round",
                        value: (r) => r.afterSafes,
                        render: (r) => (
                          <>
                            {r.safePercent}%<br />
                            <span className="eq-muted">{number(r.afterSafes, 0)} shares</span>
                          </>
                        ),
                      },
                      {
                        key: "round",
                        label: "After Priced Round",
                        value: (r) => r.afterRound,
                        render: (r) => (
                          <>
                            {r.roundPercent}%<br />
                            <span className="eq-muted">{number(r.afterRound, 0)} shares</span>
                          </>
                        ),
                      },
                    ]}
                  />
                </>
              )
            )}
            <p className="eq-import-note">
              Uses exported caps, discounts and accrued interest. Assumes no new option-pool
              increase, pro rata purchases, MFN changes or liquidation preferences.
            </p>
          </>
        )}
      </section>
      {terms && (
        <div style={{ marginTop: 20 }}>
          <RecordsPage
            spec={{
              kind: "fundraising",
              title: "Fundraising Terms",
              button: "Add Terms",
              fields: [
                "Valuation Cap",
                "Conversion Type",
                "Discount",
                "Target Raise",
                "Board Consent",
                "Notes",
              ],
            }}
          />
        </div>
      )}
    </>
  );
}
export function VestingPage() {
  const { data } = useCompany();
  const [target, setTarget] = useState(data.asOf);
  const holderOf = (s: Security) => data.stakeholders.find((p) => p.key === s.stakeholderKey);
  const names = [...new Set(data.securities.map((s) => s.vestingSchedule).filter(Boolean))];
  return (
    <section className="eq-panel">
      <div className="eq-page-header">
        <h1>Vesting</h1>
        <Field label="Vesting as of">
          <input
            type="date"
            min={data.asOf}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
      </div>
      <h3 style={{ marginBottom: 20 }}>Vesting Schedules</h3>
      <DataTable
        rows={names.map((name) => ({
          key: name,
          name,
          count: data.securities.filter((s) => s.vestingSchedule === name).length,
        }))}
        columns={[
          { key: "name", label: "Name", value: (r) => r.name },
          { key: "grants", label: "Grants", value: (r) => r.count },
          {
            key: "frequency",
            label: "Vesting Occurs",
            value: (r) => (/custom/i.test(r.name) ? "Custom" : "Monthly"),
          },
        ]}
      />
      <h3 style={{ margin: "30px 0 20px" }}>Vesting by Security</h3>
      <DataTable
        rows={data.securities.filter(
          (s) => !isConvertible(s) && s.vestingSchedule && D(s.outstanding).gt(0),
        )}
        columns={[
          { key: "certificate", label: "Certificate", value: (s) => s.certificate },
          {
            key: "stakeholder",
            label: "Stakeholder",
            value: (s) => data.stakeholders.find((p) => p.key === s.stakeholderKey)?.name || "—",
          },
          { key: "start", label: "Vesting Start", value: (s) => s.vestingStart },
          {
            key: "outstanding",
            label: "Outstanding",
            value: (s) => s.outstanding,
            render: (s) => number(s.outstanding),
          },
          {
            key: "vested",
            label: "Vested",
            value: (s) => projectedVested(s, data.asOf, target, holderOf(s)),
            render: (s) => {
              const value = projectedVested(s, data.asOf, target, holderOf(s));
              return value === null ? "Schedule needed" : number(value);
            },
          },
          {
            key: "unvested",
            label: "Unvested",
            value: (s) => {
              const value = projectedVested(s, data.asOf, target, holderOf(s));
              return value === null ? null : D(s.outstanding).minus(value).toFixed();
            },
            render: (s) => {
              const value = projectedVested(s, data.asOf, target, holderOf(s));
              return value === null ? "—" : number(D(s.outstanding).minus(value).toFixed());
            },
          },
        ]}
      />
      <p className="eq-import-note">
        Standard monthly schedules project forward from the export’s vested balances. Custom
        schedules need their individual events; historical balances before the export are not
        inferred.
      </p>
    </section>
  );
}
export function Compliance() {
  const { data } = useCompany();
  const [tab, setTab] = useState("409A valuations");
  return (
    <>
      <section className="eq-panel">
        <div className="eq-page-header">
          <h1>Compliance & Tax</h1>
        </div>
        <div className="eq-tabs">
          {["409A valuations", "83(b) elections", "Form 3921", "Rule 701"].map((t) => (
            <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        {tab === "409A valuations" ? (
          <p>Keep your valuations and supporting reports together.</p>
        ) : tab === "83(b) elections" ? (
          <>
            <p style={{ marginBottom: 20 }}>
              Review your stock issuances and keep completed election documents in the Data Room.
            </p>
            <DataTable
              emptyDescription={<ImportHelp />}
              rows={data.securities.filter((s) => s.kind === "share")}
              columns={[
                { key: "certificate", label: "Certificate", value: (s) => s.certificate },
                { key: "date", label: "Issue Date", value: (s) => s.issuedOn },
                {
                  key: "stakeholder",
                  label: "Stakeholder",
                  value: (s) =>
                    data.stakeholders.find((p) => p.key === s.stakeholderKey)?.name || "—",
                },
                {
                  key: "filing",
                  label: "Filing Status",
                  value: (s) => s.fields["83(b) Election"] || "—",
                },
              ]}
            />
          </>
        ) : tab === "Form 3921" ? (
          <>
            <p style={{ marginBottom: 20 }}>
              Download your exercise records to share with your tax filing provider.
            </p>
            <DataTable
              emptyDescription={<ImportHelp />}
              rows={data.securities.filter(
                (s) => s.kind === "option" && s.fields["Dates of Exercise/Settlements"],
              )}
              columns={[
                { key: "certificate", label: "Option", value: (s) => s.certificate },
                { key: "type", label: "Type", value: (s) => s.fields["Grant Type"] || "—" },
                { key: "price", label: "Exercise Price", value: (s) => s.price },
                {
                  key: "events",
                  label: "Exercise / Settlement Events",
                  value: (s) => s.fields["Dates of Exercise/Settlements"] || "—",
                },
              ]}
            />
          </>
        ) : tab === "Rule 701" ? (
          <>
            <p style={{ marginBottom: 20 }}>
              Grant records marked Rule 701. This view does not determine exemption eligibility.
            </p>
            <DataTable
              emptyDescription={<ImportHelp />}
              rows={data.securities.filter((s) => s.fields["Federal Exemption"] === "Rule 701")}
              columns={[
                { key: "certificate", label: "Certificate", value: (s) => s.certificate },
                { key: "date", label: "Issue Date", value: (s) => s.issuedOn },
                {
                  key: "issued",
                  label: "Issued",
                  value: (s) => s.issued,
                  render: (s) => number(s.issued),
                },
                { key: "price", label: "Price", value: (s) => s.price },
              ]}
            />
          </>
        ) : null}
      </section>
      {tab === "409A valuations" && (
        <div style={{ marginTop: 20 }}>
          <RecordsPage
            spec={{
              kind: "valuation",
              title: "409A Valuations",
              button: "Add Valuation",
              fields: [
                "Valuation Date",
                "Provider",
                "Fair Market Value Per Share",
                "Expiration Date",
                "Notes",
              ],
            }}
          />
          <div style={{ marginTop: 20 }}>
            <DataRoom title="Valuation Documents" category="Valuation" />
          </div>
        </div>
      )}
    </>
  );
}
export function HireAndRetain() {
  const { company, data } = useCompany();
  return (
    <section className="eq-panel">
      <div className="eq-page-header">
        <h1>Hire and retain</h1>
        <div className="eq-actions">
          <Link
            className="eq-button"
            to="/companies/$companyId/$"
            params={{ companyId: company._id, _splat: "offer_letters_v2" }}
          >
            New Candidate Offer
          </Link>
          <Link
            className="eq-button eq-primary"
            to="/companies/$companyId/$"
            params={{ companyId: company._id, _splat: "issuance/new-option" }}
          >
            New Option Grant
          </Link>
        </div>
      </div>
      <div className="eq-stats">
        {[
          ["Offers to candidates", "offer_letters_v2"],
          ["Equity grants", "captable"],
          ["Securities status", "securities_status"],
        ].map(([title, page]) => (
          <div key={page}>
            <h3>{title}</h3>
            <Link to="/companies/$companyId/$" params={{ companyId: company._id, _splat: page! }}>
              Show all →
            </Link>
          </div>
        ))}
      </div>
      <h3 style={{ marginBottom: 20 }}>Active equity plans</h3>
      <DataTable
        rows={data.plans.map((p) => ({ ...p, key: p.name }))}
        columns={[
          {
            key: "name",
            label: "Name",
            value: (p) => p.name,
            render: (p) => (
              <Link
                to="/companies/$companyId/$"
                params={{
                  companyId: company._id,
                  _splat: `equity_plans/${encodeURIComponent(p.name)}`,
                }}
              >
                {p.name}
              </Link>
            ),
          },
          {
            key: "available",
            label: "Available",
            value: (p) => p.available,
            render: (p) => number(p.available),
          },
        ]}
      />
    </section>
  );
}
export function SecuritiesStatus({ certificates = false }: { certificates?: boolean }) {
  const { data, company } = useCompany();
  return (
    <section className="eq-panel">
      <div className="eq-page-header">
        <h1>{certificates ? "Certificates" : "Securities Status"}</h1>
      </div>
      <DataTable
        rows={data.securities.filter((s) => !certificates || s.kind === "share")}
        columns={[
          {
            key: "certificate",
            label: "Certificate",
            value: (s) => s.certificate,
            render: (s) => (
              <Link
                to="/companies/$companyId/$"
                params={{
                  companyId: company._id,
                  _splat: `${isConvertible(s) ? "convertibles" : "securities"}/${encodeURIComponent(s.key)}`,
                }}
              >
                {s.certificate}
              </Link>
            ),
          },
          {
            key: "stakeholder",
            label: "Stakeholder",
            value: (s) => data.stakeholders.find((p) => p.key === s.stakeholderKey)?.name || "—",
          },
          { key: "status", label: "Status", value: (s) => s.status },
          { key: "issued", label: "Issued On", value: (s) => s.issuedOn },
          {
            key: "amount",
            label: "Outstanding",
            value: (s) => s.outstanding,
            render: (s) => number(s.outstanding),
          },
        ]}
      />
    </section>
  );
}
export function Reports() {
  const { data } = useCompany();
  const [error, setError] = useState("");
  function csv(kind: "stakeholders" | "securities") {
    const rows =
      kind === "stakeholders"
        ? data.stakeholders.map((p) => ({
            Name: p.name,
            Email: p.email,
            Relationship: p.relationship,
            Type: p.entityType,
          }))
        : data.securities.map((s) => ({
            Certificate: s.certificate,
            Stakeholder: data.stakeholders.find((p) => p.key === s.stakeholderKey)?.name,
            Type: s.kind,
            Issued: s.issued,
            Outstanding: s.outstanding,
            Price: s.price,
            Vested: s.vested,
            Status: s.status,
          }));
    const headers = Object.keys(rows[0] || {});
    downloadText(
      `${data.name}-${kind}.csv`,
      [headers, ...rows.map((r) => headers.map((h) => (r as Record<string, unknown>)[h]))]
        .map((r) => r.map(csvCell).join(","))
        .join("\r\n"),
      "text/csv",
    );
  }
  return (
    <>
      <section className="eq-panel">
        <div className="eq-page-header">
          <h1>Reports</h1>
        </div>
        <p>Export current balances and stakeholder details, or store a completed report below.</p>
        <div className="eq-actions">
          <button
            className="eq-button eq-primary"
            onClick={async () => {
              try {
                await downloadCapTable(data);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Download Cap Table (.xlsx)
          </button>
          <button className="eq-button" onClick={() => csv("stakeholders")}>
            Stakeholder Report (.csv)
          </button>
          <button className="eq-button" onClick={() => csv("securities")}>
            Securities Report (.csv)
          </button>
        </div>
        {error && <p className="eq-error">{error}</p>}
      </section>
      <DataRoom title="Saved Reports" category="Report" />
    </>
  );
}

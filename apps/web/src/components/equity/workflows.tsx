import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@capy/backend/convex/_generated/api";
import type { Security } from "@capy/equity";
import { D, formatNumber } from "@capy/equity";
import { Field, Modal } from "./ui";
import { useCompany } from "./context";

export function ConfigurationForm({
  kind,
  selected,
  onClose,
}: {
  kind: "class" | "plan";
  selected?: string;
  onClose: () => void;
}) {
  const { data, company } = useCompany();
  const prior =
    kind === "class"
      ? data.classes.find((c) => c.name === selected)
      : data.plans.find((p) => p.name === selected);
  const [name, setName] = useState(prior?.name || ""),
    [authorized, setAuthorized] = useState(prior?.authorized || "0"),
    [available, setAvailable] = useState(prior && "available" in prior ? prior.available : "0"),
    [className, setClassName] = useState(
      prior && "className" in prior ? prior.className : data.classes[0]?.name || "",
    ),
    [classKind, setClassKind] = useState(prior && "kind" in prior ? prior.kind : "Common"),
    [parValue, setParValue] = useState(prior && "parValue" in prior ? prior.parValue || "" : ""),
    [pricePerShare, setPricePerShare] = useState(
      prior && "pricePerShare" in prior ? prior.pricePerShare || "" : "",
    ),
    [planStatus, setPlanStatus] = useState(
      prior && "status" in prior ? prior.status || "Outstanding" : "Outstanding",
    ),
    [boardApproval, setBoardApproval] = useState(
      prior && "boardApproval" in prior ? prior.boardApproval || "" : "",
    ),
    [termYears, setTermYears] = useState(
      prior && "termYears" in prior ? prior.termYears || "" : "",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const save = useMutation(api.equity.saveConfiguration);
  return (
    <Modal
      title={`${prior ? "Edit" : "Add"} ${kind === "class" ? "Share Class" : "Equity Plan"}`}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await save({
              companyId: company._id,
              kind,
              originalName: prior?.name,
              data:
                kind === "class"
                  ? {
                      ...prior,
                      name,
                      kind: classKind,
                      authorized,
                      parValue: parValue || null,
                      pricePerShare: pricePerShare || null,
                      reportedOutstanding:
                        prior && "reportedOutstanding" in prior ? prior.reportedOutstanding : "0",
                      capital: prior && "capital" in prior ? prior.capital : "0",
                    }
                  : {
                      name,
                      authorized,
                      available,
                      className,
                      status: planStatus,
                      boardApproval,
                      termYears: termYears || null,
                    },
            });
            onClose();
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Name">
          <input
            required
            readOnly={!!prior}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        {kind === "class" ? (
          <Field label="Type">
            <select value={classKind} onChange={(e) => setClassKind(e.target.value)}>
              <option>Common</option>
              <option>Preferred</option>
            </select>
          </Field>
        ) : (
          <Field label="Share Class">
            <select value={className} onChange={(e) => setClassName(e.target.value)}>
              {data.classes.map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label={kind === "class" ? "Authorized Shares" : "Plan Size"}>
          <input
            type="number"
            min="0"
            required
            value={authorized}
            onChange={(e) => {
              setAuthorized(e.target.value);
              if (!prior && kind === "plan") setAvailable(e.target.value);
            }}
          />
        </Field>
        {kind === "class" && (
          <>
            <Field label="Par Value">
              <input
                type="number"
                min="0"
                step="any"
                value={parValue}
                onChange={(e) => setParValue(e.target.value)}
              />
            </Field>
            <Field label="Price per Share">
              <input
                type="number"
                min="0"
                step="any"
                value={pricePerShare}
                onChange={(e) => setPricePerShare(e.target.value)}
              />
            </Field>
          </>
        )}
        {kind === "plan" && (
          <>
            <Field label="Available Shares">
              <input
                type="number"
                min="0"
                required
                value={available}
                onChange={(e) => setAvailable(e.target.value)}
              />
            </Field>
            <Field label="Status">
              <select value={planStatus} onChange={(e) => setPlanStatus(e.target.value)}>
                <option>Outstanding</option>
                <option>Expired</option>
              </select>
            </Field>
            <Field label="Board Approval">
              <input
                type="date"
                value={boardApproval}
                onChange={(e) => setBoardApproval(e.target.value)}
              />
            </Field>
            <Field label="Term of Plan (years)">
              <input
                type="number"
                min="0"
                step="any"
                value={termYears}
                onChange={(e) => setTermYears(e.target.value)}
              />
            </Field>
          </>
        )}
        {error && <p className="eq-error">{error}</p>}
        <div className="eq-form-actions">
          <button type="button" className="eq-button" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy} className="eq-button eq-primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function SecurityForm({
  securityKey,
  initialKind = "share",
}: {
  securityKey?: string;
  initialKind?: Security["kind"];
}) {
  const view = useCompany();
  const record = view.securities.find((s) => s.key === securityKey);
  const prior = record?.data;
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Security>(
    prior || {
      key: "",
      certificate: "",
      stakeholderKey: "",
      kind: initialKind,
      className:
        initialKind === "safe" || initialKind === "note" ? "" : view.data.classes[0]?.name || "",
      planName: "",
      issued: "",
      outstanding: "",
      price: "0",
      capital: "0",
      vested: "0",
      balanceAsOf: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10),
      issuedOn: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10),
      vestingStart: "",
      vestingSchedule: "",
      status: "Outstanding",
      sourceSheet: "Recorded in Capy",
      sourceRow: 0,
      fields:
        initialKind === "safe" || initialKind === "note" ? { "Conversion Type": "Post-Money" } : {},
    },
  );
  const [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const save = useMutation(api.equity.saveSecurity);
  const set = (key: keyof Security, value: unknown) => setDraft({ ...draft, [key]: value });
  const convertible = draft.kind === "safe" || draft.kind === "note";
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
        reason,
      });
      await navigate({
        to: "/companies/$companyId/$",
        params: {
          companyId: view.company._id,
          _splat: `${convertible ? "convertibles" : "securities"}/${encodeURIComponent(key)}`,
        },
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="eq-panel">
      <div className="eq-page-header">
        <h1>{prior ? `Edit ${prior.certificate}` : "Record Security"}</h1>
      </div>
      <form onSubmit={submit}>
        <div className="eq-form-grid">
          <Field label="Security Type">
            <select
              disabled={!!prior}
              value={draft.kind}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  kind: e.target.value as Security["kind"],
                  planName: "",
                  fields:
                    e.target.value === "safe" || e.target.value === "note"
                      ? { "Conversion Type": "Post-Money" }
                      : {},
                  className:
                    e.target.value === "safe" || e.target.value === "note"
                      ? ""
                      : view.data.classes[0]?.name || "",
                })
              }
            >
              {[
                ["share", "Shares"],
                ["option", "Options"],
                ["safe", "SAFE"],
                ["note", "Convertible Note"],
                ["rsu", "RSUs"],
                ["warrant", "Warrants"],
              ].map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Certificate ID">
            <input
              required
              value={draft.certificate}
              onChange={(e) => set("certificate", e.target.value)}
            />
          </Field>
          <Field label="Stakeholder">
            <select
              required
              value={draft.stakeholderKey}
              onChange={(e) => set("stakeholderKey", e.target.value)}
            >
              <option value="">Select stakeholder</option>
              {view.data.stakeholders.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Issue Date">
            <input
              type="date"
              required
              value={draft.issuedOn}
              onChange={(e) => set("issuedOn", e.target.value)}
            />
          </Field>
          <Field label="Balances As Of">
            <input
              type="date"
              required
              value={draft.balanceAsOf || view.data.asOf}
              onChange={(e) => set("balanceAsOf", e.target.value)}
            />
          </Field>
          {!convertible && (
            <>
              <Field label="Share Class">
                <select
                  disabled={!!prior}
                  value={draft.className}
                  onChange={(e) => setDraft({ ...draft, className: e.target.value, planName: "" })}
                >
                  {view.data.classes.map((c) => (
                    <option key={c.name}>{c.name}</option>
                  ))}
                </select>
              </Field>
              {draft.kind !== "share" && (
                <Field label="Equity Plan">
                  <select
                    disabled={!!prior}
                    value={draft.planName}
                    onChange={(e) => set("planName", e.target.value)}
                  >
                    <option value="">Outside of a plan</option>
                    {view.data.plans
                      .filter((p) => p.className === draft.className)
                      .map((p) => (
                        <option key={p.name}>{p.name}</option>
                      ))}
                  </select>
                </Field>
              )}
            </>
          )}
          <Field label={convertible ? "Principal Issued ($)" : "Shares Issued / Granted"}>
            <input
              type="number"
              min="0"
              step="any"
              required
              value={draft.issued}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  issued: e.target.value,
                  ...(!prior ? { outstanding: e.target.value } : {}),
                })
              }
            />
          </Field>
          <Field label={convertible ? "Principal Outstanding ($)" : "Outstanding Shares"}>
            <input
              type="number"
              min="0"
              step="any"
              required
              value={draft.outstanding}
              onChange={(e) => set("outstanding", e.target.value)}
            />
          </Field>
          {!convertible && (
            <>
              <Field label={draft.kind === "share" ? "Price Per Share ($)" : "Exercise Price ($)"}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.price ?? ""}
                  onChange={(e) => set("price", e.target.value || null)}
                />
              </Field>
              <Field label="Vested Outstanding">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.vested ?? ""}
                  onChange={(e) => set("vested", e.target.value || null)}
                />
              </Field>
              <Field label="Capital Contribution ($)">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.capital ?? ""}
                  onChange={(e) => set("capital", e.target.value || null)}
                />
              </Field>
              <Field label="Vesting Start Date">
                <input
                  type="date"
                  value={draft.vestingStart}
                  onChange={(e) => set("vestingStart", e.target.value)}
                />
              </Field>
              <Field label="Vesting Schedule">
                <input
                  list="vesting-names"
                  value={draft.vestingSchedule}
                  onChange={(e) => set("vestingSchedule", e.target.value)}
                />
                <datalist id="vesting-names">
                  {[
                    ...new Set(view.data.securities.map((s) => s.vestingSchedule).filter(Boolean)),
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </datalist>
              </Field>
            </>
          )}
          {convertible && (
            <>
              <Field label="Valuation Cap ($)">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.fields["Valuation Cap"] || ""}
                  onChange={(e) =>
                    set("fields", { ...draft.fields, "Valuation Cap": e.target.value })
                  }
                />
              </Field>
              <Field label="Conversion Type">
                <select
                  value={draft.fields["Conversion Type"] || "Post-Money"}
                  onChange={(e) =>
                    set("fields", { ...draft.fields, "Conversion Type": e.target.value })
                  }
                >
                  <option>Post-Money</option>
                  <option>Pre-Money</option>
                </select>
              </Field>
              <Field label="Conversion Discount (%)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={draft.fields["Conversion Discount"] || "0"}
                  onChange={(e) =>
                    set("fields", { ...draft.fields, "Conversion Discount": e.target.value })
                  }
                />
              </Field>
            </>
          )}
        </div>
        <Field label="Reason / record notes">
          <textarea required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="eq-import-note">
          Add a signed security to your cap table after completing the agreement and payment.
        </p>
        {error && (
          <p role="alert" className="eq-error">
            {error}
          </p>
        )}
        <div className="eq-form-actions">
          <button
            type="button"
            className="eq-button"
            onClick={() =>
              void navigate({
                to: "/companies/$companyId/$",
                params: { companyId: view.company._id, _splat: "captable" },
              })
            }
          >
            Cancel
          </button>
          <button className="eq-button eq-primary" disabled={busy}>
            {busy ? "Saving…" : "Save Security"}
          </button>
        </div>
      </form>
    </section>
  );
}
export function SecurityActions({ securityKey }: { securityKey: string }) {
  const view = useCompany(),
    record = view.securities.find((s) => s.key === securityKey);
  const [event, setEvent] = useState<"cancel" | "exercise" | null>(null),
    [quantity, setQuantity] = useState(""),
    [date, setDate] = useState(
      new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
    ),
    [reason, setReason] = useState(""),
    [certificate, setCertificate] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const save = useMutation(api.equity.securityEvent);
  if (!record || D(record.data.outstanding).eq(0)) return null;
  return (
    <>
      <button className="eq-button" onClick={() => setEvent("cancel")}>
        Record Cancellation
      </button>
      {record.data.kind === "option" && (
        <button className="eq-button" onClick={() => setEvent("exercise")}>
          Record Exercise
        </button>
      )}
      {event && (
        <Modal
          title={event === "exercise" ? "Record Exercise" : "Record Cancellation"}
          onClose={() => setEvent(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              try {
                await save({
                  companyId: view.company._id,
                  id: record._id,
                  revision: record.revision,
                  event,
                  quantity,
                  date,
                  reason,
                  certificate: event === "exercise" ? certificate : undefined,
                });
                setEvent(null);
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <p style={{ marginBottom: 20 }}>
              {record.data.certificate} · {formatNumber(record.data.outstanding)} outstanding
            </p>
            <Field label="Quantity">
              <input
                type="number"
                min="0"
                step="any"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
            <Field label="Effective Date">
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {event === "exercise" && (
              <Field label="New Stock Certificate ID">
                <input
                  required
                  value={certificate}
                  onChange={(e) => setCertificate(e.target.value)}
                />
              </Field>
            )}
            <Field label="Reason">
              <textarea required value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <p className="eq-import-note">
              Record the completed transaction after finalizing the paperwork and any payment.
            </p>
            {error && <p className="eq-error">{error}</p>}
            <div className="eq-form-actions">
              <button type="button" className="eq-button" onClick={() => setEvent(null)}>
                Cancel
              </button>
              <button disabled={busy} className="eq-button eq-primary">
                Record {event === "exercise" ? "Exercise" : "Cancellation"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

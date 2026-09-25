import { Component, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@capy/backend/convex/_generated/dataModel";
import { api } from "@capy/backend/convex/_generated/api";
import { D, formatNumber as number } from "@capy/equity";
import type { Decimal } from "@capy/equity";
import type { ChangeInput, ChangePreview, PreviewValue, Totals } from "@capy/equity/changes";
import { toast } from "sonner";
import { useCompany } from "./context";
import { DataTable, Empty, Field, Modal } from "./ui";

type Change = FunctionReturnType<typeof api.changes.get>;
type Listed = FunctionReturnType<typeof api.changes.list>[number];
type Status = Change["status"] | "expiring";

const message = (e: unknown) => {
  if (e instanceof ConvexError)
    return typeof e.data === "string" ? e.data : String(e.data?.message ?? e.message);
  return e instanceof Error ? e.message : String(e);
};
const day = (value: string) => {
  const d = new Date(value + "T12:00:00");
  return Number.isNaN(d.valueOf())
    ? value
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const when = (ms: number) =>
  new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const numeric = /^-?\d+(\.\d+)?$/;
const places = (v: string) => v.split(".")[1]?.length ?? 0;
const dollars = (v: string) => "$" + number(v, Math.max(2, places(v)));
// Preview values are decimal strings or plain text; each says whether it is shares or dollars.
const value = (v: string | null | undefined, unit: PreviewValue["unit"]) =>
  !v
    ? "—"
    : unit === "text" || !numeric.test(v)
      ? v
      : unit === "shares"
        ? number(v, 0)
        : unit === "price"
          ? dollars(v)
          : "$" + number(v, D(v).isInteger() ? 0 : 2);
const signed = (v: Decimal, places?: number) => (v.gt(0) ? "+" : "") + number(v.toFixed(), places);
const statusLabels: Record<Status, string> = {
  pending: "Pending review",
  expiring: "Expired",
  applied: "Applied",
  rejected: "Rejected",
  expired: "Expired",
  failed: "Failed",
};
/** Pending changes past their expiry stay pending until the hourly sweep; show them as expired. */
const statusOf = (c: { status: Change["status"]; expiresAt: number }, now: number): Status =>
  c.status === "pending" && c.expiresAt <= now ? "expiring" : c.status;
function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`eq-change-status eq-change-${status === "expiring" ? "expired" : status}`}>
      {statusLabels[status]}
    </span>
  );
}
function PageLink({ page, children }: { page: string; children: ReactNode }) {
  const { company } = useCompany();
  return (
    <Link to="/companies/$companyId/$" params={{ companyId: company._id, _splat: page }}>
      {children}
    </Link>
  );
}
const source = (c: { draftedBy: string; clientName?: string }) =>
  c.clientName ? `${c.draftedBy} via ${c.clientName}` : c.draftedBy;

export function ChangesList() {
  const { company } = useCompany();
  const changes = useQuery(api.changes.list, { companyId: company._id });
  const [tab, setTab] = useState<"pending" | "reviewed">("pending");
  const now = Date.now();
  const pending = changes?.filter((c) => statusOf(c, now) === "pending") ?? [];
  const reviewed = changes?.filter((c) => statusOf(c, now) !== "pending") ?? [];
  const rows = (tab === "pending" ? pending : reviewed).map((c) => ({ ...c, key: c._id }));
  return (
    <section className="eq-panel">
      <div className="eq-page-header">
        <h1>Drafted Changes</h1>
      </div>
      <p className="eq-muted" style={{ marginBottom: 20, maxWidth: 680 }}>
        Changes drafted by AI apps you’ve connected. Nothing on the cap table changes until an admin
        reviews a change here and applies it. Pending changes expire after 7 days.
      </p>
      <div className="eq-tabs">
        {(
          [
            ["pending", `Pending (${pending.length})`],
            ["reviewed", "History"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <DataTable<Listed & { key: string }>
        rows={rows}
        loading={!changes}
        searchable={rows.length > 10}
        emptyDescription={
          tab === "pending" ? (
            <p className="eq-muted" style={{ marginTop: 8 }}>
              When a connected AI app drafts a change, it shows up here for review.{" "}
              <Link to="/connected-apps">Manage connected apps</Link>
            </p>
          ) : undefined
        }
        columns={[
          {
            key: "title",
            label: "Change",
            value: (c) => c.title,
            render: (c) => (
              <div className="eq-change-cell">
                <PageLink page={`changes/${c._id}`}>{c.title}</PageLink>
                <span className="eq-muted">{(c.preview as ChangePreview).summary}</span>
              </div>
            ),
          },
          { key: "source", label: "Drafted by", value: (c) => source(c) },
          {
            key: "created",
            label: "Drafted",
            value: (c) => c._creationTime,
            render: (c) => when(c._creationTime),
          },
          {
            key: "status",
            label: "Status",
            value: (c) => statusLabels[statusOf(c, now)],
            render: (c) => <StatusBadge status={statusOf(c, now)} />,
          },
          {
            key: "expires",
            label: tab === "pending" ? "Expires" : "Reviewed",
            value: (c) => (tab === "pending" ? c.expiresAt : (c.reviewedAt ?? c.expiresAt)),
            render: (c) =>
              tab === "pending" ? when(c.expiresAt) : c.reviewedAt ? when(c.reviewedAt) : "—",
          },
        ]}
      />
    </section>
  );
}

/** A missing or malformed change id makes the query throw; show a not-found page instead. */
class ChangeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <ChangeMissing /> : this.props.children;
  }
}
function ChangeMissing() {
  return (
    <section className="eq-panel">
      <Empty title="Change not found" description="It may have been removed, or the link is wrong.">
        <PageLink page="changes">See drafted changes</PageLink>
      </Empty>
    </section>
  );
}
export function ReviewChange({ changeId }: { changeId: string }) {
  return (
    <ChangeBoundary>
      <Review changeId={changeId as Id<"changes">} />
    </ChangeBoundary>
  );
}

const totalLabels: [keyof Totals, string][] = [
  ["fullyDiluted", "Fully diluted shares"],
  ["outstandingStock", "Outstanding stock"],
  ["outstandingAwards", "Options and awards"],
  ["available", "Available in plans"],
  ["capital", "Capital contributed"],
  ["stakeholdersWithSecurities", "Stakeholders with securities"],
];
function TotalsDelta({ before, after }: { before: Totals; after: Totals }) {
  const shown = totalLabels.filter(([k], i) => i < 4 || !D(String(before[k])).eq(String(after[k])));
  const same = shown.every(([k]) => D(String(before[k])).eq(String(after[k])));
  return (
    <section className="eq-detail-section">
      <h3>Cap table totals</h3>
      {same && (
        <p className="eq-muted eq-change-note">Applying this change doesn’t move any totals.</p>
      )}
      <div className="eq-stats eq-change-stats">
        {shown.map(([k, label]) => {
          const delta = D(String(after[k])).minus(String(before[k]));
          const money = k === "capital";
          return (
            <div key={k}>
              <span>{label}</span>
              <strong>
                {money ? "$" : ""}
                {number(String(after[k]), money ? 2 : undefined)}
              </strong>
              <small className={delta.eq(0) ? "eq-muted" : "eq-change-delta"}>
                {delta.eq(0)
                  ? "No change"
                  : `${signed(delta, money ? 2 : undefined)} from ${money ? "$" : ""}${number(String(before[k]), money ? 2 : undefined)}`}
              </small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
function BeforeAfter({ preview }: { preview: ChangePreview }) {
  // Drafts saved before previews had typed values have none to show.
  const values = preview.values ?? [];
  const hasBefore = values.some((x) => x.before !== undefined);
  if (!values.length) return null;
  return (
    <section className="eq-detail-section">
      <h3>{hasBefore ? "Before and after" : "What gets recorded"}</h3>
      <div className="eq-table-scroll">
        <table className="eq-table eq-change-table">
          <thead>
            <tr>
              <th scope="col">Item</th>
              {hasBefore && <th scope="col">Before</th>}
              <th scope="col">After</th>
            </tr>
          </thead>
          <tbody>
            {values.map((x) => (
              <tr key={x.label}>
                <th scope="row">{x.label}</th>
                {hasBefore && <td>{value(x.before, x.unit)}</td>}
                <td>{value(x.after, x.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Ownership({ rows }: { rows: NonNullable<ChangePreview["ownership"]> }) {
  if (!rows.length) return null;
  return (
    <section className="eq-detail-section">
      <h3>Ownership impact</h3>
      <div className="eq-table-scroll">
        <table className="eq-table eq-change-table">
          <thead>
            <tr>
              <th scope="col">Stakeholder</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const delta = D(r.after).minus(r.before);
              return (
                <tr key={r.name}>
                  <th scope="row">{r.name}</th>
                  <td>{r.before}%</td>
                  <td>{r.after}%</td>
                  <td>
                    {delta.eq(0)
                      ? "—"
                      : `${signed(delta, Math.max(places(r.before), places(r.after)))} pts`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="eq-muted eq-change-note">Percent of fully diluted shares.</p>
    </section>
  );
}

const inputLabels: Record<string, string> = {
  stakeholderKey: "Stakeholder",
  securityKey: "Security",
  planName: "Equity plan",
  shares: "Shares",
  exercisePrice: "Exercise price",
  grantType: "Grant type",
  issuedOn: "Grant date",
  vestingStart: "Vesting start",
  vestingSchedule: "Vesting schedule",
  certificate: "Certificate",
  expirationDate: "Expiration date",
  earlyExercise: "Early exercise",
  boardApprovalDate: "Board approval date",
  date: "Date",
  title: "Title",
  effectiveDate: "Effective date",
  boardMembers: "Board members",
  text: "Consent text",
  preMoney: "Pre-money valuation",
  investment: "Investment",
};
const order = Object.keys(inputLabels);
function RequestDetails({ input }: { input: ChangeInput }) {
  const { data } = useCompany();
  const rows: [string, ReactNode][] = [];
  const entries = Object.entries(input).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  for (const [k, v] of entries) {
    if (k === "kind" || k === "patch" || v === undefined || v === "") continue;
    const label =
      k === "certificate" && input.kind === "exercise" ? "New certificate" : (inputLabels[k] ?? k);
    let shown: ReactNode = String(v);
    if (k === "stakeholderKey") {
      const p = data.stakeholders.find((s) => s.key === v);
      shown = <PageLink page={`stakeholders/${v}`}>{p?.name ?? String(v)}</PageLink>;
    } else if (k === "securityKey") {
      const s = data.securities.find((s) => s.key === v);
      const holder = s && data.stakeholders.find((p) => p.key === s.stakeholderKey)?.name;
      shown = (
        <PageLink page={`securities/${encodeURIComponent(String(v))}`}>
          {s ? `${s.certificate || "Security"}${holder ? ` · ${holder}` : ""}` : String(v)}
        </PageLink>
      );
    } else if (typeof v === "boolean") shown = v ? "Yes" : "No";
    else if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) shown = day(String(v));
    else if (["exercisePrice", "preMoney", "investment"].includes(k)) shown = dollars(String(v));
    else if (k === "shares") shown = number(String(v));
    else if (k === "text") shown = <div className="eq-change-text">{String(v)}</div>;
    rows.push([label, shown]);
  }
  if (!rows.length) return null;
  return (
    <section className="eq-detail-section">
      <h3>Requested details</h3>
      <dl>
        {rows.map(([label, v]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Review({ changeId }: { changeId: Id<"changes"> }) {
  const { company, billing } = useCompany();
  const change = useQuery(api.changes.get, { changeId });
  const companies = useQuery(api.connections.companies);
  const [dialog, setDialog] = useState<"apply" | "reject" | null>(null);
  if (change === undefined)
    return (
      <section className="eq-panel" role="status">
        Loading change…
      </section>
    );
  if (change.companyId !== company._id) return <ChangeMissing />;
  const now = Date.now();
  const status = statusOf(change, now);
  const pending = status === "pending";
  const admin = companies?.find((c) => c.companyId === company._id)?.role === "admin";
  const drafted = change.preview as ChangePreview;
  const current = change.current;
  const preview = pending && current?.ok ? current.preview : drafted;
  const input = (change.payload as { input?: ChangeInput } | undefined)?.input;
  const result = change.result as { reason?: string; link?: string } | undefined;
  const resultPage = result?.link?.replace(`/companies/${company._id}/`, "");
  // describeChange only withholds canApply from an admin with editing on when the change is blocked.
  const blocked =
    pending && current?.ok && admin && billing.canEdit && !change.canApply && change.stale
      ? change.staleReason
      : null;
  const applyNote = !pending
    ? null
    : companies && !admin
      ? "Only company admins can apply or reject drafted changes."
      : !billing.canEdit
        ? "This account is read-only, so changes can’t be applied until billing is renewed."
        : null;
  return (
    <>
      <section className="eq-panel eq-change-review">
        <PageLink page="changes">← Drafted Changes</PageLink>
        <div className="eq-page-header" style={{ marginTop: 16 }}>
          <div>
            <h1>{change.title}</h1>
            <p className="eq-muted" style={{ marginTop: 6 }}>
              Drafted by {change.draftedBy}
              {change.clientName ? ` using ${change.clientName}` : ""} ·{" "}
              {when(change._creationTime)}
            </p>
          </div>
          <div className="eq-actions">
            <StatusBadge status={status} />
          </div>
        </div>
        {pending && change.stale && change.staleReason && !blocked && (
          <div className="eq-import-note" role="status">
            {change.staleReason} The figures below use the current cap table.
          </div>
        )}
        {blocked && (
          <p className="eq-error" role="alert">
            {blocked}
          </p>
        )}
        {pending && current && !current.ok && (
          <div className="eq-error" role="alert">
            This change can no longer be applied to the current cap table:
            <ul>
              {current.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {status === "expiring" && (
          <p className="eq-error" role="alert">
            This change expired on {when(change.expiresAt)}. Ask the app for a new draft.
          </p>
        )}
        {change.status === "failed" && change.error && (
          <div className="eq-error" role="alert">
            Applying this change failed: <span className="eq-change-text">{change.error}</span>
          </div>
        )}
        {change.status === "applied" && (
          <div className="eq-callout" role="status">
            Applied by {change.reviewedByName ?? "an admin"}
            {change.reviewedAt ? ` on ${when(change.reviewedAt)}` : ""}.
            {resultPage && (
              <>
                {" "}
                <PageLink page={resultPage}>View the result</PageLink>
              </>
            )}
          </div>
        )}
        {change.status === "rejected" && (
          <div className="eq-callout" role="status">
            Rejected by {change.reviewedByName ?? "an admin"}
            {change.reviewedAt ? ` on ${when(change.reviewedAt)}` : ""}.
            {result?.reason && (
              <>
                {" "}
                Reason: <span className="eq-change-text">{result.reason}</span>
              </>
            )}
          </div>
        )}
        <p className="eq-change-summary">{preview.summary}</p>
        <section className="eq-detail-section">
          <h3>Why the app drafted this</h3>
          <div className="eq-change-text eq-change-rationale">{change.rationale}</div>
        </section>
        {preview.warnings.length > 0 && (
          <div className="eq-import-note eq-change-warnings">
            <strong>Check before applying</strong>
            <ul>
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <BeforeAfter preview={preview} />
        <TotalsDelta before={preview.totalsBefore} after={preview.totalsAfter} />
        {preview.ownership && <Ownership rows={preview.ownership} />}
        {input && <RequestDetails input={input} />}
        <p className="eq-muted">
          {pending
            ? `Expires ${when(change.expiresAt)}. Applying records the change as you and notes which app drafted it in Recent Activity.`
            : "Figures show the change as it was drafted."}
        </p>
        {pending && (
          <>
            {applyNote && <p className="eq-import-note">{applyNote}</p>}
            <div className="eq-form-actions">
              <button className="eq-button" disabled={!admin} onClick={() => setDialog("reject")}>
                Reject
              </button>
              <button
                className="eq-button eq-primary"
                disabled={!change.canApply || !admin}
                onClick={() => setDialog("apply")}
              >
                Apply change
              </button>
            </div>
          </>
        )}
      </section>
      {dialog === "apply" && (
        <ApplyDialog change={change} preview={preview} onClose={() => setDialog(null)} />
      )}
      {dialog === "reject" && <RejectDialog change={change} onClose={() => setDialog(null)} />}
    </>
  );
}
function ApplyDialog({
  change,
  preview,
  onClose,
}: {
  change: Change;
  preview: ChangePreview;
  onClose: () => void;
}) {
  const apply = useMutation(api.changes.apply);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Apply this change?" onClose={onClose}>
      <p>{preview.summary}</p>
      <p className="eq-muted" style={{ marginTop: 12 }}>
        This updates your records now, as you. Recent Activity will note that
        {change.clientName ? ` ${change.clientName}` : " a connected app"} drafted it.
      </p>
      {error && (
        <p role="alert" className="eq-error">
          {error}
        </p>
      )}
      <div className="eq-form-actions">
        <button className="eq-button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="eq-button eq-primary"
          disabled={busy || !!error}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await apply({ changeId: change._id });
              if (result.status === "applied") {
                toast.success("Change applied.");
                onClose();
                return;
              }
              setError(result.error || "This change couldn’t be applied.");
            } catch (e) {
              setError(message(e));
            }
            setBusy(false);
          }}
        >
          {busy ? "Applying…" : "Apply change"}
        </button>
      </div>
    </Modal>
  );
}
function RejectDialog({ change, onClose }: { change: Change; onClose: () => void }) {
  const reject = useMutation(api.changes.reject);
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Reject this change?" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await reject({ changeId: change._id, ...(reason.trim() ? { reason } : {}) });
            toast.success("Change rejected.");
            onClose();
          } catch (e) {
            setError(message(e));
            setBusy(false);
          }
        }}
      >
        <p style={{ marginBottom: 16 }}>
          Nothing on the cap table changes. The app can draft a new one.
        </p>
        <Field label="Reason (optional)">
          <textarea
            rows={3}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="eq-error">
            {error}
          </p>
        )}
        <div className="eq-form-actions">
          <button type="button" className="eq-button" onClick={onClose}>
            Cancel
          </button>
          <button className="eq-button eq-primary" disabled={busy}>
            Reject change
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Dashboard reminder when changes are waiting for review. */
export function PendingChangesReminder() {
  const { company } = useCompany();
  const pending = useQuery(api.changes.list, { companyId: company._id, status: "pending" });
  const now = Date.now();
  const count = pending?.filter((c) => c.expiresAt > now).length ?? 0;
  if (!count) return null;
  return (
    <div className="eq-reminder">
      <PageLink page="changes">
        {count === 1 ? "Review a drafted change" : `Review ${count} drafted changes`}
      </PageLink>
      <p>
        A connected AI app drafted {count === 1 ? "a change" : "changes"} for an admin to apply.
      </p>
    </div>
  );
}

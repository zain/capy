import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@capy/backend/convex/_generated/api";
import type { Id } from "@capy/backend/convex/_generated/dataModel";
import { formatNumber, sum } from "@capy/equity";
import { DataTable, Modal } from "./ui";
import { useCompany } from "./context";
import "./equity.css";

type PortalData = {
  companyName: string;
  name: string;
  asOf: string;
  securities: {
    key: string;
    certificate: string;
    kind: string;
    className: string;
    planName: string;
    issued: string;
    outstanding: string;
    price: string | null;
    vested: string | null;
    issuedOn: string;
    balanceAsOf: string;
    vestingStart: string;
    vestingSchedule: string;
    status: string;
  }[];
};
export function Holdings({ data }: { data: PortalData }) {
  return (
    <>
      <div className="eq-page-header">
        <div>
          <p className="eq-muted">{data.companyName}</p>
          <h1>{data.name}’s Equity</h1>
        </div>
        <span className="eq-muted">Imported as of {data.asOf}</span>
      </div>
      <div className="eq-stats">
        <div>
          <span>Outstanding shares and awards</span>
          <strong>
            {formatNumber(
              sum(
                data.securities
                  .filter((s) => !["safe", "note"].includes(s.kind))
                  .map((s) => s.outstanding),
              ),
            )}
          </strong>
        </div>
        <div>
          <span>Securities</span>
          <strong>{data.securities.length}</strong>
        </div>
      </div>
      <DataTable
        rows={data.securities}
        columns={[
          { key: "certificate", label: "Certificate", value: (s) => s.certificate },
          { key: "kind", label: "Type", value: (s) => s.kind.toUpperCase() },
          { key: "class", label: "Share Class", value: (s) => s.className },
          {
            key: "outstanding",
            label: "Outstanding",
            value: (s) => s.outstanding,
            render: (s) => formatNumber(s.outstanding),
          },
          { key: "vested", label: "Vested at Import", value: (s) => s.vested || "—" },
          { key: "price", label: "Price / Share", value: (s) => s.price || "—" },
          { key: "issued", label: "Issued On", value: (s) => s.issuedOn },
          { key: "balanceDate", label: "Balances As Of", value: (s) => s.balanceAsOf },
          { key: "vesting", label: "Vesting Schedule", value: (s) => s.vestingSchedule },
          { key: "status", label: "Status", value: (s) => s.status },
        ]}
      />
      <p className="eq-muted">
        Contact your company administrator to correct a record or request an exercise.
      </p>
    </>
  );
}
function Preview({ personKey }: { personKey: string }) {
  const { company } = useCompany();
  const data = useQuery(api.portal.preview, { companyId: company._id, stakeholderKey: personKey });
  return data ? <Holdings data={data} /> : <p>Loading…</p>;
}
export function PortalManager() {
  const { company, data } = useCompany();
  const grants = useQuery(api.portal.list, { companyId: company._id });
  const invite = useMutation(api.portal.invite),
    revoke = useMutation(api.portal.revoke);
  const [preview, setPreview] = useState(""),
    [link, setLink] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="eq-panel">
      <div className="eq-page-header">
        <h1>Stakeholder Portal</h1>
      </div>
      <p>
        Each stakeholder sees only their own securities. Preview their view, then create a private
        invitation to share directly with them.
      </p>
      <DataTable
        rows={data.stakeholders}
        columns={[
          { key: "name", label: "Stakeholder", value: (p) => p.name },
          { key: "email", label: "Email", value: (p) => p.email || "—" },
          {
            key: "access",
            label: "Access",
            value: (p) =>
              grants?.some((g) => g.stakeholderKey === p.key && !g.revoked && g.userId)
                ? "Active"
                : grants?.some(
                      (g) => g.stakeholderKey === p.key && !g.revoked && g.expiresAt > Date.now(),
                    )
                  ? "Invited"
                  : "Not invited",
          },
          {
            key: "actions",
            label: "Actions",
            value: (p) => p.key,
            render: (p) => (
              <div className="eq-actions">
                <button className="eq-text-button" onClick={() => setPreview(p.key)}>
                  Preview
                </button>
                <button
                  className="eq-text-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      setLink(
                        `${location.origin}/join/${await invite({ companyId: company._id, stakeholderKey: p.key })}`,
                      );
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Create invitation
                </button>
                {grants?.some((g) => g.stakeholderKey === p.key && !g.revoked) && (
                  <button
                    className="eq-text-button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        for (const g of grants.filter(
                          (g) => g.stakeholderKey === p.key && !g.revoked,
                        ))
                          await revoke({ grantId: g._id });
                      } catch (e) {
                        setError(String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />
      {error && (
        <p role="alert" className="eq-error">
          {error}
        </p>
      )}
      {preview && (
        <Modal title="Stakeholder Preview" wide onClose={() => setPreview("")}>
          <Preview personKey={preview} />
        </Modal>
      )}
      {link && (
        <Modal title="Private Invitation" onClose={() => setLink("")}>
          <p>
            Share this link only with the intended stakeholder. The first signed-in account to
            accept it receives access to their holdings. Unused links expire after seven days.
          </p>
          <input
            aria-label="Private invitation link"
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
          />
          <button className="eq-button" onClick={() => void navigator.clipboard.writeText(link)}>
            Copy link
          </button>
        </Modal>
      )}
    </section>
  );
}
export function PortalHome({ grantId }: { grantId: string }) {
  const data = useQuery(api.portal.view, { grantId: grantId as Id<"portalGrants"> });
  return (
    <div className="equity-app">
      <header className="eq-topbar">
        <Link to="/dashboard">Capy</Link>
        <Link to="/dashboard">Your account</Link>
      </header>
      <main className="eq-main" style={{ marginLeft: 0, maxWidth: 1200, margin: "0 auto" }}>
        <section className="eq-panel">
          {data ? <Holdings data={data} /> : <p>Loading your equity…</p>}
        </section>
      </main>
    </div>
  );
}
export function AcceptInvitation({ token }: { token: string }) {
  const claim = useMutation(api.portal.claim),
    navigate = useNavigate();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="equity-app">
      <main className="eq-main" style={{ margin: "60px auto", maxWidth: 650 }}>
        <section className="eq-panel">
          <h1>Your Stakeholder Portal</h1>
          <p>Accept this invitation to view the holdings your company has shared with you.</p>
          <button
            className="eq-button eq-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const id = await claim({ token });
                await navigate({ to: "/portal/$grantId", params: { grantId: id } });
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Accept Invitation
          </button>
          {error && (
            <p role="alert" className="eq-error">
              {error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
export function MyPortals() {
  const portals = useQuery(api.portal.mine);
  if (!portals?.length) return null;
  return (
    <section className="eq-company-cards">
      <h2>Your equity</h2>
      {portals.map((p) => (
        <Link
          className="eq-company-card"
          key={p.id}
          to="/portal/$grantId"
          params={{ grantId: p.id }}
        >
          {p.name}
        </Link>
      ))}
    </section>
  );
}

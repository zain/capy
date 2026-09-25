import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import type { Id } from "@capy/backend/convex/_generated/dataModel";
import { api } from "@capy/backend/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { resumeAuthorization } from "@/lib/connect";
import Header from "@/components/header";
import { Modal } from "./ui";
import "./equity.css";

type CompanyChoice = { companyId: Id<"companies">; name: string; role: "admin" | "viewer" };

const message = (e: unknown) =>
  e instanceof ConvexError ? String(e.data) : e instanceof Error ? e.message : String(e);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="equity-app eq-auth">
      <Header />
      <main className="eq-auth-main eq-connect">
        <section className="eq-panel eq-auth-card">{children}</section>
      </main>
    </div>
  );
}

/** The OAuth login page. Once signed in, hand the request back to Better Auth. */
export function ConnectPage() {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("client_id")) resumeAuthorization();
    else setOrigin(window.location.origin);
  }, []);
  if (!origin)
    return (
      <Shell>
        <p role="status">Connecting your AI app…</p>
      </Shell>
    );
  return (
    <Shell>
      <h1>Connect an AI app</h1>
      <p className="eq-auth-description">
        Add Capy to Claude, ChatGPT, Cursor or another AI app using this server URL. The app sends
        you back here to choose what it can see.
      </p>
      <p className="eq-callout">
        <code>{origin}/mcp</code>
      </p>
      <p className="eq-auth-description">
        <a href="/docs/mcp">How to add Capy to your AI app</a>
      </p>
      <p className="eq-connect-footer">
        <Link to="/dashboard">← Your companies</Link>
      </p>
    </Shell>
  );
}

function CompanyPicker({
  companies,
  selected,
  onChange,
  allowDrafts,
  onAllowDrafts,
}: {
  companies: CompanyChoice[];
  selected: Id<"companies">[];
  onChange: (ids: Id<"companies">[]) => void;
  allowDrafts: boolean;
  onAllowDrafts: (allow: boolean) => void;
}) {
  const canDraft = companies.some((c) => c.role === "admin" && selected.includes(c.companyId));
  return (
    <>
      <fieldset className="eq-choice-group">
        <legend>Companies it can see</legend>
        {companies.map((c) => (
          <label className="eq-choice" key={c.companyId}>
            <input
              type="checkbox"
              checked={selected.includes(c.companyId)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, c.companyId]
                    : selected.filter((id) => id !== c.companyId),
                )
              }
            />
            <span>
              {c.name}
              <small>{c.role === "admin" ? "Admin" : "Viewer"}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="eq-consent eq-connect-drafts">
        <input
          type="checkbox"
          checked={allowDrafts && canDraft}
          disabled={!canDraft}
          onChange={(e) => onAllowDrafts(e.target.checked)}
        />
        <span>
          Allow drafting changes for review
          <small>
            {canDraft
              ? "The app can propose grants, exercises, cancellations, stakeholder edits and board consents. Nothing changes until an admin applies the draft in Capy."
              : "Only for companies where you’re an admin."}
          </small>
        </span>
      </label>
    </>
  );
}

export function ConsentPage({ consentCode }: { consentCode: string }) {
  const request = useQuery(api.connections.pending, consentCode ? { consentCode } : "skip");
  const user = useQuery(api.auth.getCurrentUser);
  const approve = useMutation(api.connections.approve);
  const revoke = useMutation(api.connections.revoke);
  const [selected, setSelected] = useState<Id<"companies">[] | null>(null),
    [allowDrafts, setAllowDrafts] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState<"allowed" | "denied" | null>(null),
    [error, setError] = useState("");

  if (!consentCode || request === null)
    return (
      <Shell>
        <h1>This request has expired</h1>
        <p className="eq-auth-description">
          Connection requests last 10 minutes and work once. Start connecting again from your AI
          app.
        </p>
        <p className="eq-connect-footer">
          <Link to="/dashboard">← Your companies</Link>
        </p>
      </Shell>
    );
  if (!request)
    return (
      <Shell>
        <p role="status">Loading…</p>
      </Shell>
    );

  const name = request.clientName;
  const companyIds =
    selected ??
    request.existing?.companyIds.filter((id) =>
      request.companies.some((c) => c.companyId === id),
    ) ??
    (request.companies.length === 1 ? [request.companies[0].companyId] : []);
  const drafts = allowDrafts ?? request.existing?.allowDrafts ?? false;

  const finish = async (accept: boolean) => {
    setBusy(true);
    setError("");
    try {
      if (accept) await approve({ consentCode, companyIds, allowDrafts: drafts });
      const { data, error } = await authClient.$fetch<{ redirectURI: string }>("/oauth2/consent", {
        method: "POST",
        body: { accept, consent_code: consentCode },
      });
      if (error || !data?.redirectURI)
        throw new Error(error?.message || "Capy couldn’t finish connecting. Try again.");
      // Denying a reconnect also ends the app's existing access, as the page says.
      if (!accept && request.existing) await revoke({ clientId: request.clientId });
      let target = data.redirectURI;
      // Better Auth drops state on denial; clients need it to match the response to their request.
      if (!accept && request.state && !new URL(target).searchParams.has("state")) {
        const url = new URL(target);
        url.searchParams.set("state", request.state);
        target = url.toString();
      }
      setDone(accept ? "allowed" : "denied");
      window.location.assign(target);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  };

  if (done)
    return (
      <Shell>
        <h1>{done === "allowed" ? `${name} is connected` : "Request denied"}</h1>
        <p className="eq-auth-description" role="status">
          {done === "allowed"
            ? `Return to ${name} to continue. You can close this tab.`
            : `${name} ${request.existing ? "is disconnected and " : ""}can’t see your Capy data. You can close this tab.`}
        </p>
      </Shell>
    );

  return (
    <Shell>
      <h1>Connect {name} to Capy?</h1>
      <p className="eq-auth-description">
        {name} is asking to use Capy{user?.email ? ` as ${user.email}` : ""}.
      </p>
      <div className="eq-callout eq-connect-warning">
        <strong>Only continue if you started this from {name}.</strong> Apps choose their own name.
        After you answer, you’ll go back to{" "}
        <strong className="eq-connect-host">{request.redirectHost}</strong>
        {request.redirectLocal ? ", an app running on your computer" : ""}.
      </div>
      <div className="eq-connect-scope">
        <h2>What it can do</h2>
        <ul>
          <li>
            Read the cap table, stakeholders, securities, vesting, documents and board records of
            the companies you choose.
          </li>
          <li>Use your role in each company. It sees what you can see in Capy.</li>
          <li>
            It can’t change your cap table. With drafting on, it can only propose changes for an
            admin to review.
          </li>
        </ul>
      </div>
      {request.companies.length ? (
        <CompanyPicker
          companies={request.companies}
          selected={companyIds}
          onChange={setSelected}
          allowDrafts={drafts}
          onAllowDrafts={setAllowDrafts}
        />
      ) : (
        <p className="eq-callout">
          You don’t have a company in Capy yet. <Link to="/dashboard">Add your cap table</Link>,
          then connect again.
        </p>
      )}
      {error && (
        <p role="alert" className="eq-error">
          {error}
        </p>
      )}
      {request.existing && (
        <p className="eq-muted">
          {name} is already connected. Deny also disconnects it, so it can’t see your Capy data.
        </p>
      )}
      <div className="eq-form-actions">
        <button className="eq-button" disabled={busy} onClick={() => finish(false)}>
          {request.existing ? "Deny and disconnect" : "Deny"}
        </button>
        <button
          className="eq-button eq-primary"
          disabled={busy || !companyIds.length}
          onClick={() => finish(true)}
        >
          {busy ? "Connecting…" : "Allow access"}
        </button>
      </div>
      <p className="eq-muted eq-connect-footer">
        You can change or remove this any time in Account → Connected apps.
      </p>
    </Shell>
  );
}

type Connection = FunctionReturnType<typeof api.connections.list>[number];

function EditConnection({ connection, onClose }: { connection: Connection; onClose: () => void }) {
  const companies = useQuery(api.connections.companies);
  const update = useMutation(api.connections.update);
  const [selected, setSelected] = useState(connection.companies.map((c) => c.companyId)),
    [allowDrafts, setAllowDrafts] = useState(connection.allowDrafts),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={`Edit ${connection.clientName}`} onClose={onClose}>
      {!companies ? (
        <p role="status">Loading…</p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await update({ clientId: connection.clientId, companyIds: selected, allowDrafts });
              onClose();
            } catch (e) {
              setError(message(e));
              setBusy(false);
            }
          }}
        >
          <CompanyPicker
            companies={companies}
            selected={selected}
            onChange={setSelected}
            allowDrafts={allowDrafts}
            onAllowDrafts={setAllowDrafts}
          />
          {error && (
            <p role="alert" className="eq-error">
              {error}
            </p>
          )}
          <div className="eq-form-actions">
            <button type="button" className="eq-button" onClick={onClose}>
              Cancel
            </button>
            <button className="eq-button eq-primary" disabled={busy || !selected.length}>
              Save
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function Disconnect({ connection, onClose }: { connection: Connection; onClose: () => void }) {
  const revoke = useMutation(api.connections.revoke);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={`Disconnect ${connection.clientName}?`} onClose={onClose}>
      <p>
        {connection.clientName} loses access right away. To use it with Capy again, you’ll need to
        connect it again.
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
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await revoke({ clientId: connection.clientId });
              onClose();
            } catch (e) {
              setError(message(e));
              setBusy(false);
            }
          }}
        >
          Disconnect
        </button>
      </div>
    </Modal>
  );
}

const day = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function ConnectedAppsPage() {
  const connections = useQuery(api.connections.list);
  const [editing, setEditing] = useState<Connection | null>(null),
    [removing, setRemoving] = useState<Connection | null>(null),
    [origin, setOrigin] = useState("https://capyinc.com");
  useEffect(() => setOrigin(window.location.origin), []);
  return (
    <div className="equity-app eq-auth">
      <Header />
      <main className="eq-billing-page">
        <Link to="/dashboard">← Your companies</Link>
        <section className="eq-panel" style={{ marginTop: 24 }}>
          <h1>Connected apps</h1>
          <p className="eq-auth-description">
            AI apps you’ve connected to Capy, and the companies each one can see. Add Capy to an app
            with the server URL <code>{origin}/mcp</code>. <a href="/docs/mcp">Setup guide</a>
          </p>
          {!connections ? (
            <p role="status">Loading…</p>
          ) : !connections.length ? (
            <p className="eq-muted">No apps connected.</p>
          ) : (
            <ul className="eq-connections">
              {connections.map((c) => (
                <li key={c.clientId}>
                  <div>
                    <strong>{c.clientName}</strong>
                    {c.redirectHost && <span className="eq-muted"> · {c.redirectHost}</span>}
                    <p>
                      {c.companies.length
                        ? c.companies.map((co) => co.name).join(", ")
                        : "No companies"}
                      {" · "}
                      {c.allowDrafts ? "Can draft changes for review" : "Read only"}
                    </p>
                    <p className="eq-muted">
                      Connected {day(c.createdAt)}
                      {c.lastUsedAt ? ` · Last used ${day(c.lastUsedAt)}` : ""}
                    </p>
                  </div>
                  <div className="eq-actions">
                    <button className="eq-button" onClick={() => setEditing(c)}>
                      Edit
                    </button>
                    <button className="eq-button" onClick={() => setRemoving(c)}>
                      Disconnect
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      {editing && <EditConnection connection={editing} onClose={() => setEditing(null)} />}
      {removing && <Disconnect connection={removing} onClose={() => setRemoving(null)} />}
    </div>
  );
}

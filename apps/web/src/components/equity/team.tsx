import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@capy/backend/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { DataTable, Field, Modal } from "./ui";
import { useCompany } from "./context";
import "./equity.css";

const message = (e: unknown) =>
  e instanceof ConvexError ? String(e.data) : e instanceof Error ? e.message : String(e);

export function AdminManager() {
  const { company } = useCompany();
  const team = useQuery(api.team.list, { companyId: company._id });
  const invite = useMutation(api.team.invite),
    revoke = useMutation(api.team.revoke),
    remove = useMutation(api.team.remove);
  const [email, setEmail] = useState(""),
    [link, setLink] = useState<{ email: string; url: string } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="eq-panel">
      <div className="eq-page-header">
        <h1>Admins</h1>
      </div>
      <p>
        Admins can view and edit this company’s cap table, review drafted changes and invite other
        admins. Invite someone by email, then send them the link. They can create a Capy account
        from the link if they don’t have one.
      </p>
      <form
        className="eq-invite-form"
        onSubmit={(e) => {
          e.preventDefault();
          const invited = email;
          void run(async () => {
            const token = await invite({ companyId: company._id, email: invited });
            setLink({
              email: invited.trim().toLowerCase(),
              url: `${location.origin}/invite/${token}`,
            });
            setEmail("");
          });
        }}
      >
        <Field label="Email">
          <input
            type="email"
            required
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <button className="eq-button eq-primary" disabled={busy}>
          Create invitation
        </button>
      </form>
      {error && (
        <p role="alert" className="eq-error">
          {error}
        </p>
      )}
      <DataTable
        filename="capy-admins"
        loading={!team}
        rows={[
          ...(team?.members ?? []).map((m) => ({ ...m, key: m.userId, kind: "member" as const })),
          ...(team?.invitations ?? []).map((i) => ({ ...i, key: i._id, kind: "invite" as const })),
        ]}
        columns={[
          { key: "email", label: "Email", value: (r) => r.email },
          {
            key: "name",
            label: "Name",
            value: (r) => (r.kind === "member" ? r.name || "—" : "—"),
          },
          {
            key: "access",
            label: "Access",
            value: (r) =>
              r.kind === "invite"
                ? `Invited by ${r.invitedBy}`
                : r.owner
                  ? "Owner"
                  : r.role === "admin"
                    ? "Admin"
                    : "Viewer",
          },
          {
            key: "actions",
            label: "Actions",
            value: (r) => r.key,
            render: (r) =>
              r.kind === "invite" ? (
                <button
                  className="eq-text-button"
                  disabled={busy}
                  onClick={() => void run(() => revoke({ invitationId: r._id }))}
                >
                  Revoke
                </button>
              ) : (
                !r.owner && (
                  <button
                    className="eq-text-button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          r.you
                            ? "Remove your own access to this company?"
                            : `Remove ${r.email}’s access to this company?`,
                        )
                      )
                        void run(() => remove({ companyId: company._id, userId: r.userId }));
                    }}
                  >
                    Remove
                  </button>
                )
              ),
          },
        ]}
      />
      {link && (
        <Modal title="Admin Invitation" onClose={() => setLink(null)}>
          <p>
            Send this link to {link.email}. They need to sign in or create an account with that
            email to accept it. The link expires after seven days.
          </p>
          <input
            aria-label="Admin invitation link"
            readOnly
            value={link.url}
            onFocus={(e) => e.target.select()}
          />
          <button
            className="eq-button"
            onClick={() => void navigator.clipboard.writeText(link.url)}
          >
            Copy link
          </button>
        </Modal>
      )}
    </section>
  );
}

export function AcceptAdminInvitation({ token }: { token: string }) {
  const invitation = useQuery(api.team.invitation, { token });
  const accept = useMutation(api.team.accept),
    navigate = useNavigate();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="equity-app">
      <main className="eq-main" style={{ margin: "60px auto", maxWidth: 650 }}>
        <section className="eq-panel">
          {!invitation ? (
            <p>Loading invitation…</p>
          ) : invitation.problem ? (
            <>
              <h1>Admin Invitation</h1>
              <p role="alert" className="eq-error">
                {invitation.problem}
              </p>
              {invitation.wrongAccount && (
                <button
                  className="eq-button"
                  onClick={() => void authClient.signOut().then(() => location.reload())}
                >
                  Sign out
                </button>
              )}
            </>
          ) : (
            <>
              <h1>Join {invitation.companyName}</h1>
              <p>
                {invitation.invitedBy} invited you to be an admin of {invitation.companyName} on
                Capy.
              </p>
              <button
                className="eq-button eq-primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const companyId = await accept({ token });
                    await navigate({
                      to: "/companies/$companyId/$",
                      params: { companyId, _splat: "dashboard" },
                    });
                  } catch (e) {
                    setError(message(e));
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
            </>
          )}
        </section>
      </main>
    </div>
  );
}

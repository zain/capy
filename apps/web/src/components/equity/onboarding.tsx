import { useState } from "react";
import { useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@capy/backend/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Field, Modal } from "./ui";
import { clearPendingImport } from "@/lib/pending-import";
import { trackFunnel } from "@/lib/funnel";
const START_COPY = {
  first: {
    title: "Your account is ready",
    body: "Import your cap table below, or start with an empty company and add your records later.",
    button: "Continue without an import",
  },
  more: {
    title: "Add a company",
    body: "Start another empty company, or import a cap table below.",
    button: "New company",
  },
};

export function StartWithoutImport({ first = true }: { first?: boolean }) {
  const copy = START_COPY[first ? "first" : "more"];
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [yourName, setYourName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const create = useMutation(api.equity.createCompany);
  const navigate = useNavigate();
  return (
    <section className="eq-start-later">
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      <button className="eq-button" onClick={() => setOpen(true)}>
        {copy.button}
      </button>
      {open && (
        <Modal title="Set up your company" onClose={() => setOpen(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                if (yourName.trim()) {
                  const result = await authClient.updateUser({ name: yourName.trim() });
                  if (result.error) throw new Error(result.error.message);
                }
                const companyId = await create({ name });
                await clearPendingImport().catch(() => {});
                trackFunnel("company_created_without_import");
                await navigate({
                  to: "/companies/$companyId/$",
                  params: { companyId, _splat: "dashboard" },
                });
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not create your company.");
                setBusy(false);
              }
            }}
          >
            <Field label="Company name">
              <input
                required
                maxLength={300}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="organization"
              />
            </Field>
            <Field label="Your name (optional)">
              <input
                value={yourName}
                onChange={(e) => setYourName(e.target.value)}
                autoComplete="name"
              />
            </Field>
            {error && <p className="eq-error">{error}</p>}
            <div className="eq-form-actions">
              <button type="button" className="eq-button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="eq-button eq-primary" disabled={busy}>
                {busy ? "Creating…" : "Create company"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

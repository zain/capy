import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@capy/backend/convex/_generated/api";
import { parseStakeholderSheets } from "@capy/equity/import";
import type { Stakeholder } from "@capy/equity";
import { readWorkbookSheets } from "@/lib/import-workbook";
import { DataTable, Modal } from "./ui";
import { useCompany } from "./context";
export function ContactImport() {
  const { company, data } = useCompany();
  const input = useRef<HTMLInputElement>(null);
  const [contacts, setContacts] = useState<Stakeholder[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const merge = useMutation(api.equity.mergeContacts);
  async function read(file: File) {
    setBusy(true);
    setError("");
    try {
      const records = parseStakeholderSheets(await readWorkbookSheets(await file.arrayBuffer()));
      const keys = new Set<string>();
      for (const p of records) {
        const name = p.name.toLowerCase();
        if (keys.has(name))
          throw new Error(`Duplicate name “${p.name}” needs to be resolved before importing.`);
        keys.add(name);
      }
      setContacts(records);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="eq-button" disabled={busy} onClick={() => input.current?.click()}>
        Import Contacts
      </button>
      <input
        hidden
        ref={input}
        type="file"
        accept=".xlsx"
        onChange={(e) => {
          if (e.target.files?.[0]) void read(e.target.files[0]);
        }}
      />
      {(contacts || error) && (
        <Modal
          title="Import Stakeholder Contacts"
          onClose={() => {
            setContacts(null);
            setError("");
          }}
          wide
        >
          <p>
            Use Pulley’s Stakeholders → Actions → Download export. Matching names or external IDs
            update existing profiles.
          </p>
          {contacts && (
            <>
              <DataTable
                rows={contacts}
                columns={[
                  { key: "name", label: "Name", value: (p) => p.name },
                  { key: "email", label: "Email", value: (p) => p.email },
                  { key: "relationship", label: "Relationship", value: (p) => p.relationship },
                  {
                    key: "action",
                    label: "Action",
                    value: (p) =>
                      data.stakeholders.some(
                        (old) =>
                          (p.externalId && old.externalId === p.externalId) ||
                          old.name.toLowerCase() === p.name.toLowerCase(),
                      )
                        ? "Update"
                        : "Add",
                  },
                ]}
              />
              <p className="eq-muted">SSNs are excluded from this contact import.</p>
              <div className="eq-form-actions">
                <button className="eq-button" onClick={() => setContacts(null)}>
                  Cancel
                </button>
                <button
                  className="eq-button eq-primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      for (let i = 0; i < contacts.length; i += 100)
                        await merge({
                          companyId: company._id,
                          contacts: contacts.slice(i, i + 100),
                        });
                      setContacts(null);
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Importing…" : `Import ${contacts.length} Contacts`}
                </button>
              </div>
            </>
          )}
          {error && <p className="eq-error">{error}</p>}
        </Modal>
      )}
    </>
  );
}

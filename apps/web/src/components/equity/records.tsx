import { useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@capy/backend/convex/_generated/dataModel";
import { Download, Plus, Upload } from "lucide-react";
import { api } from "@capy/backend/convex/_generated/api";
import { useCompany } from "./context";
import { DataTable, downloadText, Field, Modal } from "./ui";
import { ImportHelp } from "./import-help";

export type RecordSpec = {
  kind: string;
  title: string;
  button: string;
  description?: string;
  fields: string[];
};
const specs: Record<string, RecordSpec> = {
  board_approvals: {
    kind: "approval",
    title: "Board Approvals",
    button: "New Board Approval",
    description: "Prepare board approvals and keep a record of completed consents.",
    fields: ["Approval Type", "Effective Date", "Board Members", "Consent Document", "Notes"],
  },
  stockholder_consents: {
    kind: "consent",
    title: "Stockholder Consents",
    button: "New Consent",
    fields: ["Effective Date", "Signatories", "Consent Document", "Notes"],
  },
  offer_letters_v2: {
    kind: "offer",
    title: "Offer Letters",
    button: "New Candidate Offer",
    fields: ["Candidate Name", "Email", "Role", "Salary", "Equity Grant", "Start Date", "Notes"],
  },
  communications_hub: {
    kind: "communication",
    title: "Communications Hub",
    button: "New Update",
    description:
      "Draft company updates for investors, advisors and employees. Download a draft to send using your email service.",
    fields: ["Recipients", "Subject", "Message"],
  },
  drafts: {
    kind: "draft",
    title: "Drafts",
    button: "New Draft",
    description:
      "Prepare an issuance before adding it to your cap table. Drafts do not affect ownership.",
    fields: ["Stakeholder", "Security Type", "Share Class", "Quantity", "Price", "Notes"],
  },
  templates: {
    kind: "template",
    title: "Templates",
    button: "New Template",
    fields: ["Type", "Content"],
  },
  form_documents: {
    kind: "template",
    title: "Form Documents",
    button: "New Form Document",
    fields: ["Type", "Content"],
  },
  certificate_templates: {
    kind: "template",
    title: "Certificate Templates",
    button: "New Template",
    fields: ["Type", "Content"],
  },
  external_contacts: {
    kind: "contact",
    title: "External Contacts",
    button: "Add Contact",
    fields: ["Name", "Email", "Role", "Company", "Notes"],
  },
};
type RecordItem = FunctionReturnType<typeof api.records.list>[number];
export function RecordsPage({ section, spec: custom }: { section?: string; spec?: RecordSpec }) {
  const spec = custom || specs[section || ""]!;
  const { company, data: equityData } = useCompany();
  const records = useQuery(api.records.list, { companyId: company._id, kind: spec.kind });
  const save = useMutation(api.records.save);
  const [editing, setEditing] = useState<RecordItem | "new" | null>(null),
    [title, setTitle] = useState(""),
    [status, setStatus] = useState("Draft"),
    [data, setData] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function edit(record: RecordItem | "new") {
    setEditing(record);
    setTitle(record === "new" ? "" : record.title);
    setStatus(record === "new" ? "Draft" : record.status);
    setData(record === "new" ? {} : record.data);
    setError("");
  }
  return (
    <section className="eq-panel">
      <div className="eq-page-header">
        <h1>{spec.title}</h1>
        <button className="eq-button eq-primary" onClick={() => edit("new")}>
          <Plus size={15} />
          {spec.button}
        </button>
      </div>
      {spec.description && <p style={{ marginBottom: 25, maxWidth: 850 }}>{spec.description}</p>}
      <DataTable
        loading={records === undefined}
        emptyDescription={equityData.sheets.length ? <ImportHelp /> : undefined}
        rows={(records || []).map((r) => ({ ...r, key: r._id }))}
        columns={[
          {
            key: "title",
            label: "Name",
            value: (r) => r.title,
            render: (r) => (
              <button className="eq-text-button" onClick={() => edit(r)}>
                {r.title}
              </button>
            ),
          },
          ...spec.fields.slice(0, 3).map((field) => ({
            key: field,
            label: field,
            value: (r: RecordItem) => String(r.data[field] || "—"),
          })),
          { key: "status", label: "Status", value: (r) => r.status },
          {
            key: "date",
            label: "Created",
            value: (r) => new Date(r._creationTime).toLocaleDateString(),
          },
        ]}
      />
      {editing && (
        <Modal
          title={editing === "new" ? spec.button : `Edit ${title}`}
          onClose={() => setEditing(null)}
          wide
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await save({
                  companyId: company._id,
                  id: editing === "new" ? undefined : editing._id,
                  revision: editing === "new" ? undefined : editing.revision,
                  kind: spec.kind,
                  title,
                  status,
                  data,
                });
                setEditing(null);
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Title">
              <input required value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <div className="eq-form-grid">
              {spec.fields.map((field) => (
                <Field key={field} label={field}>
                  {["Notes", "Message", "Content"].includes(field) ? (
                    <textarea
                      rows={5}
                      value={data[field] || ""}
                      onChange={(e) => setData({ ...data, [field]: e.target.value })}
                    />
                  ) : (
                    <input
                      type={field.includes("Date") ? "date" : field === "Email" ? "email" : "text"}
                      value={data[field] || ""}
                      onChange={(e) => setData({ ...data, [field]: e.target.value })}
                    />
                  )}
                </Field>
              ))}
            </div>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option>Draft</option>
                <option>Recorded</option>
                <option>Archived</option>
              </select>
            </Field>
            {["approval", "consent", "offer"].includes(spec.kind) && (
              <p className="eq-import-note">
                Choose “Recorded” for a completed, signed document. Keep offers and consents in
                “Draft” until they are finalized.
              </p>
            )}
            {error && <p className="eq-error">{error}</p>}
            <div className="eq-form-actions">
              <button
                type="button"
                className="eq-button"
                onClick={() =>
                  downloadText(
                    `${title || "draft"}.txt`,
                    [title, ...Object.entries(data).map(([k, v]) => `${k}: ${v}`)].join("\n\n"),
                  )
                }
              >
                <Download size={14} />
                Download Draft
              </button>
              <button type="button" className="eq-button" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button disabled={busy} className="eq-button eq-primary">
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
export function DataRoom({
  title = "Data Room",
  category = "Company",
}: {
  title?: string;
  category?: string;
}) {
  const { company, data: equityData } = useCompany();
  const records = useQuery(api.records.list, { companyId: company._id, kind: "document" });
  const generate = useMutation(api.records.uploadUrl),
    attach = useMutation(api.records.attach);
  const convex = useConvex();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error("Choose a file under 30 MB.");
      const url = await generate({ companyId: company._id });
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw new Error("File upload failed. Try again.");
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      await attach({ companyId: company._id, storageId, filename: file.name, category });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function download(record: RecordItem) {
    try {
      const url = await convex.query(api.records.download, { id: record._id });
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        a.download = record.title;
        a.click();
      }
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <section className="eq-panel">
      <div className="eq-page-header">
        <h1>{title}</h1>
        <button
          className="eq-button eq-primary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} />
          {busy ? "Uploading…" : "Upload Document"}
        </button>
        <input
          ref={input}
          type="file"
          hidden
          onChange={(e) => {
            if (e.target.files?.[0]) void upload(e.target.files[0]);
          }}
        />
      </div>
      <p className="eq-muted" style={{ marginBottom: 25 }}>
        Signed agreements, board consents, valuations and supporting company documents.
      </p>
      {error && <p className="eq-error">{error}</p>}
      <DataTable
        loading={records === undefined}
        emptyDescription={equityData.sheets.length ? <ImportHelp /> : undefined}
        rows={(records || [])
          .filter((r) => category === "Company" || r.data.category === category)
          .map((r) => ({ ...r, key: r._id }))}
        columns={[
          {
            key: "name",
            label: "Document",
            value: (r) => r.title,
            render: (r) => (
              <button className="eq-text-button" onClick={() => void download(r)}>
                {r.title}
              </button>
            ),
          },
          { key: "category", label: "Category", value: (r) => r.data.category },
          {
            key: "date",
            label: "Upload Date",
            value: (r) => new Date(r._creationTime).toLocaleDateString(),
          },
          { key: "by", label: "Uploaded By", value: (r) => r.data.uploadedBy },
          {
            key: "size",
            label: "Size",
            value: (r) => `${Math.ceil(Number(r.data.size) / 1024)} KB`,
          },
        ]}
      />
    </section>
  );
}
export const recordSections = Object.keys(specs);

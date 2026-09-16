import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Upload, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { api } from "@capy/backend/convex/_generated/api";
import type { Id } from "@capy/backend/convex/_generated/dataModel";
import type { EquityImport } from "@capy/equity";
import { totals, formatNumber } from "@capy/equity";
import { readPulleyWorkbook } from "@/lib/import-workbook";
import { Field } from "./ui";
import { ImportHelp } from "./import-help";
import { savePendingImport, loadPendingImport, clearPendingImport } from "@/lib/pending-import";
import { trackFunnel } from "@/lib/funnel";

export function ImportCompany({ companyId }: { companyId?: Id<"companies"> }) {
  const user = useQuery(api.auth.getCurrentUser);
  const [restored, setRestored] = useState<{ data: EquityImport; filename: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const pending = useRef<Awaited<ReturnType<typeof start>> | null>(null);
  const start = useMutation(api.equity.startImport),
    append = useMutation(api.equity.appendImport),
    complete = useMutation(api.equity.completeImport);
  const navigate = useNavigate();
  useEffect(() => {
    if (!user) return;
    let alive = true;
    loadPendingImport(user._id)
      .then((value) => {
        if (alive) setRestored(value);
      })
      .catch(() => {
        if (alive)
          setRestoreError(
            "Your saved preview couldn’t be restored. Choose your export to continue.",
          );
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [user?._id]);
  if (!ready)
    return (
      <p className="eq-status" role="status">
        Preparing your import…
      </p>
    );
  return (
    <>
      <p className="eq-error" hidden={!restoreError}>
        {restoreError}
      </p>
      <ImportEditor
        initial={restored}
        locked={() => !!pending.current}
        onReset={() => {
          pending.current = null;
        }}
        onConfirm={async (data, filename, setBusy) => {
          if (!pending.current)
            pending.current = await start({
              companyId,
              filename,
              metadata: { ...data, securities: [], stakeholders: [] },
              people: data.stakeholders.length,
              securities: data.securities.length,
            });
          const { importId } = pending.current;
          for (let i = 0; i < data.stakeholders.length; i += 50) {
            setBusy(
              `Importing stakeholders ${Math.min(i + 50, data.stakeholders.length)} of ${data.stakeholders.length}…`,
            );
            await append({
              importId,
              stakeholders: data.stakeholders.slice(i, i + 50),
              securities: [],
            });
          }
          for (let i = 0; i < data.securities.length; i += 50) {
            setBusy(
              `Importing securities ${Math.min(i + 50, data.securities.length)} of ${data.securities.length}…`,
            );
            await append({
              importId,
              stakeholders: [],
              securities: data.securities.slice(i, i + 50),
            });
          }
          const importedCompanyId = await complete({ importId });
          await clearPendingImport();
          trackFunnel("import_completed");
          await navigate({
            to: "/companies/$companyId/$",
            params: { companyId: importedCompanyId, _splat: "dashboard" },
          });
        }}
      />
    </>
  );
}
export function ImportPreview() {
  return (
    <ImportEditor
      preview
      onConfirm={async (data, filename) => {
        await savePendingImport(data, filename);
        trackFunnel("import_preview_continue");
        window.location.assign("/signup");
      }}
    />
  );
}
function ImportEditor({
  initial,
  preview = false,
  onConfirm,
  onReset,
  locked = () => false,
}: {
  initial?: { data: EquityImport; filename: string } | null;
  preview?: boolean;
  onConfirm: (
    data: EquityImport,
    filename: string,
    setBusy: (message: string) => void,
  ) => Promise<void>;
  onReset?: () => void;
  locked?: () => boolean;
}) {
  const [data, setData] = useState<EquityImport | null>(initial?.data || null),
    [filename, setFilename] = useState(initial?.filename || ""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function read(file: File) {
    setBusy("Reading your export…");
    setError("");
    onReset?.();
    try {
      if (!/\.xlsx$/i.test(file.name))
        throw new Error("Choose the .xlsx file from Pulley’s Download Cap Table button.");
      const parsed = await readPulleyWorkbook(await file.arrayBuffer(), file.name);
      setData(parsed);
      setFilename(file.name);
      trackFunnel(preview ? "import_preview_ready" : "import_ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this export.");
      setData(null);
    } finally {
      setBusy("");
    }
  }
  async function save() {
    if (!data) return;
    setError("");
    setBusy(preview ? "Saving your preview…" : "Starting your import…");
    try {
      await onConfirm(data, filename, setBusy);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed. You can retry safely.");
    } finally {
      setBusy("");
    }
  }
  const numbers = data ? totals(data) : null;
  return (
    <section className="eq-import">
      <h1>{preview ? "Preview your Pulley import" : "Bring your cap table to Capy"}</h1>
      <p>
        {preview
          ? "See your cap table before creating an account. Your file stays in your browser until you sign in and confirm the import."
          : "Upload your Pulley export and pick up where you left off."}
      </p>
      {!data ? (
        <div
          className="eq-dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!busy && e.dataTransfer.files[0]) void read(e.dataTransfer.files[0]);
          }}
        >
          <FileSpreadsheet size={38} />
          <h3>Your Pulley cap table</h3>
          <p>In Pulley, open Cap Table → Download → All time.</p>
          <button
            className="eq-button eq-primary"
            disabled={!!busy}
            onClick={() => input.current?.click()}
          >
            <Upload size={16} />
            Choose Excel export
          </button>
          <p className="eq-muted">.xlsx · up to 20 MB · 5,000 securities</p>
          <input
            ref={input}
            hidden
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              if (e.target.files?.[0]) void read(e.target.files[0]);
            }}
          />
        </div>
      ) : (
        <>
          <div className="eq-import-file">
            <CheckCircle2 size={22} />
            <div>
              <strong>{filename}</strong>
              <p>
                {data.securities.length} securities · {data.stakeholders.length} stakeholders ·{" "}
                {data.plans.length} equity plans
              </p>
            </div>
          </div>
          <div className="eq-form-grid">
            <Field label="Company name">
              <input
                disabled={locked()}
                value={data.name}
                onChange={(e) => setData({ ...data, name: e.target.value })}
              />
            </Field>
            <Field label="Export as of">
              <input
                disabled={locked()}
                type="date"
                value={data.asOf}
                onChange={(e) => setData({ ...data, asOf: e.target.value })}
              />
            </Field>
          </div>
          <div className="eq-stats">
            <div>
              <span>Fully diluted shares</span>
              <strong>{formatNumber(numbers!.fullyDiluted)}</strong>
            </div>
            <div>
              <span>Capital contribution</span>
              <strong>${formatNumber(numbers!.capital, 2)}</strong>
            </div>
            <div>
              <span>Available plan shares</span>
              <strong>{formatNumber(numbers!.available)}</strong>
            </div>
          </div>
          <div className="eq-import-notes">
            <h3>Import notes</h3>
            <ul>
              {data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
          <div className="eq-actions">
            <button
              className="eq-button"
              disabled={!!busy}
              onClick={() => {
                setData(null);
                onReset?.();
                void clearPendingImport();
              }}
            >
              Choose another file
            </button>
            <button
              className="eq-button eq-primary"
              disabled={!!busy || !data.name || !data.asOf}
              onClick={() => void save()}
            >
              {preview ? "Create account to save" : "Import company"}
            </button>
          </div>
        </>
      )}
      {preview && (
        <p className="eq-preview-skip">
          No export handy? <Link to="/signup">Create an account and import later →</Link>
        </p>
      )}
      <ImportHelp detailed />
      {busy && (
        <p role="status" className="eq-status">
          {busy}
        </p>
      )}
      {error && (
        <p role="alert" className="eq-error">
          {error}
        </p>
      )}
    </section>
  );
}

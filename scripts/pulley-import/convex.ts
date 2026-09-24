// Shared helpers for running operator functions and uploading documents during an import.
import { writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { EquityImport } from "../../packages/equity/src/index.ts";
import type { ImportDocument } from "../../packages/equity/src/pulley-api.ts";

const backend = resolve(import.meta.dirname, "../../packages/backend");

export function operator(prod: boolean) {
  return async function run<T>(fn: string, input: object): Promise<T> {
    const args = ["bunx", "convex", "run", ...(prod ? ["--prod"] : []), `operator:${fn}`];
    const proc = Bun.spawn([...args, JSON.stringify(input)], {
      cwd: backend,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    if (await proc.exited) throw new Error(`operator:${fn} failed:\n${err}`);
    return (out.trim() ? JSON.parse(out) : null) as T;
  };
}
export type Run = ReturnType<typeof operator>;

export const batches = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

const types: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".csv": "text/csv",
};

/** Uploads files to Convex storage and attaches them to the company, 25 at a time. */
export async function uploadDocuments(
  run: Run,
  dir: string,
  companyId: string,
  documents: ImportDocument[],
) {
  let uploaded = 0;
  for (const batch of batches(documents, 25)) {
    const urls = await run<string[]>("uploadUrls", { count: batch.length });
    const attached = [];
    for (const [i, d] of batch.entries()) {
      const file = Bun.file(resolve(dir, d.file));
      if (!(await file.exists())) throw new Error(`Missing file for ${d.filename}: ${d.file}`);
      const response = await fetch(urls[i]!, {
        method: "POST",
        headers: {
          "Content-Type": types[extname(d.file).toLowerCase()] ?? "application/octet-stream",
        },
        body: file,
      });
      if (!response.ok) throw new Error(`Upload failed for ${d.filename}: ${response.status}`);
      const { storageId } = (await response.json()) as { storageId: string };
      attached.push({
        source: d.source,
        storageId,
        filename: d.filename,
        category: d.category,
        certificates: d.certificates,
      });
    }
    uploaded += attached.length;
    await run("attachDocuments", {
      companyId,
      documents: attached,
      ...(uploaded === documents.length ? { total: documents.length } : {}),
    });
    console.log(`Uploaded ${uploaded} of ${documents.length} documents.`);
  }
}

export type StoredCompany = EquityImport & {
  records: { kind: string; title: string; status: string; source: string | null }[];
};

/** Reads back what Capy stored and reconciles it against Pulley. Returns the exit code. */
export async function verify(run: Run, dir: string, companyId: string) {
  const stored = await run<StoredCompany>("companySnapshot", { companyId });
  writeFileSync(resolve(dir, "capy-stored.json"), JSON.stringify(stored, null, 1));
  const check = Bun.spawn(
    [
      "bun",
      resolve(import.meta.dirname, "reconcile.ts"),
      resolve(dir, "raw"),
      resolve(dir, "capy-stored.json"),
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  return await check.exited;
}

// Loads a built Pulley import (see build.ts) into Capy as a new company, then checks the stored
// result against Pulley's numbers.
//   bun scripts/pulley-import/load.ts <company-dir> --owner <email> [--prod]
// The owner must already have a Capy account. Hand the company to its founder later with:
//   bunx convex run [--prod] operator:shareCompany '{"companyId":"…","email":"…","owner":true}'
import { readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { EquityImport } from "../../packages/equity/src/index.ts";
import type { ImportDocument, ImportRecord } from "../../packages/equity/src/pulley-api.ts";

const args = process.argv.slice(2);
const dir = args[0];
const ownerEmail = args[args.indexOf("--owner") + 1];
const deployment = args.includes("--prod") ? ["--prod"] : [];
if (!dir || !args.includes("--owner") || !ownerEmail)
  throw new Error("Usage: load.ts <company-dir> --owner <email> [--prod]");
const backend = resolve(import.meta.dirname, "../../packages/backend");
const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(dir, name), "utf8"));

async function run<T>(fn: string, input: object): Promise<T> {
  const proc = Bun.spawn(
    ["bunx", "convex", "run", ...deployment, `operator:${fn}`, JSON.stringify(input)],
    {
      cwd: backend,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (await proc.exited) throw new Error(`operator:${fn} failed:\n${err}`);
  return (out.trim() ? JSON.parse(out) : null) as T;
}
const batches = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

const data = read<EquityImport>("capy-import.json");
const records = read<ImportRecord[]>("records.json");
const documents = read<ImportDocument[]>("documents.json");

await run("findUser", { email: ownerEmail });
const { stakeholders, securities, ...metadata } = data;
const { companyId, importId } = await run<{ companyId: string; importId: string }>("startImport", {
  ownerEmail,
  filename: `Pulley full import (${data.asOf})`,
  metadata,
  people: stakeholders.length,
  securities: securities.length,
});
console.log(`Company ${companyId}, import ${importId}`);
for (const batch of batches(stakeholders, 50))
  await run("appendImport", { ownerEmail, importId, stakeholders: batch, securities: [] });
for (const batch of batches(securities, 25))
  await run("appendImport", { ownerEmail, importId, stakeholders: [], securities: batch });
await run("completeImport", { ownerEmail, importId });
console.log(`Loaded ${stakeholders.length} stakeholders and ${securities.length} securities.`);

await run("addRecords", { companyId, records });
console.log(`Added ${records.length} records.`);

const types: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const files = new Map(
  (await Array.fromAsync(new Bun.Glob("*").scan(resolve(dir, "documents")))).map((f) => [
    Number(f.split("__")[0]),
    f,
  ]),
);
let uploaded = 0;
for (const batch of batches(documents, 25)) {
  const urls = await run<string[]>("uploadUrls", { count: batch.length });
  const attached = [];
  for (const [i, d] of batch.entries()) {
    const file = files.get(d.fileId);
    if (!file) throw new Error(`Missing downloaded file for ${d.filename}`);
    const body = Bun.file(resolve(dir, "documents", file));
    const response = await fetch(urls[i]!, {
      method: "POST",
      headers: { "Content-Type": types[extname(file).toLowerCase()] ?? "application/octet-stream" },
      body,
    });
    if (!response.ok) throw new Error(`Upload failed for ${d.filename}: ${response.status}`);
    const { storageId } = (await response.json()) as { storageId: string };
    attached.push({
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

const stored = await run<EquityImport>("companySnapshot", { companyId });
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
process.exitCode = await check.exited;
console.log(`Done. Company ${companyId} is owned by ${ownerEmail}.`);

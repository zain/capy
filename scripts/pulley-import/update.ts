// Brings an already loaded company up to date with a newer build: fills blank company profile
// fields, adds new stakeholder and security fields without changing existing ones, and uploads
// documents the company doesn't have yet. Balances are never changed.
//   bun scripts/pulley-import/update.ts <company-dir> --company <id> [--prod]
// Files loaded before documents carried a source can be listed in documents-loaded.json.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EquityImport } from "../../packages/equity/src/index.ts";
import type { ImportDocument } from "../../packages/equity/src/pulley-api.ts";
import { batches, operator, uploadDocuments, verify, type StoredCompany } from "./convex.ts";

const args = process.argv.slice(2);
const dir = args[0];
const companyId = args[args.indexOf("--company") + 1];
if (!dir || !args.includes("--company") || !companyId)
  throw new Error("Usage: update.ts <company-dir> --company <id> [--prod]");
const run = operator(args.includes("--prod"));
const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(dir, name), "utf8"));

const data = read<EquityImport>("capy-import.json");
const documents = read<ImportDocument[]>("documents.json");
const stored = await run<StoredCompany>("companySnapshot", { companyId });

await run("setProfile", { companyId, profile: read<Record<string, string>>("profile.json") });
console.log("Filled blank company profile fields.");

function additions<T extends { key: string; fields?: Record<string, string | null> }>(
  next: T[],
  current: T[],
) {
  const byKey = new Map(current.map((c) => [c.key, c]));
  return next.flatMap((n) => {
    const have = byKey.get(n.key)?.fields ?? {};
    const fields = Object.fromEntries(
      Object.entries(n.fields ?? {}).filter(([k, v]) => v && !have[k]),
    ) as Record<string, string>;
    return byKey.has(n.key) && Object.keys(fields).length ? [{ key: n.key, fields }] : [];
  });
}
const stakeholders = additions(data.stakeholders, stored.stakeholders);
const securities = additions(data.securities, stored.securities);
for (const items of batches(stakeholders, 100))
  await run("mergeFields", { companyId, stakeholders: items, securities: [] });
for (const items of batches(securities, 100))
  await run("mergeFields", { companyId, stakeholders: [], securities: items });
console.log(
  `Added fields to ${stakeholders.length} stakeholders and ${securities.length} securities.`,
);

const have = new Set(stored.records.map((r) => r.source).filter(Boolean));
if (existsSync(resolve(dir, "documents-loaded.json")))
  for (const d of read<{ source?: string; fileId?: number }[]>("documents-loaded.json"))
    have.add(d.source ?? `file:${d.fileId}`);
const pending = documents.filter((d) => !have.has(d.source));
console.log(
  `${documents.length - pending.length} documents already loaded, ${pending.length} to add.`,
);
if (pending.length) await uploadDocuments(run, dir, companyId, pending);

process.exitCode = await verify(run, dir, companyId);

// Loads a built Pulley import (see build.ts) into Capy as a new company, then checks the stored
// result against Pulley's numbers.
//   bun scripts/pulley-import/load.ts <company-dir> --owner <email> [--prod]
// The owner must already have a Capy account. Hand the company to its founder later with:
//   bunx convex run [--prod] operator:shareCompany '{"companyId":"…","email":"…","owner":true}'
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EquityImport } from "../../packages/equity/src/index.ts";
import type { ImportDocument, ImportRecord } from "../../packages/equity/src/pulley-api.ts";
import { batches, operator, uploadDocuments, verify } from "./convex.ts";

const args = process.argv.slice(2);
const dir = args[0];
const ownerEmail = args[args.indexOf("--owner") + 1];
if (!dir || !args.includes("--owner") || !ownerEmail)
  throw new Error("Usage: load.ts <company-dir> --owner <email> [--prod]");
const run = operator(args.includes("--prod"));
const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(dir, name), "utf8"));

const data = read<EquityImport>("capy-import.json");
const records = read<ImportRecord[]>("records.json");
const documents = read<ImportDocument[]>("documents.json");
const profile = read<Record<string, string>>("profile.json");

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

await run("setProfile", { companyId, profile });
await run("addRecords", { companyId, records });
console.log(`Added the company profile and ${records.length} records.`);
await uploadDocuments(run, dir, companyId, documents);

process.exitCode = await verify(run, dir, companyId);
console.log(`Done. Company ${companyId} is owned by ${ownerEmail}.`);

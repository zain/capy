// Builds a Capy import from Pulley's Excel export plus a snapshot of Pulley's web API.
//   bun scripts/pulley-import/build.ts <company-dir>
// <company-dir> holds pulley-export.xlsx, raw/ (API JSON) and documents-manifest.json.
// Writes capy-import.json, records.json and documents.json into the same folder.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readPulleyWorkbook } from "../../apps/web/src/lib/import-workbook.ts";
import {
  enrichFromPulley,
  pulleyDocuments,
  pulleyRecords,
  type PulleySnapshot,
} from "../../packages/equity/src/pulley-api.ts";

const dir = process.argv[2];
if (!dir) throw new Error("Usage: build.ts <company-dir>");
const raw = (name: string) => {
  const json = JSON.parse(readFileSync(resolve(dir, "raw", name), "utf8"));
  return json.data ?? json;
};
const details: PulleySnapshot["securityDetails"] = {};
for (const file of readdirSync(resolve(dir, "raw/securities")))
  if (/^\d+\.json$/.test(file)) details[file.replace(".json", "")] = raw(`securities/${file}`);
const api: PulleySnapshot = {
  securities: raw("securities.json"),
  securityDetails: details,
  convertibles: raw("convertibles.json"),
  stakeholders: raw("stakeholders.json"),
  shareClasses: raw("share_classes.json"),
  employees: raw("employees.json"),
  boardApprovals: raw("board_approvals.json"),
  boardMembers: raw("board_members.json"),
  valuations: raw("fmv.json"),
};
const xlsx = readFileSync(resolve(dir, "pulley-export.xlsx"));
const base = await readPulleyWorkbook(
  xlsx.buffer.slice(xlsx.byteOffset, xlsx.byteOffset + xlsx.byteLength) as ArrayBuffer,
  "pulley-export.xlsx",
);
const data = enrichFromPulley(base, api);
const records = pulleyRecords(api, data.name);
const manifest = JSON.parse(readFileSync(resolve(dir, "documents-manifest.json"), "utf8"));
const downloaded = new Set(
  readdirSync(resolve(dir, "documents")).map((f) => Number(f.split("__")[0])),
);
const documents = pulleyDocuments(api, manifest).filter((d) => downloaded.has(d.fileId));
const missing = manifest.filter((f: { id: number }) => !downloaded.has(f.id));

writeFileSync(resolve(dir, "capy-import.json"), JSON.stringify(data, null, 1));
writeFileSync(resolve(dir, "records.json"), JSON.stringify(records, null, 1));
writeFileSync(resolve(dir, "documents.json"), JSON.stringify(documents, null, 1));
const withEvents = data.securities.filter((s) => s.vestEvents?.length).length;
console.log(
  `${data.name}: ${data.stakeholders.length} stakeholders (${data.stakeholders.filter((s) => s.email).length} with email), ${data.securities.length} securities (${withEvents} with vesting events), ${records.length} records, ${documents.length} documents.`,
);
if (missing.length)
  console.log(
    `Not downloadable from Pulley: ${missing.map((f: { filename: string }) => f.filename).join("; ")}`,
  );
console.log(data.warnings.length ? `Warnings:\n- ${data.warnings.join("\n- ")}` : "No warnings.");

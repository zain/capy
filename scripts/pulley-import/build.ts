// Builds a Capy import from Pulley's Excel export plus a snapshot of Pulley's web API.
//   bun scripts/pulley-import/build.ts <company-dir>
// <company-dir> holds pulley-export.xlsx, raw/ (API JSON), documents/ (data room files named
// <fileId>__<filename>) and certificates/ (stock certificates named <securityId>__<name>.pdf).
// Writes capy-import.json, records.json, documents.json and profile.json into the same folder.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readPulleyWorkbook } from "../../apps/web/src/lib/import-workbook.ts";
import {
  enrichFromPulley,
  pulleyAuditCsv,
  pulleyDocuments,
  pulleyProfile,
  pulleyRecords,
  type PulleySnapshot,
} from "../../packages/equity/src/pulley-api.ts";

const dir = process.argv[2];
if (!dir) throw new Error("Usage: build.ts <company-dir>");
const raw = (name: string) => {
  const json = JSON.parse(readFileSync(resolve(dir, "raw", name), "utf8"));
  return json.data ?? json;
};
const optional = (name: string) => (existsSync(resolve(dir, "raw", name)) ? raw(name) : undefined);
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
  company: raw("company.json"),
  library: optional("gql_DocumentLibrary.json")?.company?.fileUploads,
  folders: optional("gql_DocumentLibraryFolders.json")?.folders,
  certificates: optional("certificates.json"),
  auditLog: optional("gql_GetAuditCompany.json")?.audit_log,
};
const xlsx = readFileSync(resolve(dir, "pulley-export.xlsx"));
const base = await readPulleyWorkbook(
  xlsx.buffer.slice(xlsx.byteOffset, xlsx.byteOffset + xlsx.byteLength) as ArrayBuffer,
  "pulley-export.xlsx",
);
const data = enrichFromPulley(base, api);
const records = pulleyRecords(api, data.name);

const downloaded = (folder: string) =>
  new Map(
    existsSync(resolve(dir, folder))
      ? readdirSync(resolve(dir, folder)).map((f) => [Number(f.split("__")[0]), `${folder}/${f}`])
      : [],
  );
const documents = pulleyDocuments(api, {
  library: downloaded("documents"),
  certificates: downloaded("certificates"),
});
if (api.auditLog?.length) {
  mkdirSync(resolve(dir, "generated"), { recursive: true });
  writeFileSync(resolve(dir, "generated/pulley-activity-history.csv"), pulleyAuditCsv(api));
  documents.push({
    source: "audit-log",
    file: "generated/pulley-activity-history.csv",
    filename: "Pulley activity history.csv",
    category: "Reports",
    certificates: [],
  });
}
const loaded = new Set(documents.map((d) => d.source));
const missing = [
  ...(api.library ?? []).filter((f) => !loaded.has(`file:${f.id}`)).map((f) => f.filename),
  ...(api.certificates ?? [])
    .filter((c) => !loaded.has(`certificate:${c.id}`))
    .map((c) => `certificate ${c.certificate_id}`),
];

writeFileSync(resolve(dir, "capy-import.json"), JSON.stringify(data, null, 1));
writeFileSync(resolve(dir, "records.json"), JSON.stringify(records, null, 1));
writeFileSync(resolve(dir, "documents.json"), JSON.stringify(documents, null, 1));
writeFileSync(resolve(dir, "profile.json"), JSON.stringify(pulleyProfile(api.company!), null, 1));
const withEvents = data.securities.filter((s) => s.vestEvents?.length).length;
console.log(
  `${data.name}: ${data.stakeholders.length} stakeholders (${data.stakeholders.filter((s) => s.email).length} with email), ${data.securities.length} securities (${withEvents} with vesting events), ${records.length} records, ${documents.length} documents.`,
);
if (missing.length) console.log(`Not downloaded yet: ${missing.join("; ")}`);
console.log(data.warnings.length ? `Warnings:\n- ${data.warnings.join("\n- ")}` : "No warnings.");

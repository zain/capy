// Lists full Pulley import requests and decrypts shared passwords with the offline private key.
//   bun scripts/pulley-access.ts                 production requests
//   bun scripts/pulley-access.ts --forget <id>   delete a stored password after the import
// Add --dev to use the development deployment. The key defaults to ~/.config/capy/pulley-access.pem
// and can be moved with PULLEY_ACCESS_KEY.
import { constants, privateDecrypt } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

type AccessRequest = {
  _id: string;
  _creationTime: number;
  name: string;
  email: string;
  company: string;
  method: "password" | "invite";
  pulleyEmail?: string;
  encryptedPassword?: string;
  notes?: string;
};

const args = process.argv.slice(2);
const deployment = args.includes("--dev") ? [] : ["--prod"];
const backend = resolve(import.meta.dirname, "../packages/backend");

async function convex(fn: string, input: object = {}) {
  const run = Bun.spawn(["bunx", "convex", "run", ...deployment, fn, JSON.stringify(input)], {
    cwd: backend,
    stdout: "pipe",
    stderr: "inherit",
  });
  const output = await new Response(run.stdout).text();
  if (await run.exited) process.exit(1);
  return output.trim() ? JSON.parse(output) : null;
}

const forget = args.indexOf("--forget");
if (forget >= 0) {
  await convex("pulleyAccess:forget", { id: args[forget + 1] });
  console.log("Password deleted.");
  process.exit(0);
}

const keyPath =
  process.env.PULLEY_ACCESS_KEY ?? resolve(homedir(), ".config/capy/pulley-access.pem");
const key = await readFile(keyPath, "utf8");
const decrypt = (sealed: string) =>
  privateDecrypt(
    { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(sealed, "base64"),
  ).toString("utf8");

const requests = (await convex("pulleyAccess:list")) as AccessRequest[];
if (!requests.length) console.log("No Pulley import requests.");
for (const r of requests) {
  console.log(`\n${new Date(r._creationTime).toISOString()}  ${r.company}`);
  console.log(`  From:     ${r.name} <${r.email}>`);
  if (r.method === "invite")
    console.log("  Access:   inviting hello@capyinc.com as a Pulley admin");
  else {
    console.log(`  Pulley:   ${r.pulleyEmail}`);
    console.log(`  Password: ${r.encryptedPassword ? decrypt(r.encryptedPassword) : "(deleted)"}`);
  }
  if (r.notes) console.log(`  Notes:    ${r.notes}`);
  console.log(`  Id:       ${r._id}`);
}

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Convex injects the selected production deployment URL before building the web app.
const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl || !/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(convexUrl)) {
  throw new Error("Run bun run deploy so Convex selects the production backend before building.");
}
const root = resolve(import.meta.dirname, "..");
await writeFile(
  resolve(root, "apps/web/.env.production.local"),
  `VITE_CONVEX_URL=${convexUrl}\nVITE_CONVEX_SITE_URL=${convexUrl.replace(".cloud", ".site")}\n`,
);
const build = Bun.spawn(["bun", "run", "build"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await build.exited);

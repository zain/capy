import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { build } from "rolldown";
import type { Plugin } from "vite-plus";

const SUFFIX = "?mcp-app";
const PREFIX = "\0mcp-app:";
// Virtual ids end in .js so Vite's HTML plugin does not treat the widget as a page entry.
const VIRTUAL_EXT = ".js";
const MODULE_SCRIPT = /<script\s+type="module"\s+src="([^"]+)"\s*><\/script>/i;

/**
 * `import html from "./widget.html?mcp-app"` yields the widget as one self-contained HTML
 * string: the page's `<script type="module" src>` entry is bundled with its dependencies
 * and inlined, because MCP Apps hosts render the resource in a sandbox with no network.
 */
export function mcpAppWidgets(): Plugin {
  return {
    name: "capy:mcp-app-widgets",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!source.endsWith(SUFFIX)) return null;
      const file = source.slice(0, -SUFFIX.length);
      return PREFIX + resolve(importer ? dirname(importer) : process.cwd(), file) + VIRTUAL_EXT;
    },
    async load(id) {
      if (!id.startsWith(PREFIX)) return null;
      const htmlPath = id.slice(PREFIX.length, -VIRTUAL_EXT.length);
      this.addWatchFile(htmlPath);
      const html = await readFile(htmlPath, "utf8");
      const match = MODULE_SCRIPT.exec(html);
      if (!match) throw new Error(`${htmlPath}: expected one <script type="module" src="...">`);
      const entry = resolve(dirname(htmlPath), match[1]);
      const bundle = await build({
        input: entry,
        write: false,
        platform: "browser",
        output: { format: "esm", minify: true, codeSplitting: false },
      });
      const chunk = bundle.output.find((file) => file.type === "chunk");
      if (!chunk || chunk.type !== "chunk") throw new Error(`${entry}: bundle produced no chunk`);
      for (const moduleId of Object.keys(chunk.modules))
        if (!moduleId.includes("node_modules")) this.addWatchFile(moduleId);
      const code = chunk.code.replace(/<\/script/gi, "<\\/script");
      const inlined = html.replace(match[0], () => `<script type="module">${code}</script>`);
      return `export default ${JSON.stringify(inlined)};`;
    },
  };
}

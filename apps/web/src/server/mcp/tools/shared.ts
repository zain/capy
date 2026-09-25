import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { ContentBlock, McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import { z } from "zod";

export const o = z.looseObject;
export const dec = (what = "Decimal string") => z.string().describe(what);
export const pct = z
  .string()
  .describe("Percent of fully diluted shares, 0–100, as a decimal string");
export const url = z.string().describe("Absolute Capy URL");
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .describe("Date as YYYY-MM-DD");
export const asOf = z
  .string()
  .describe(
    "Snapshot date of the imported cap table (YYYY-MM-DD). Balances reflect this date plus events recorded in Capy since.",
  );
export const companyId = z
  .string()
  .optional()
  .describe(
    "Company ID from list_companies. Optional when the connection can see exactly one company. An exact company name also works.",
  );
export const limit = (fallback: number, max: number) =>
  z
    .number()
    .int()
    .min(1)
    .max(max)
    .optional()
    .describe(`Maximum rows to return (default ${fallback}, max ${max})`);
export const offset = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe("Rows to skip, from a previous result's nextOffset");
export const page = {
  total: z.number().describe("Matching rows in all pages"),
  offset: z.number(),
  nextOffset: z
    .number()
    .nullable()
    .describe("Pass as offset for the next page; null on the last page"),
};

export const readOnly: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

type Schema = z.ZodObject<z.ZodRawShape>;
type Output<O extends Schema> = { data: z.input<O>; text: string; extra?: ContentBlock[] };

/** Registers a tool whose result carries structured data plus a short markdown summary. */
export function tool<I extends Schema, O extends Schema>(
  server: McpServer,
  name: string,
  config: {
    title: string;
    description: string;
    input: I;
    output: O;
    annotations?: ToolAnnotations;
    /** `ui://` resource of the MCP App that renders this tool's result. */
    widget?: string;
  },
  run: (args: z.output<I>) => Promise<Output<O>>,
) {
  const definition = {
    title: config.title,
    description: config.description,
    inputSchema: config.input,
    outputSchema: config.output,
    annotations: { title: config.title, ...(config.annotations ?? readOnly) },
  };
  const callback = async (args: z.output<I>) => {
    const result = await run(args);
    return {
      content: [{ type: "text" as const, text: result.text }, ...(result.extra ?? [])],
      structuredContent: result.data as Record<string, unknown>,
    };
  };
  if (config.widget)
    registerAppTool(
      server,
      name,
      { ...definition, _meta: { ui: { resourceUri: config.widget } } },
      callback as never,
    );
  else server.registerTool(name, definition, callback as never);
}

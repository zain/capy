import Decimal from "decimal.js";
import { z } from "zod";
export { Decimal };

// Financial values remain decimal strings at storage and API boundaries.
export const decimalSchema = z
  .string()
  .max(80)
  .refine((value) => {
    try {
      return new Decimal(value).isFinite() && new Decimal(value).gte(0);
    } catch {
      return false;
    }
  }, "Enter a nonnegative number");
export const fieldsSchema = z.record(
  z.string().max(200),
  z.union([z.string().max(20000), z.null()]),
);
export const stakeholderSchema = z.object({
  key: z.string(),
  name: z.string().min(1).max(300),
  relationship: z.string().default(""),
  email: z.string().default(""),
  entityType: z.string().default(""),
  externalId: z.string().default(""),
  fields: fieldsSchema.optional(),
});
export const securitySchema = z.object({
  key: z.string(),
  certificate: z.string().min(1),
  stakeholderKey: z.string(),
  kind: z.enum(["share", "option", "rsa", "rsu", "warrant", "safe", "note", "piu"]),
  className: z.string().default(""),
  planName: z.string().default(""),
  issued: decimalSchema,
  outstanding: decimalSchema,
  price: decimalSchema.nullable(),
  capital: decimalSchema.nullable(),
  vested: decimalSchema.nullable(),
  balanceAsOf: z.string().optional(),
  issuedOn: z.string().default(""),
  vestingStart: z.string().default(""),
  vestingSchedule: z.string().default(""),
  status: z.string().default("Outstanding"),
  sourceSheet: z.string(),
  sourceRow: z.number().int().nonnegative(),
  fields: fieldsSchema,
});
export const planSchema = z.object({
  name: z.string(),
  authorized: decimalSchema,
  available: decimalSchema,
  className: z.string().default(""),
  status: z.string().optional(),
  boardApproval: z.string().optional(),
  termYears: decimalSchema.nullable().optional(),
});
export const classSchema = z.object({
  name: z.string(),
  kind: z.string(),
  authorized: decimalSchema.nullable(),
  reportedOutstanding: decimalSchema.nullable(),
  capital: decimalSchema.nullable(),
  parValue: decimalSchema.nullable().optional(),
  pricePerShare: decimalSchema.nullable().optional(),
});
export const importSchema = z.object({
  name: z.string().min(1).max(300),
  asOf: z.string(),
  stakeholders: z.array(stakeholderSchema).max(10000),
  securities: z.array(securitySchema).max(20000),
  plans: z.array(planSchema).max(200),
  classes: z.array(classSchema).max(200),
  warnings: z.array(z.string()),
  sheets: z.array(z.object({ name: z.string(), rows: z.number(), kind: z.string() })),
});
export type Stakeholder = z.infer<typeof stakeholderSchema>;
export type Security = z.infer<typeof securitySchema>;
export type EquityPlan = z.infer<typeof planSchema>;
export type ShareClass = z.infer<typeof classSchema>;
export type EquityImport = z.infer<typeof importSchema>;
export const D = (value: string | number | null | undefined) => new Decimal(value ?? 0);
export const sum = (values: (string | null | undefined)[]) =>
  values.reduce<Decimal>((total, value) => total.plus(D(value)), D(0)).toFixed();
export const isConvertible = (security: Security) =>
  security.kind === "safe" || security.kind === "note";
export function totals(data: Pick<EquityImport, "securities" | "plans" | "classes">) {
  const stock = data.securities.filter((s) => s.kind === "share");
  // RSA records describe stock already included in stock-class sheets.
  const awards = data.securities.filter((s) => !["share", "rsa", "safe", "note"].includes(s.kind));
  const outstandingStock = sum(stock.map((s) => s.outstanding));
  const outstandingAwards = sum(awards.map((s) => s.outstanding));
  const available = sum(data.plans.map((p) => p.available));
  const fullyDiluted = sum([outstandingStock, outstandingAwards, available]);
  const capital = sum([
    ...data.classes.map(
      (c) => c.capital ?? sum(stock.filter((s) => s.className === c.name).map((s) => s.capital)),
    ),
    ...data.securities.filter(isConvertible).map((s) => s.outstanding),
  ]);
  return {
    outstandingStock,
    outstandingAwards,
    available,
    fullyDiluted,
    capital,
    stakeholdersWithSecurities: new Set(
      data.securities.filter((s) => D(s.outstanding).gt(0)).map((s) => s.stakeholderKey),
    ).size,
  };
}
export function stakeholderShares(securities: Security[], key: string) {
  return sum(
    securities
      .filter((s) => s.stakeholderKey === key && !isConvertible(s) && s.kind !== "rsa")
      .map((s) => s.outstanding),
  );
}
export function percentage(numerator: string, denominator: string, places = 4) {
  return D(denominator).eq(0) ? "0" : D(numerator).div(denominator).mul(100).toFixed(places);
}
export function formatNumber(value: string | number | null | undefined, places?: number) {
  if (value === null || value === undefined || value === "") return "—";
  const [whole, fraction] = D(value).toFixed(places).split(".");
  return whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? "." + fraction : "");
}

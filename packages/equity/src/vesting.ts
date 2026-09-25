import { D, isConvertible } from "./index";
import type { EquityImport, Security, Stakeholder } from "./index";
import { terminationDate, vestingSteps } from "./modeling";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (value: string | null | undefined): value is string =>
  !!value && isoDate.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z"));
/** Adds calendar months, clamping to the end of shorter months (Jan 31 + 1 month = Feb 28). */
export function addMonths(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m + months, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}
export function addDays(date: string, days: number) {
  return new Date(Date.parse(date + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
}
/** Parses Pulley exercise periods such as "3 Months", "30 Days", "10 Years" or "0 Day". */
export function parsePeriod(text: string | null | undefined) {
  const match = (text || "").trim().match(/^(\d+)\s*(day|month|year)s?$/i);
  if (!match) return null;
  return { amount: Number(match[1]), unit: match[2]!.toLowerCase() as "day" | "month" | "year" };
}
export function addPeriod(date: string, period: NonNullable<ReturnType<typeof parsePeriod>>) {
  return period.unit === "day"
    ? addDays(date, period.amount)
    : addMonths(date, period.unit === "year" ? period.amount * 12 : period.amount);
}
const terminationFields = [
  [/cause/i, "Termination With Cause"],
  [/involuntary/i, "Involuntary Termination"],
  [/death/i, "Death"],
  [/disab/i, "Disability"],
  [/retire/i, "Retirement"],
] as const;
/**
 * Last day to exercise after termination: the earlier of termination + the exercise period chosen
 * by the holder's "Termination Type" (voluntary when unrecorded) and the option's expiration date.
 */
export function postTerminationDeadline(
  security: Security,
  stakeholder?: Pick<Stakeholder, "fields"> | null,
): { deadline: string | null; basis: string } {
  const terminated = terminationDate(security, stakeholder);
  if (!terminated) return { deadline: null, basis: "Not terminated" };
  if (!isIsoDate(terminated))
    return { deadline: null, basis: `Unrecognized termination date “${terminated}”` };
  const type = stakeholder?.fields?.["Termination Type"] || "";
  const field =
    terminationFields.find(([pattern]) => pattern.test(type))?.[1] ?? "Voluntary Termination";
  const periodText = security.fields[field] || "";
  const period = parsePeriod(periodText);
  const windowEnd = period ? addPeriod(terminated, period) : null;
  const expiration = security.fields["Expiration Date"];
  const expires = isIsoDate(expiration) ? expiration : null;
  const how = type
    ? `${type.toLowerCase()} termination`
    : "termination (type not recorded; assumed voluntary)";
  if (windowEnd && (!expires || windowEnd <= expires))
    return { deadline: windowEnd, basis: `${periodText} after ${how} on ${terminated}` };
  if (expires)
    return {
      deadline: expires,
      basis: windowEnd
        ? `Option expiration date, before the ${periodText} window after ${how} on ${terminated} ends`
        : `Option expiration date; no recognized ${field} exercise period after ${how} on ${terminated}`,
    };
  return {
    deadline: null,
    basis: `No recognized ${field} exercise period after ${how} on ${terminated}${periodText ? ` (“${periodText}”)` : ""}`,
  };
}
function periodEnds(from: string, to: string, interval: "month" | "quarter") {
  const dates: string[] = [];
  const [y, m] = from.split("-").map(Number) as [number, number];
  for (let i = 0; ; i++) {
    const end = new Date(Date.UTC(y, m + i, 0)).toISOString().slice(0, 10);
    if (end >= to) break;
    if (end > from && (interval === "month" || (m + i) % 3 === 0)) dates.push(end);
  }
  return dates;
}
/** Securities whose vesting a forecast covers: non-convertible grants and stock with a schedule or dated events. */
export const vestingScope = (s: Security) =>
  !isConvertible(s) &&
  s.kind !== "rsa" &&
  D(s.outstanding).gt(0) &&
  (Boolean(s.vestingSchedule) || Boolean(s.vestEvents?.length));
type Upcoming = {
  date: string;
  stakeholderKey: string;
  name: string;
  securityKey: string;
  certificate: string;
  shares: string;
};
const byDate = (a: Upcoming, b: Upcoming) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.certificate.localeCompare(b.certificate);
/**
 * Vested and unvested totals at each month or quarter end from `from` to `to`, and the next 50
 * vesting events after `from` and `today`. `from` defaults to today, and is never before the
 * snapshot, because balances before it cannot be rebuilt.
 */
export function vestingForecast(
  data: Pick<EquityImport, "asOf" | "stakeholders" | "securities">,
  options: {
    from?: string;
    to: string;
    interval?: "month" | "quarter";
    stakeholderKey?: string;
    planName?: string;
    today?: string;
  },
) {
  const asOf = data.asOf,
    interval = options.interval ?? "month";
  const today = isIsoDate(options.today) ? options.today : "";
  const requested = isIsoDate(options.from) ? options.from : today;
  const from = requested > asOf ? requested : asOf,
    to = options.to;
  if (!isIsoDate(to) || to < from) throw new Error(`Choose an end date on or after ${from}.`);
  if (to > addMonths(from, 240)) throw new Error("Choose a forecast of 20 years or less.");
  const holders = new Map(data.stakeholders.map((p) => [p.key, p]));
  const scope = data.securities.filter(
    (s) =>
      vestingScope(s) &&
      (!options.stakeholderKey || s.stakeholderKey === options.stakeholderKey) &&
      (!options.planName || s.planName === options.planName),
  );
  const dates = [from, ...periodEnds(from, to, interval), ...(to > from ? [to] : [])];
  const changes = dates.map(() => D(0));
  const after = today > from ? today : from;
  const unprojectable: { securityKey: string; certificate: string; schedule: string }[] = [];
  let upcoming: Upcoming[] = [],
    upcomingCount = 0,
    cutoff: Upcoming | null = null,
    vested = D(0),
    outstanding = D(0);
  for (const s of scope) {
    const holder = holders.get(s.stakeholderKey);
    const curve = vestingSteps(s, asOf, from, to, holder);
    if (!curve) {
      unprojectable.push({
        securityKey: s.key,
        certificate: s.certificate,
        schedule: s.vestingSchedule,
      });
      continue;
    }
    vested = vested.plus(curve.start);
    outstanding = outstanding.plus(s.outstanding);
    let last = curve.start,
      point = 0;
    for (const step of curve.steps) {
      while (dates[point]! < step.date) point++;
      const shares = D(step.vested).minus(last);
      changes[point] = changes[point]!.plus(shares);
      last = step.vested;
      if (!shares.gt(0) || step.date <= after) continue;
      upcomingCount++;
      const event = {
        date: step.date,
        stakeholderKey: s.stakeholderKey,
        name: holder?.name ?? "",
        securityKey: s.key,
        certificate: s.certificate,
        shares: shares.toFixed(),
      };
      if (cutoff && byDate(event, cutoff) > 0) continue;
      upcoming.push(event);
      if (upcoming.length >= 500) {
        upcoming = upcoming.sort(byDate).slice(0, 50);
        cutoff = upcoming[49]!;
      }
    }
  }
  const points = dates.map((date, i) => {
    vested = vested.plus(changes[i]!);
    return { date, vested: vested.toFixed(), unvested: outstanding.minus(vested).toFixed() };
  });
  return {
    asOf,
    from,
    to,
    interval,
    points,
    upcoming: upcoming.sort(byDate).slice(0, 50),
    upcomingCount,
    unprojectable,
  };
}

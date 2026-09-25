import { D, Decimal, isConvertible, stakeholderShares, sum, totals } from "./index";
import type { EquityImport, Security, Stakeholder } from "./index";

export function modelRound(data: EquityImport, preMoney: string, investment: string) {
  const fd = D(totals(data).fullyDiluted),
    valuation = D(preMoney),
    cash = D(investment);
  if (fd.lte(0)) throw new Error("This company has no shares on its cap table yet.");
  if (valuation.lte(0) || cash.lt(0))
    throw new Error("Enter a positive valuation and a nonnegative investment.");
  const convertibles = data.securities.filter((s) => isConvertible(s) && D(s.outstanding).gt(0));
  const specs = convertibles.map((s) => {
    // Pulley writes "Uncapped" for SAFEs without a cap; any non-numeric cap means no cap.
    const capText = s.fields["Valuation Cap"] || "",
      cap = /^\d/.test(capText.trim()) ? D(capText.replace(/,/g, "")) : D(0),
      discount = D(s.fields["Conversion Discount"] || 0).div(100),
      type = s.fields["Conversion Type"];
    if (discount.lt(0) || discount.gte(1))
      throw new Error(`${s.certificate}: discount must be below 100%.`);
    if (!["Pre-Money", "Post-Money"].includes(type || ""))
      throw new Error(`${s.certificate}: choose a pre-money or post-money conversion type.`);
    return {
      security: s,
      principal: D(s.outstanding).plus(s.fields["Interest Outstanding"] || 0),
      cap,
      discount,
      post: type === "Post-Money",
    };
  });
  const sharesAt = (total: Decimal) =>
    specs.map((s) => {
      const roundPrice = valuation.div(total).mul(D(1).minus(s.discount));
      const capPrice = s.cap.gt(0) ? s.cap.div(s.post ? total : fd) : roundPrice;
      return s.principal.div(Decimal.min(roundPrice, capPrice));
    });
  const convertedAt = (total: Decimal) => sharesAt(total).reduce((a, b) => a.plus(b), D(0));
  let low = fd,
    high = fd.mul(2),
    bracketed = false;
  for (let i = 0; i < 80; i++) {
    if (high.gte(fd.plus(convertedAt(high)))) {
      bracketed = true;
      break;
    }
    high = high.mul(2);
  }
  if (!bracketed)
    throw new Error(
      "These SAFE terms allocate 100% or more of the pre-round company. Increase the valuation or review the terms.",
    );
  for (let i = 0; i < 100; i++) {
    const midpoint = low.plus(high).div(2);
    if (midpoint.lt(fd.plus(convertedAt(midpoint)))) low = midpoint;
    else high = midpoint;
  }
  const afterSafes = low.plus(high).div(2),
    price = valuation.div(afterSafes),
    newShares = cash.div(price),
    afterRound = afterSafes.plus(newShares);
  const existing = data.stakeholders.map((p) => ({
    key: p.key,
    name: p.name,
    before: stakeholderShares(data.securities, p.key),
    converted: "0",
  }));
  const converted = sharesAt(afterSafes);
  specs.forEach((s, i) => {
    const row = existing.find((r) => r.key === s.security.stakeholderKey);
    if (row) row.converted = D(row.converted).plus(converted[i]!).toFixed();
  });
  const rows = [
    ...existing,
    ...data.plans.map((p) => ({
      key: p.name,
      name: `${p.name} (Unallocated)`,
      before: p.available,
      converted: "0",
    })),
    { key: "new-investors", name: "New investors", before: "0", converted: "0" },
  ].map((r) => {
    const after = D(r.before).plus(r.converted),
      final = r.key === "new-investors" ? newShares : after;
    return {
      ...r,
      afterSafes: after.toFixed(),
      afterRound: final.toFixed(),
      beforePercent: D(r.before).div(fd).mul(100).toFixed(2),
      safePercent: after.div(afterSafes).mul(100).toFixed(2),
      roundPercent: final.div(afterRound).mul(100).toFixed(2),
    };
  });
  return {
    rows,
    price: price.toFixed(6),
    newShares: newShares.toFixed(6),
    before: fd.toFixed(),
    afterSafes: afterSafes.toFixed(6),
    afterRound: afterRound.toFixed(6),
    safeShares: sum(converted.map((s) => s.toFixed())),
  };
}
function completedMonths(start: string, end: string) {
  const a = new Date(start + "T00:00:00Z"),
    b = new Date(end + "T00:00:00Z");
  if (Number.isNaN(a.valueOf()) || Number.isNaN(b.valueOf())) return null;
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  const monthEnd = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0)).getUTCDate();
  if (b.getUTCDate() < Math.min(a.getUTCDate(), monthEnd)) months--;
  return Math.max(0, months);
}
const monthlySchedule =
  /^1\/(\d+)(?:th)? monthly(?:,| w\/)?\s*(no cliff|25% vest at 12 month cliff|1 year cliff)$/;
/** Whether future vesting can be computed from events, a supported schedule, or a fully vested balance. */
export function canProjectVesting(s: Security) {
  return (
    Boolean(s.vestEvents?.length) ||
    (s.vested !== null && D(s.vested).gte(s.outstanding)) ||
    (Boolean(s.vestingStart) && monthlySchedule.test(s.vestingSchedule.toLowerCase()))
  );
}
/** The date vesting stops: the security's own termination date, else its holder's. */
export function terminationDate(s: Security, holder?: Pick<Stakeholder, "fields"> | null) {
  return s.fields["Termination Date"] || holder?.fields?.["Termination Date"] || "";
}
function vestedFromEvents(s: Security, target: string) {
  const vested = s.vestEvents!.reduce(
    (total, e) => (e.date <= target ? total.plus(e.shares) : total),
    D(0),
  );
  const exercised = D(s.fields["Exercised/Settled"] || 0);
  return Decimal.min(s.outstanding, Decimal.max(0, vested.minus(exercised))).toFixed();
}
/** Vested shares on `target`. Vesting stops at the termination date of the security or its holder. */
export function projectedVested(
  s: Security,
  asOf: string,
  target: string,
  holder?: Pick<Stakeholder, "fields"> | null,
): string | null {
  const termination = terminationDate(s, holder);
  if (s.vestEvents?.length)
    return vestedFromEvents(s, termination && termination < target ? termination : target);
  asOf = s.balanceAsOf || asOf;
  if (target === asOf) return s.vested;
  if (s.vested === null || !asOf || target < asOf) return null;
  // Vesting never reverses, so a fully vested balance stays fully vested.
  if (D(s.vested).gte(s.outstanding)) return s.outstanding;
  if (!s.vestingStart) return null;
  if (termination && termination <= asOf) return s.vested;
  const end = termination && termination < target ? termination : target;
  const match = s.vestingSchedule.toLowerCase().match(monthlySchedule);
  if (!match) return null;
  const duration = Number(match[1]),
    cliff = match[2] === "no cliff" ? 0 : 12;
  if (duration <= 0 || cliff > duration) return null;
  const startMonths = completedMonths(s.vestingStart, asOf),
    endMonths = completedMonths(s.vestingStart, end);
  if (startMonths === null || endMonths === null) return null;
  const amount = (months: number) =>
    months < cliff ? D(0) : D(s.issued).mul(Math.min(months, duration)).div(duration).floor();
  return Decimal.min(
    s.outstanding,
    D(s.vested).plus(Decimal.max(0, amount(endMonths).minus(amount(startMonths)))),
  ).toFixed();
}
function monthAnniversary(start: string, months: number) {
  const [y, m, d] = start.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m + months, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}
/**
 * The same vesting as `projectedVested`, as a step function over (from, to]: the vested amount on
 * `from`, then each date the amount changes. Dates before the security's balance date use its
 * recorded balance. Null when the vesting can't be projected.
 */
export function vestingSteps(
  s: Security,
  asOf: string,
  from: string,
  to: string,
  holder?: Pick<Stakeholder, "fields"> | null,
): { start: string; steps: { date: string; vested: string }[] } | null {
  if (!canProjectVesting(s)) return null;
  const termination = terminationDate(s, holder);
  const steps: { date: string; vested: string }[] = [];
  if (s.vestEvents?.length) {
    const events = [...s.vestEvents].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
    const exercised = D(s.fields["Exercised/Settled"] || 0);
    const vested = (total: Decimal) =>
      Decimal.min(s.outstanding, Decimal.max(0, total.minus(exercised))).toFixed();
    const stop = termination && termination < to ? termination : to,
      first = termination && termination < from ? termination : from;
    let total = D(0),
      i = 0;
    for (; i < events.length && events[i]!.date <= first; i++)
      total = total.plus(events[i]!.shares);
    const start = vested(total);
    let last = start;
    while (i < events.length && events[i]!.date <= stop) {
      const date = events[i]!.date;
      for (; i < events.length && events[i]!.date === date; i++)
        total = total.plus(events[i]!.shares);
      const value = vested(total);
      if (value !== last) steps.push({ date, vested: (last = value) });
    }
    return { start, steps };
  }
  const balance = s.balanceAsOf || asOf,
    recorded = s.vested;
  if (recorded === null || !balance) return null;
  if (D(recorded).gte(s.outstanding)) {
    if (from > balance) return { start: s.outstanding, steps };
    // The day after the balance date, projection caps an over-vested balance at outstanding.
    const day = Date.parse(balance + "T00:00:00Z"),
      next = Number.isNaN(day) ? to : new Date(day + 86400000).toISOString().slice(0, 10);
    if (to > balance && !D(recorded).eq(s.outstanding))
      steps.push({ date: next < to ? next : to, vested: s.outstanding });
    return { start: recorded, steps };
  }
  const constant = { start: recorded, steps };
  const match = s.vestingSchedule.toLowerCase().match(monthlySchedule);
  const duration = Number(match?.[1] ?? 0),
    cliff = match?.[2] === "no cliff" ? 0 : 12;
  const m0 = s.vestingStart ? completedMonths(s.vestingStart, balance) : null;
  if (!match || duration <= 0 || cliff > duration || m0 === null)
    return to > balance ? null : constant;
  if (termination && termination <= balance) return constant;
  const issued = D(s.issued),
    base = D(recorded),
    cap = D(s.outstanding);
  const amount = (months: number) =>
    months < cliff ? D(0) : issued.mul(Math.min(months, duration)).div(duration).floor();
  const a0 = amount(m0);
  const at = (months: number) =>
    Decimal.min(cap, base.plus(Decimal.max(0, amount(months).minus(a0)))).toFixed();
  const first = termination && termination < from ? termination : from;
  const mFrom = first > balance ? completedMonths(s.vestingStart, first)! : m0;
  const start = first > balance ? at(mFrom) : recorded;
  let last = start;
  for (let k = mFrom + 1; k <= duration && last !== s.outstanding; k++) {
    const date = monthAnniversary(s.vestingStart, k);
    if (date > to || (termination && date > termination)) break;
    const value = at(k);
    if (value !== last) steps.push({ date, vested: (last = value) });
  }
  return { start, steps };
}

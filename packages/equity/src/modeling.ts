import { D, Decimal, isConvertible, stakeholderShares, sum, totals } from "./index";
import type { EquityImport, Security } from "./index";

export function modelRound(data: EquityImport, preMoney: string, investment: string) {
  const fd = D(totals(data).fullyDiluted),
    valuation = D(preMoney),
    cash = D(investment);
  if (fd.lte(0) || valuation.lte(0) || cash.lt(0))
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
function vestedFromEvents(s: Security, target: string) {
  const vested = s.vestEvents!.reduce(
    (total, e) => (e.date <= target ? total.plus(e.shares) : total),
    D(0),
  );
  const exercised = D(s.fields["Exercised/Settled"] || 0);
  return Decimal.min(s.outstanding, Decimal.max(0, vested.minus(exercised))).toFixed();
}
export function projectedVested(s: Security, asOf: string, target: string): string | null {
  if (s.vestEvents?.length) return vestedFromEvents(s, target);
  asOf = s.balanceAsOf || asOf;
  if (target === asOf) return s.vested;
  if (s.vested === null || !asOf || target < asOf) return null;
  // Vesting never reverses, so a fully vested balance stays fully vested.
  if (D(s.vested).gte(s.outstanding)) return s.outstanding;
  if (!s.vestingStart) return null;
  const termination = s.fields["Termination Date"];
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

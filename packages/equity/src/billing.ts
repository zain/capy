export const FREE_UNTIL = Date.parse("2026-12-08T17:00:00Z");
export const BILLING_REMINDER_AT = Date.parse("2026-12-01T17:00:00Z");
export const CAPY_PRICE_ID = "price_1UG1uaLsj6FeHM5GdWOKb6R0";
export function billingAccess(paidUntil = 0, now = Date.now(), selfHosted = false) {
  return {
    selfHosted,
    canEdit: selfHosted || now < FREE_UNTIL || paidUntil > now,
    remind: !selfHosted && now >= BILLING_REMINDER_AT && paidUntil <= now,
    freeUntil: FREE_UNTIL,
  };
}
export async function verifyStripeSignature(
  body: string,
  header: string,
  secret: string,
  now = Date.now(),
) {
  const parts = header.split(",").map((p) => p.split("="));
  const timestamp = parts.find(([k]) => k === "t")?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300)
    return false;
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v || "");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  for (const signature of signatures) {
    if (!/^[a-f0-9]{64}$/i.test(signature)) continue;
    const bytes = Uint8Array.from(signature.match(/../g)!, (s) => parseInt(s, 16));
    if (await crypto.subtle.verify("HMAC", key, bytes, encoder.encode(`${timestamp}.${body}`)))
      return true;
  }
  return false;
}

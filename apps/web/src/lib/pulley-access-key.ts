// Public half of Capy's Pulley-import key (RSA-OAEP, SHA-256). The private half stays offline
// with the Capy team, so neither this app nor its database can read submitted passwords.
const PUBLIC_KEY =
  "MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAs0xXos4g8PoQig+hyZS1jEsmeRfpCoE2ZSDxCPAP8fvg7x6mfcRX2o0lKxo+GqooFGqhqpnSxX2pQEgy/WJETHXn3Yf72kYKCdY3KjZwyD98FTmL8AV8VNHtHdnwmCZtU0N46lV5SlCdZLq+MGOq/UlAPhYVxQlIAZx07mHpbzH+ihxnR/FC6C2rFG2uv+J5B6vIlxXe5PorgK7ffT/nHFOun8eCqzcrlvQP34RdxMRX3H2KTuu2bhVKen4933vZ5avvYBqp53VotcFFB6b14Lmk2gphiJ3fiVl7gTlwzRcPXC6XYU5z97LfuR1bMrSyLZBjqXi2Gg6KZjN6pjOfJ4SAOmdK23FEHO2FqEg6yy64EhHyyfqpWkNImFo6UevMhLNLo/cCqM78pbBm76ia1BkWiZh/TeE+5LoT5YWFe1LhsQT3tkEPMx35jfqPUFhfms6mLod3rtq1/XV+fQY+u/DKi5bGQ81tjRd8xRSAkNVtHR27HSj7zFiXZD1KvOcVAgMBAAE=";

export async function encryptForCapy(text: string) {
  const der = Uint8Array.from(atob(PUBLIC_KEY), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "spki",
    der,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, new TextEncoder().encode(text)),
  );
  return btoa(String.fromCharCode(...sealed));
}

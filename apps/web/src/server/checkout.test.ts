import { describe, expect, it } from "vite-plus/test";
import { canonicalRedirect } from "./canonical";

describe("existing public URLs", () => {
  it.each([
    ["http://capyinc.com/", "https://capyinc.com/"],
    ["https://www.capyinc.com/privacy", "https://capyinc.com/privacy"],
    ["https://capyinc.com/index.html", "https://capyinc.com/"],
    ["https://capyinc.com/terms.html?x=1", "https://capyinc.com/terms?x=1"],
    ["https://capyinc.com/success/", "https://capyinc.com/success"],
    ["https://capyinc.com/favicon.ico", "https://capyinc.com/favicon-32.png"],
  ])("redirects %s to %s", (from, to) => {
    const response = canonicalRedirect(new Request(from));
    expect(response?.status).toBe(301);
    expect(response?.headers.get("location")).toBe(to);
  });
  it("allows local development and canonical public pages", () => {
    expect(canonicalRedirect(new Request("http://localhost:3001/"))).toBeUndefined();
    expect(canonicalRedirect(new Request("https://capyinc.com/privacy"))).toBeUndefined();
  });
});

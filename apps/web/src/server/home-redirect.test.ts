import { describe, expect, it } from "vite-plus/test";
import { homeRedirect } from "./home-redirect";

describe("home redirect", () => {
  it("keeps the landing page on the hosted service", () => {
    expect(homeRedirect(false, false)).toBeNull();
    expect(homeRedirect(false, true)).toBeNull();
  });
  it("sends self-hosted visitors to the app", () => {
    expect(homeRedirect(true, true)).toBe("/dashboard");
    expect(homeRedirect(true, false)).toBe("/signup");
  });
});

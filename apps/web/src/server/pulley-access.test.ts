import { describe, expect, it } from "vite-plus/test";
import { alertEmail } from "./pulley-access-alert";

const request = {
  name: "Ada Founder",
  email: "ada@example.com",
  company: "Example\r\nBcc: someone@example.com",
  method: "password" as const,
  pulleyEmail: "ada@example.com",
  encryptedPassword: "sealed",
  notes: "Pulley texts me a code.",
};

describe("Pulley import alert", () => {
  it("keeps user input out of email headers", () => {
    expect(alertEmail(request, "ops@example.com").subject).not.toMatch(/[\r\n]/);
  });
  it("never includes the encrypted password", () => {
    const email = alertEmail(request, "ops@example.com");
    expect(JSON.stringify(email)).not.toContain(request.encryptedPassword);
    expect(email.replyTo.email).toBe("ada@example.com");
  });
  it("describes an admin invitation without sign-in details", () => {
    const email = alertEmail({ ...request, method: "invite", pulleyEmail: undefined }, "o@x.co");
    expect(email.text).toContain("invite hello@capyinc.com");
    expect(email.text).not.toContain("scripts/pulley-access.ts");
  });
});

import { describe, expect, it } from "vite-plus/test";
import { acceptProblem, isPending, normalizeEmail } from "@capy/backend/convex/teamRules";

const now = 1_000_000;
const invitation = { email: "johnny@example.com", expiresAt: now + 1, revoked: false };
const johnny = { id: "user-johnny", email: "Johnny@Example.com " };

describe("admin invitations", () => {
  it("normalizes emails", () => {
    expect(normalizeEmail("  Johnny@Example.COM ")).toBe("johnny@example.com");
  });

  it("lets the invited email accept, ignoring case", () => {
    expect(acceptProblem(invitation, johnny, now)).toBeNull();
  });

  it("refuses another email", () => {
    expect(acceptProblem(invitation, { id: "x", email: "someone@example.com" }, now)).toMatch(
      /is for johnny@example.com/,
    );
  });

  it("refuses missing, revoked and expired invitations", () => {
    expect(acceptProblem(null, johnny, now)).toMatch(/revoked/);
    expect(acceptProblem({ ...invitation, revoked: true }, johnny, now)).toMatch(/revoked/);
    expect(acceptProblem({ ...invitation, expiresAt: now - 1 }, johnny, now)).toMatch(/expired/);
  });

  it("is accepted once, by one account", () => {
    const accepted = { ...invitation, acceptedBy: johnny.id };
    expect(acceptProblem(accepted, johnny, now + 10 ** 9)).toBeNull();
    expect(acceptProblem(accepted, { id: "other", email: johnny.email }, now)).toMatch(
      /already been accepted/,
    );
  });

  it("counts only live, unaccepted invitations as pending", () => {
    expect(isPending(invitation, now)).toBe(true);
    expect(isPending({ ...invitation, revoked: true }, now)).toBe(false);
    expect(isPending({ ...invitation, acceptedBy: "u" }, now)).toBe(false);
    expect(isPending({ ...invitation, expiresAt: now - 1 }, now)).toBe(false);
  });
});

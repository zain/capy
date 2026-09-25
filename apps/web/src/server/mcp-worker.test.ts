import { describe, expect, it } from "vite-plus/test";
import { completable, isCompletable } from "@modelcontextprotocol/server";
import { z } from "zod";
import { absoluteLinks, acceptsResourceLinks, pickCompany, type Session } from "./mcp/context";
import { Refused, toolError, Unauthorized } from "./mcp/convex";
import { contentDisposition } from "./mcp/files";
import { lines, money, paging, percent, price, shares, table, whole } from "./mcp/format";

const company = (companyId: string, name: string) => ({
  companyId,
  name,
  role: "admin",
  isOwner: true,
  canEdit: true,
  canDraft: true,
  asOf: "2026-01-01",
  link: `/companies/${companyId}/dashboard`,
});
const session = (...companies: ReturnType<typeof company>[]) =>
  ({
    user: { name: "Jane Founder", email: "jane@example.com" },
    clientId: "client",
    clientName: "Acme Test Agent",
    allowDrafts: true,
    expiresAt: 0,
    companies,
  }) as unknown as Session;
const convexError = (data: unknown) => Object.assign(new Error("x"), { name: "ConvexError", data });

describe("MCP worker helpers", () => {
  it("makes link and reviewPath fields absolute, deeply, and nothing else", () => {
    const out = absoluteLinks(
      {
        link: "/companies/c1/captable",
        path: "/mcp/files/abc",
        rows: [{ link: "/companies/c1/stakeholders/p1", name: "/not-a-link" }, { link: null }],
        change: { reviewPath: "/companies/c1/changes/x", link: "https://example.com/already" },
      },
      "https://capy.example",
    );
    expect(out).toEqual({
      link: "https://capy.example/companies/c1/captable",
      path: "/mcp/files/abc",
      rows: [
        { link: "https://capy.example/companies/c1/stakeholders/p1", name: "/not-a-link" },
        { link: null },
      ],
      change: {
        reviewPath: "https://capy.example/companies/c1/changes/x",
        link: "https://example.com/already",
      },
    });
  });

  it("defaults to the only company and accepts names", () => {
    const one = session(company("c1", "Acme Robotics"));
    expect(pickCompany(one)).toBe("c1");
    expect(pickCompany(one, " acme robotics ")).toBe("c1");
    expect(pickCompany(one, "c9")).toBe("c9");
    const two = session(company("c1", "Acme Robotics"), company("c2", "Globex Labs"));
    expect(() => pickCompany(two)).toThrow(/Acme Robotics \(c1\); Globex Labs \(c2\)/);
    expect(() => pickCompany(session())).toThrow(/can’t see any company/);
  });

  it("maps Convex errors to tool errors and 401s", () => {
    expect(
      toolError(convexError({ code: "unauthorized", message: "Reconnect Capy." })),
    ).toBeInstanceOf(Unauthorized);
    expect(toolError(convexError({ code: "not_found", message: "No stakeholder." })).message).toBe(
      "No stakeholder.",
    );
    expect(
      toolError(convexError({ code: "invalid", message: "a\nb", errors: ["a", "b"] })).message,
    ).toBe("2 problems:\n- a\n- b");
    expect(toolError(convexError("Only admins can do that.")).message).toBe(
      "Only admins can do that.",
    );
    expect(toolError(new Error("socket hang up")).message).toMatch(/Try again/);
    // Refusals keep their code, so resources/read can answer "not found" instead of an internal error.
    const refused = toolError(convexError({ code: "forbidden", message: "Not granted." }));
    expect(refused).toBeInstanceOf(Refused);
    expect((refused as Refused).code).toBe("forbidden");
    expect(toolError(new Error("socket hang up"))).not.toBeInstanceOf(Refused);
  });

  it("sends resource_link content only to clients on 2025-06-18 or later", () => {
    const at = (version?: string) =>
      new Request("https://capy.test/mcp", {
        headers: version ? { "mcp-protocol-version": version } : {},
      });
    expect(acceptsResourceLinks("modern", at())).toBe(true);
    expect(acceptsResourceLinks("legacy", at("2025-06-18"))).toBe(true);
    expect(acceptsResourceLinks("legacy", at("2025-11-25"))).toBe(true);
    expect(acceptsResourceLinks("legacy", at("2025-03-26"))).toBe(false);
    expect(acceptsResourceLinks("legacy", at("2024-11-05"))).toBe(false);
    expect(acceptsResourceLinks("legacy", at())).toBe(false);
  });

  it("keeps prompt argument completion visible through .optional()", () => {
    const arg = completable(z.string(), () => ["c1"]).optional();
    expect(isCompletable(arg.unwrap())).toBe(true);
  });

  it("formats decimal strings without floats", () => {
    expect(shares("1234567")).toBe("1,234,567");
    expect(shares("1234.56789")).toBe("1,234.5679");
    expect(whole("694906.5000001")).toBe("694,907");
    expect(money("5000000")).toBe("$5,000,000");
    expect(money("12.5")).toBe("$12.50");
    expect(price("0.10")).toBe("$0.10");
    expect(price("1.942708")).toBe("$1.942708");
    expect(percent("41.6667")).toBe("41.67%");
    expect(paging(25, 25)).toBe("");
    expect(paging(25, 40, 25)).toBe("Showing 25 of 40. Pass offset 25 for more.");
    expect(table(["A", "B"], [["x|y", "line\nbreak"]])).toBe(
      "| A | B |\n| --- | --- |\n| x\\|y | line break |",
    );
    expect(lines("a", false, 0, "", "b")).toBe("a\n\nb");
  });

  it("builds safe download filenames", () => {
    expect(contentDisposition("Board consent – 2024.pdf")).toBe(
      `attachment; filename="Board consent _ 2024.pdf"; filename*=UTF-8''Board%20consent%20%E2%80%93%202024.pdf`,
    );
    expect(contentDisposition('a"b\\c.txt')).toContain('filename="a_b_c.txt"');
  });
});

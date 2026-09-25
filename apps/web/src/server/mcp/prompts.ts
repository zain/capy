// Prompt templates that walk the model through common multi-tool jobs.
import { completable, type McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Capy } from "./context";

const user = (text: string) => ({
  messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
});

export function registerPrompts(server: McpServer, capy: Capy) {
  // completable() wraps the inner schema: the SDK unwraps .optional() before looking for it.
  const companyId = completable(
    z.string().describe("Company ID or name; optional when the connection has one company"),
    (value) =>
      capy.session.companies
        .filter((c) =>
          (c.companyId + " " + c.name).toLowerCase().includes((value ?? "").toLowerCase()),
        )
        .map((c) => c.companyId),
  ).optional();
  const company = (requested?: string) => {
    try {
      const id = capy.companyId(requested);
      const known = capy.session.companies.find((c) => c.companyId === id);
      return known ? `${known.name} (companyId ${id})` : `companyId ${id}`;
    } catch {
      return "the company I pick (call list_companies and ask me which one)";
    }
  };
  const drafting = capy.session.allowDrafts
    ? "Anything you draft with draft_change is only a proposal: an admin reviews and applies it in Capy. Share the review link and never say it was done."
    : "This connection can't draft changes, so list what the user should enter in Capy instead.";

  server.registerPrompt(
    "board_meeting_prep",
    {
      title: "Prepare the equity section of a board meeting",
      description:
        "Ownership snapshot, changes since the last meeting, grants and approvals to put in front of the board, and compliance issues.",
      argsSchema: z.object({
        companyId,
        since: z.string().optional().describe("Date of the last board meeting, YYYY-MM-DD"),
      }),
    },
    ({ companyId: id, since }) =>
      user(`Prepare the equity section of the next board meeting for ${company(id)}, covering changes since ${since || "the last board meeting (ask me for the date if you need it)"}.

1. cap_table_summary: fully diluted ownership by group, the option pool and top holders.
2. get_activity: everything that changed since ${since || "that date"} (page with the cursor if needed).
3. list_changes with status pending: drafted changes still waiting for review.
4. list_records kind approval: approvals still in Draft or missing signatures.
5. health_check: critical and warning issues the board should act on (exercise windows closing, expired or missing 409A, low pool, unsigned approvals).
6. vesting_forecast to the end of next quarter: notable cliffs and vesting.

Write a one-page memo with: Ownership snapshot (a short table), Changes since the last meeting, Items needing board approval, Compliance and risks, and Proposed resolutions. State the snapshot date and link to Capy for each figure. If option grants need approval you may draft a board consent with draft_change (kind board_consent). ${drafting}`),
  );

  server.registerPrompt(
    "diligence_pack",
    {
      title: "Assemble a due diligence pack",
      description:
        "Checklist of cap table records, convertibles, valuations, approvals and documents an investor will ask for, with gaps.",
      argsSchema: z.object({ companyId }),
    },
    ({ companyId: id }) =>
      user(`Assemble an equity due diligence pack for ${company(id)}, as an investor's counsel would request it.

1. cap_table_summary with groupBy class, then with groupBy stakeholder (raise limit to cover everyone).
2. list_convertibles: every SAFE and note with its terms.
3. list_records for kind valuation (409A reports), approval (board approvals) and consent (stockholder consents).
4. search_documents: the categories and what each covers; check stock certificates, option grants and SAFEs against the documents that list their certificate labels.
5. health_check: data problems to fix before sharing.

Produce a checklist table (item, status, where it is in Capy, gap or next step) followed by a short list of the most important gaps. Don't download files unless I ask; link to them instead. Don't draft changes for this.`),
  );

  server.registerPrompt(
    "new_hire_grant",
    {
      title: "Draft an option grant for a new hire",
      description:
        "Checks the pool and latest 409A, then drafts the stakeholder and option grant for an admin to review.",
      argsSchema: z.object({
        companyId,
        name: z.string().describe("New hire's full name"),
        role: z.string().optional().describe("Title or role"),
        shares: z.string().optional().describe("Number of options, if already decided"),
      }),
    },
    ({ companyId: id, name, role, shares }) =>
      user(`Help me grant equity to our new hire ${name}${role ? `, ${role}` : ""}, at ${company(id)}.

1. find_stakeholders with query "${name}". If they are not in the cap table, draft a stakeholder_update without a stakeholderKey (patch: name, email if I gave one, relationship Employee${role ? `, fields {"Title": "${role}"}` : ""}). The grant needs their stakeholderKey, so stop there and tell me to apply that draft in Capy first.
2. cap_table_summary: the equity plan name and shares available. Warn me if the grant would leave less than 10% of the plan.
3. list_records kind valuation: the latest 409A fair market value per share, for the exercise price. Warn me if it has expired.
4. ${shares ? `Use ${shares} options.` : "Ask me how many options, or propose a number and explain how it compares to existing grants for similar roles."}
5. draft_change kind option_grant: stakeholderKey, planName, shares, exercisePrice (the 409A value), grantType ISO unless I say otherwise, issuedOn today unless I give a grant date, vestingSchedule "1/48 monthly, 25% vest at 12 month cliff" unless I say otherwise, and a rationale citing the offer.
6. Offer to draft a board consent approving the grant (draft_change kind board_consent).

${drafting}`),
  );
}

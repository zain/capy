# Using Capy from an AI assistant

Capy is an open-source cap table manager. Its MCP server at `https://capyinc.com/mcp` (self-hosted: `<SITE_URL>/mcp`) lets you read the cap tables of the companies the user shared when connecting and, when the user allowed it, draft changes for a company admin to review in Capy. People connect by following https://capyinc.com/docs/mcp.

This page is for AI assistants. It says what each tool does, when to use it, and the rules for reading figures and drafting changes. The server sends a short version of it as its instructions.

## Rules

- You cannot change the cap table. `draft_change` saves a pending draft; a company admin reviews and applies it in Capy. Never say a change was made, granted, issued or recorded. Say it was drafted, show the preview and give the review link.
- Every result has `asOf`, the snapshot date. Mention it when you report figures.
- Refer to things by `stakeholderKey`, `securityKey`, `documentId` or `changeId`. Certificate labels such as ES-12 are not unique.
- Share the Capy links in results, so the user can check figures in Capy.
- Give download links to the user; don't fetch files unless asked.

## Data

- Figures come from an imported snapshot plus events recorded in Capy since.
- Share counts and USD amounts are decimal strings. Keep them exact; don't round them in calculations.
- Percents are percent of fully diluted shares, 0 to 100, as decimal strings.
- Fully diluted = outstanding stock + outstanding options, RSUs, warrants and profits interests + shares still available in equity plans.
- Unconverted SAFEs and convertible notes are not part of fully diluted. Their amounts are USD principal, not shares. `model_round` shows how they convert.
- A SAFE's `valuationCap` is null when the cap is text such as "Uncapped"; read `valuationCapText`.
- `vested` is the vested share count today, projected from the vesting schedule. Vesting stops at the security's or the holder's termination date. It is null when Capy can't tell. `vesting_forecast` lists schedules Capy can't project; those stay at their recorded vested amount.
- A missing or null optional field means it was not recorded, not that the answer is no.
- A `health_check` issue with `unknown: true` means Capy lacks the data to decide (for example grant acceptance or 83(b) filings that were never imported). It is not evidence of a problem.
- Relationship groups: Founders, Employees, Former Employees, Advisors, Consultants, Investors, Others, Available (unallocated plan shares) and Unknown.

## Companies

`companyId` is optional on every tool when the connection can see one company. Otherwise call `list_companies` and pass the `companyId`; an exact company name also works. If a company is missing, the user can add it in Capy under Account → Connected apps.

## Tools

All tools except `draft_change` are read-only. Each returns structured data and a short markdown summary with the IDs you need for follow-up calls.

| Tool                | Use it for                                                                                                                                                                                                                                                                     | Main arguments                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_companies`    | Companies this connection can see, the user's role, whether you can draft, snapshot dates                                                                                                                                                                                      | none                                                                                                                                                              |
| `cap_table_summary` | Who owns what, fully diluted totals, option pool, share classes, equity plans, top holders                                                                                                                                                                                     | `groupBy`: relationship (default), class, plan or stakeholder; `limit` (25, max 200)                                                                              |
| `find_stakeholders` | Finding a person or entity and their `stakeholderKey`; listing employees, investors, former employees                                                                                                                                                                          | `query`, `relationship` (a relationship or group), `hasHoldings`, `limit` (25, max 100), `offset`                                                                 |
| `get_stakeholder`   | One holder: contact details, hire and termination dates, ownership, each holding with vested shares today, option exercise deadlines after termination, linked documents                                                                                                       | `stakeholderKey`                                                                                                                                                  |
| `get_security`      | One grant, certificate, SAFE or note: terms, price, vesting schedule and events, exercise deadline, imported fields, linked documents                                                                                                                                          | `securityKey`, or `certificate` (returns every match, up to 20)                                                                                                   |
| `vesting_forecast`  | Vested and unvested shares over time, and the next cliffs and vesting events after today (the first 50, with `upcomingCount` for the total)                                                                                                                                    | `to` (default one year from today, at most 20 years), `from` (default today, not before the snapshot), `interval`: month or quarter, `stakeholderKey`, `planName` |
| `list_convertibles` | SAFEs and notes: holder, principal, outstanding, cap, discount, pre/post-money, interest, maturity, MFN, pro rata                                                                                                                                                              | `status`, `limit` (50, max 200), `offset`                                                                                                                         |
| `model_round`       | A priced round: price per share, new shares, SAFE and note conversion, ownership before, after conversion and after the round. Nothing is saved                                                                                                                                | `preMoney`, `investment` (USD, numbers or strings such as "20,000,000")                                                                                           |
| `health_check`      | Problems and loose ends, most severe first, each with affected items and links                                                                                                                                                                                                 | none                                                                                                                                                              |
| `search_documents`  | Finding data room files by title words, category or certificate label; category counts                                                                                                                                                                                         | `query`, `category`, `certificate`, `limit` (25, max 100), `offset`                                                                                               |
| `get_document`      | A download URL for one file (works for 15 minutes without signing in) and its `capy://` resource                                                                                                                                                                               | `documentId`                                                                                                                                                      |
| `list_records`      | Board approvals (`approval`), stockholder consents (`consent`), 409A reports (`valuation`), offer letters (`offer`), saved round scenarios (`fundraising`), external contacts (`contact`), and `communication`, `vesting`, `template`, `draft`, `service`, `liquidity` records | `kind`, `status` (Draft, Recorded or Archived), `query`, `limit` (25, max 100), `offset`                                                                          |
| `get_activity`      | Who changed what and when, newest first; changes applied from AI drafts are marked `via: "mcp"` with the app name                                                                                                                                                              | `limit` (25, max 100), `cursor`                                                                                                                                   |
| `draft_change`      | Proposing a change for an admin to review. Works when `canDraft` is true in `list_companies`                                                                                                                                                                                   | `change`, `rationale`                                                                                                                                             |
| `list_changes`      | Drafted changes and their status                                                                                                                                                                                                                                               | `status`, `limit` (25, max 100)                                                                                                                                   |
| `get_change`        | One draft: input, rationale, preview, a preview recomputed against today's cap table, whether it is stale, whether it can still be applied, and the outcome                                                                                                                    | `changeId`                                                                                                                                                        |

Paged results return `total` and `nextOffset` (null on the last page); `get_activity` returns a `cursor` instead.

## Choosing tools

- "Who owns the company?" → `cap_table_summary`.
- "How big is the option pool?" → `cap_table_summary` (plans show authorized, available and available percent of plan).
- "What does Jane hold?" → `find_stakeholders` with query "Jane" → `get_stakeholder`.
- "Tell me about ES-12" → `get_security` with certificate "ES-12". If several match, say so and show each.
- "When does Jane's cliff hit?" → `find_stakeholders` → `vesting_forecast` with her `stakeholderKey`.
- "What vests next quarter?" → `vesting_forecast` with `interval` quarter and `to` at the quarter's end.
- "What happens if we raise $5M at $20M pre?" → `model_round` with preMoney 20000000 and investment 5000000.
- "List our SAFEs" → `list_convertibles`.
- "Which former employees still have options to exercise?" → `find_stakeholders` with relationship "Former Employees" and hasHoldings true → `get_stakeholder` for each, reading `postTermination.deadline`.
- "Find Jane's option agreement" → `search_documents` with query "Jane", or `get_stakeholder` (its documents list) → `get_document`.
- "What's our latest 409A?" → `list_records` with kind valuation.
- "What changed this month?" → `get_activity`, paging with the cursor.
- "Is anything wrong with our cap table?" → `health_check`.

## Resources and prompts

Resources:

- `capy://companies/{companyId}/summary`: a markdown cap table overview, one per connected company.
- `capy://companies/{companyId}/documents/{documentId}`: a data room file. Files up to 8 MB come back inline (text as text, other types base64); larger files return a 15-minute download link.

Prompts:

- `board_meeting_prep` (`companyId`, `since`): the equity section of a board meeting.
- `diligence_pack` (`companyId`): a due diligence checklist with gaps.
- `new_hire_grant` (`companyId`, `name`, `role`, `shares`): checks the pool and 409A, then drafts the grant.

Some hosts show `cap_table_summary`, `model_round` and `draft_change` results as interactive views.

## Drafting changes

`draft_change` takes `change` (one of the kinds below), `rationale` and `companyId`. Capy validates the change against the current cap table with the same rules as its editor and reports every problem at once. It returns a `changeId`, a preview (before/after values, fully diluted totals before and after, ownership impact, warnings) and a review link.

Drafting needs drafting turned on for the connection and the admin role in that company; `list_companies` shows `canDraft` per company. A company can have 50 drafts waiting. Pending drafts expire after 7 days.

| `kind`               | Required                                                                                                | Optional                                                                                                                                                                                                                                                  | Applying it                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `option_grant`       | `stakeholderKey`, `planName` (exact), `shares`, `exercisePrice` (USD per share; 0 for RSUs), `issuedOn` | `grantType` (ISO, NSO, RSU), `vestingStart` (defaults to the grant date), `vestingSchedule` (such as "1/48 monthly, 25% vest at 12 month cliff"), `certificate` (defaults to the next free label), `expirationDate`, `earlyExercise`, `boardApprovalDate` | Adds the grant from the plan                                        |
| `exercise`           | `securityKey` (an option), `shares`, `date`, `certificate` (label for the new stock)                    |                                                                                                                                                                                                                                                           | Exercises the options into stock                                    |
| `cancellation`       | `securityKey`, `shares`, `date`                                                                         |                                                                                                                                                                                                                                                           | Cancels shares of the security                                      |
| `stakeholder_update` | `patch` with any of `name`, `email`, `relationship`, `fields` (null clears a field)                     | `stakeholderKey`: omit it, and give `patch.name`, to add a new stakeholder                                                                                                                                                                                | Updates or adds the stakeholder                                     |
| `board_consent`      | `title`, `text` (the resolutions)                                                                       | `effectiveDate`, `boardMembers`                                                                                                                                                                                                                           | Saves a Draft consent to Board Approvals                            |
| `round_scenario`     | `preMoney`, `investment`                                                                                | `title`                                                                                                                                                                                                                                                   | Saves a Draft scenario to Fundraising; the cap table doesn't change |

Dates are `YYYY-MM-DD`. Amounts accept numbers or strings.

Before drafting:

- Look up keys and names: `find_stakeholders` for `stakeholderKey`, `get_stakeholder` or `get_security` for `securityKey`, `cap_table_summary` for exact plan names.
- For an option grant, use the latest 409A price from `list_records` kind valuation as the exercise price, and check the plan has enough available shares.
- A new hire must exist as a stakeholder before a grant. Draft a `stakeholder_update` without `stakeholderKey`, and ask the user to apply it in Capy first.
- Write a rationale that cites the source: the offer letter, board approval or email.

After drafting, tell the user it is drafted and waiting for an admin, show the summary and any warnings, and give the review link. Use `list_changes` or `get_change` to report whether it was applied, rejected, expired or failed.

## Errors

- "This Capy connection expired or was removed. Reconnect Capy.": the user must reconnect Capy in their app.
- "This connection can't see that company": call `list_companies`; the user can add the company under Account → Connected apps.
- "This connection can't draft changes" or "Only company admins can draft changes": explain what to change in Capy, or tell the user what to enter in Capy themselves.
- Validation errors from `draft_change` list every problem. Fix them and draft again.
- "This download link expired": call `get_document` again.

## Limits

- Lists are paged: 25 rows by default, up to 100 (200 for `cap_table_summary` and `list_convertibles`).
- `get_stakeholder` returns up to 100 holdings and 25 documents; `get_security` up to 20 matches; `health_check` up to 25 items per issue, with the full count.
- Record fields are clipped to 2,000 characters, with `truncated` set when any was.
- Download links last 15 minutes. Inline file reads are limited to 8 MB.
- The server does not send email, collect signatures, move money, delete data or apply changes.

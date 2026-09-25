# Changelog

User-visible changes and upgrade notes are recorded here. Release tags identify source snapshots; they do not imply a security audit. Capy uses semantic versions. From 1.0.0, breaking changes to data, imports, exports or self-hosting configuration increase the major version and are called out here.

## 1.2.0 — 2026-09-25

Capy works inside Claude and other AI apps. Ask about your cap table in plain English, and let the app draft changes that an admin approves in Capy.

### Added

- An MCP server at `/mcp`. Connect Claude, ChatGPT, Cursor, VS Code or another AI app to ask about ownership, stakeholders, grants, vesting, SAFEs, documents, board records and activity, model a priced round, and run a cap table health check. See [docs/MCP.md](docs/MCP.md).
- Signing in from an AI app asks which companies it can see and whether it may draft changes. **Account → Connected apps** lists connected apps, and lets you edit or disconnect each one.
- Connected apps can draft option and RSU grants, exercises, cancellations, stakeholder updates, board consents and round scenarios. Drafts change nothing until an admin applies them from the new **Drafted Changes** page, which shows the before and after, the ownership impact and warnings. The dashboard reminds you when drafts are waiting, and applied drafts are recorded in activity with the app that drafted them.
- In apps that support MCP Apps, ownership, round models and drafted changes show as interactive views.
- `llms.txt` and a guide for AI assistants at `/mcp.md`.
- A page at `/ai` that shows what asking Claude about a cap table looks like, with real screenshots from a made-up company.
- The landing page shows the dashboard and a Claude conversation, and the Pulley import link is now a clear button.
- Clear page titles for the new pages, including every company page.

### Fixed

- `draft_change` is always listed, so AI apps that cache their tool list can still draft after you turn drafting on. When drafting is off, it explains where to turn it on.
- The Capy icon at the top of the landing page links home.

### Upgrade notes

- Self-hosted installations serve the MCP server at `<SITE_URL>/mcp` with no extra setup. `SITE_URL` on Convex must match the web app's origin. The new Convex cron runs hourly to remove expired tokens, links and drafts.

## 1.1.0 — 2026-09-24

### Added

- Change password, in the Account menu. It checks the current password and signs out the account's other sessions.
- Full Pulley imports now bring over everything in Pulley's data room, including charters, equity plan documents, form templates and the company's own folders, plus every stock certificate and a CSV of Pulley's activity history.
- Imports fill in the company profile, keep stakeholder notes, and mark filed 83(b) elections. The 83(b) tab shows each filing status.
- The Capy team can bring an already imported company up to date with a newer Pulley snapshot without changing balances or existing values.

## 1.0.0 — 2026-09-24

Capy is generally available. This release brings full Pulley migrations: everything Pulley holds, not only its Excel export, and a cap table that matches Pulley’s own numbers.

### Added

- Full Pulley imports. Founders can request one at `/pulley-import`, either by inviting hello@capyinc.com as a Pulley admin or by sharing a sign-in. Shared passwords are encrypted in the browser, readable only with an offline key, and deleted after the import or within 30 days.
- Assisted import tooling for the Capy team. It brings over stakeholder emails and addresses, dated vesting events, signed documents linked to each security and SAFE, board approvals, 409A valuations and board members. Before loading, it checks every company, class, plan, stakeholder, security and SAFE figure against Pulley’s numbers, including future vesting.
- Dated vesting events. Custom schedules now project exactly, and security pages list each event as vested or upcoming.
- Security pages list their linked documents.
- Excel exports include a Vesting Events sheet, and imports read it back, so custom vesting survives an export and re-import.
- A Capy favicon beside the landing-page title and a GitHub source link in the footer.

### Fixed

- SAFEs with a text valuation cap such as “Uncapped” no longer break the SAFE list, SAFE pages or round modeling.
- Converted SAFEs show their original principal alongside the outstanding balance, instead of $0.
- The dashboard ownership chart recognizes Pulley relationships such as “Ex Employee”, “Consultant” and “Other”, and matches Pulley’s breakdown.
- Restricted stock awards are labeled as awards, not options.
- A restricted stock award and its stock row are no longer reported as duplicate certificates.
- The import warning now lists every vesting schedule Capy can’t project, not only schedules labeled “custom”.
- Fully vested securities stay fully vested in projections, whatever their schedule.
- Dashboard reminders to add emails or upload documents disappear once that’s done.
- Aligned the landing-page footer text and optically balanced the GitHub mark.

## 0.1.0 — 2026-09-16

First public source release.

### Added

- Pulley Excel preview, import validation and reconciliation, supplemental stakeholder contacts, and Excel/CSV export.
- Company dashboards, ownership tables, security records, equity plans, supported vesting projections, exercises, and cancellations.
- SAFE and priced-round fundraising models, saved drafts, document storage, and restricted stakeholder portals.
- Email/password authentication and separate development/production deployment configuration.
- Hosted annual billing, account-linked checkout, authenticated Stripe webhooks, and read/export access after the editing period ends.
- An explicit self-hosted mode that keeps editing enabled without a Capy subscription.
- Public setup, architecture, migration, contribution, security, and roadmap documentation; automated checks and issue templates.

### Changed

- Analytics only initialize on `capyinc.com`; local and independently hosted installations do not send events to Capy's PostHog project.
- Public copy describes the shipped Excel export. MCP and Open Cap Table Format support are listed as planned work.

### Security

- Removed repeated-whitespace backtracking from Pulley company-title parsing, with regression coverage for malformed titles.

- Updated Better Auth to 1.6.33 and pinned patched Hono and UUID resolutions. UUID 11 retains the CommonJS `v4` interface used by ExcelJS; workbook tests verify the integration.
- Added secret scanning, dependency auditing, CodeQL analysis, and scheduled dependency update checks.

### Known limits

See [current scope](docs/FEATURES.md). This release does not include email recovery delivery, admin-team invitations, an MCP server, Open Cap Table Format export, e-signature delivery, tax filing, or money movement.

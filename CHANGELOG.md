# Changelog

User-visible changes and upgrade notes are recorded here. Release tags identify source snapshots; they do not imply a security audit. Capy uses semantic versions, with breaking changes called out while the project is in the `0.x` series.

## Unreleased

- Aligned the landing-page footer text, optically balanced the GitHub mark, simplified its link, and removed body source links and hosting details.

- Added a Capy favicon beside the landing-page title and a compact GitHub source link in the footer that opens in a new tab, with mobile and dark-mode styling.

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

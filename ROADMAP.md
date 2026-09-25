# Roadmap

This is the project's working direction, not a delivery schedule. [Issues](https://github.com/zain/capy/issues) track concrete proposals and implementation work; [the changelog](CHANGELOG.md) records what shipped.

## Shipped

- **MCP server:** connect Claude, ChatGPT, Cursor and other AI apps with per-connection company choices, read-only tools, and drafted changes that an admin reviews and applies in Capy. See [docs/MCP.md](docs/MCP.md).

## Next priorities

- **AI access for advisors and employees:** let the MCP server serve portal users their own holdings, and let lawyers and advisors connect with scoped, read-only access.
- **Account recovery and verification:** integrate a mail provider and test the full recovery flow before exposing it in the UI.
- **More import coverage:** expand synthetic regression fixtures for historical Pulley exports, restricted-stock mappings, custom schedules, and reconciliation failures.
- **Administrator collaboration:** explicit invitations, roles, and revocation with cross-account authorization tests.
- **Upgrade and backup confidence:** documented restore drills and migration checks for self-hosted deployments.

## Planned

- WebMCP tools in the Capy web app, so browser-based agents can use the page you're on.
- More drafted change kinds, such as stock and SAFE issuances and transfers.
- Open Cap Table Format export with schema validation and round-trip checks. Current downloads are Excel and CSV.
- Re-import/merge workflows with a preview of changes and preserved history.
- Better document-to-security attachment mapping and bulk document migration.
- Expanded fundraising scenarios, including pool changes and pro-rata participation.

## Requires separate integrations

E-signatures, tax submissions, HRIS/SSO, money movement, and managed valuation/accounting services require provider integrations and their own acceptance tests. They are not connected in the current release.

## How to help

A small reproducible issue or synthetic workbook is often more useful than a large feature proposal. See [CONTRIBUTING.md](CONTRIBUTING.md), or [start a discussion](https://github.com/zain/capy/discussions) about a workflow you need.

# Roadmap

This is the project's working direction, not a delivery schedule. [Issues](https://github.com/zain/capy/issues) track concrete proposals and implementation work; [the changelog](CHANGELOG.md) records what shipped.

## Next priorities

- **Account recovery and verification:** integrate a mail provider and test the full recovery flow before exposing it in the UI.
- **More import coverage:** expand synthetic regression fixtures for historical Pulley exports, restricted-stock mappings, custom schedules, and reconciliation failures.
- **Administrator collaboration:** explicit invitations, roles, and revocation with cross-account authorization tests.
- **Upgrade and backup confidence:** documented restore drills and migration checks for self-hosted deployments.

## Planned

- An MCP server with explicit permissions, read-only tools first, and reviewable writes.
- Open Cap Table Format export with schema validation and round-trip checks. Current downloads are Excel and CSV.
- Re-import/merge workflows with a preview of changes and preserved history.
- Better document-to-security attachment mapping and bulk document migration.
- Expanded fundraising scenarios, including pool changes and pro-rata participation.

## Requires separate integrations

E-signatures, tax submissions, HRIS/SSO, money movement, and managed valuation/accounting services require provider integrations and their own acceptance tests. They are not connected in the current release.

## How to help

A small reproducible issue or synthetic workbook is often more useful than a large feature proposal. See [CONTRIBUTING.md](CONTRIBUTING.md), or [start a discussion](https://github.com/zain/capy/discussions) about a workflow you need.

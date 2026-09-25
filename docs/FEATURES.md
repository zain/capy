# Supported workflows and boundaries

This document describes the initial public release, not a promise of future features. [ROADMAP.md](../ROADMAP.md) tracks planned work.

## Implemented

- Detailed Pulley Excel import with source-field preservation, header discovery, reconciliation, and a review before saving.
- Separate stakeholder contact import; cap-table Excel download and per-table CSV export.
- Stakeholder, security, class, and plan views with search, filters, sorting, and configurable columns.
- Recording and correcting securities, option exercises, cancellations, and activity history.
- Standard monthly vesting projections, including recognized cliffs.
- SAFE and priced-round fundraising models and saved scenarios.
- Document upload/download and saved drafts for approvals, offers, and communications.
- Restricted stakeholder portal invitations, claims, previews, and revocation.
- Email/password sign-in, hosted subscriptions, and independent self-hosted mode.
- An MCP server for AI apps, with per-connection company choices, read-only tools, and drafted changes that an admin reviews and applies in Capy. See [MCP.md](MCP.md).

## Import boundaries

Detailed `.xlsx` exports are limited to 20 MB, 5,000 stakeholders, and 5,000 securities. Unknown sheets produce warnings. Missing required balances, contradictory totals, and unmatched restricted-stock certificate mappings stop an import.

Summary-only workbooks, arbitrary CSV imports, complex restructurings, automatic re-import merges, and complete historical audit migrations are not supported. Each populated cap table is imported into a new company snapshot. Contact details can be merged separately.

Pulley exports may omit documents, approvals, valuations, contact details, permissions, and custom vesting events. An empty section means there is no imported or recorded data there; it does not prove the source system had no records.

## Calculation boundaries

Monthly schedules and cliffs must be recognizable. Custom or milestone schedules are not guessed. For an unsupported schedule, an administrator must confirm the recorded vested balance before recording a larger exercise.

Fundraising models include valuation caps, discounts, pre/post-money SAFEs, and a priced round with the existing pool. They do not model new pool expansion, pro-rata commitments, MFN elections, future note interest accrual, or liquidation waterfalls. A saved model does not execute a SAFE conversion or alter the cap table.

Stock splits, bulk transfers, repurchases, conversion execution, advanced valuations, and certified accounting reports are not implemented.

## Workflow boundaries

Drafts and uploaded signed records can be stored. Sending emails, collecting signatures, moving funds, filing taxes, and generating legal documents are not connected. A draft issuance does not issue a security automatically.

Files belong to a company data room. Fine-grained document-folder permissions and automatic mapping of attachments to individual securities are not implemented.

## Access and account boundaries

The importing account owns the company. There is no administrator-team invitation/settings UI, and source-system administrators and permissions are not imported automatically.

A stakeholder invitation can be claimed once, expires after seven days if unused, and grants access until revoked. The portal shows that stakeholder's holdings, not the full cap table or company data room. Knowing a stakeholder's email is not sufficient for access.

Signup/sign-in work. Email verification, password recovery delivery, and SSO require provider integrations before those flows can be offered.

## AI app boundaries

Connected apps act as the signed-in user, only for the companies chosen when connecting, with that user's role. They read; they cannot change the cap table. With drafting allowed, an admin's connection can draft option and RSU grants, exercises, cancellations, stakeholder updates, board consents and round scenarios. A draft changes nothing until an admin with editing access applies it in Capy. Drafts expire after 7 days.

There is no MCP tool to apply, delete, send email or collect signatures. Download links from the MCP server last 15 minutes. Drafts cover only those kinds: they cannot add share classes or plans, issue stock or SAFEs other than by exercise, or record transfers. Browser-based agents (WebMCP) are not supported.

## Formats and integrations

Exports today are Excel and CSV. Open Cap Table Format export is planned, not shipped. Capy is independent of Pulley and Carta.

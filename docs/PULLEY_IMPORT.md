# Importing from Pulley

## Before you export

In Pulley, open **Cap Table → Download → All time** and download the detailed `.xlsx` workbook. Summary-only exports do not contain enough information. If you need contact details, also download **Stakeholders → Actions → Download**.

Use `/preview` to review a cap table before creating an account, or upload from `/dashboard` after signing in. The preview stays in your browser until you confirm an authenticated import.

## Review before saving

Check the company name, export date, security/stakeholder counts, fully diluted shares, capital contributions, plan reserves, and every warning. The importer recomputes formula totals from records rather than treating missing cached formula results as zero.

It preserves source fields and historical security statuses where present. Certificate labels are not assumed to be unique globally. Full equity-plan names come from records when sheet names are truncated.

## What may be missing

The cap-table export may leave out contact details, actual document files, approval signatures, valuations, administrative access, custom vesting events, and complete audit history. Use the separate contacts importer where appropriate. The team can discuss a fuller manual migration at [hello@capyinc.com](mailto:hello@capyinc.com).

An Excel cap-table import does not migrate source-system permissions or make a complete account backup. Keep the original export privately.

## Limits

Detailed `.xlsx` files: 20 MB, 5,000 stakeholders, and 5,000 securities. Unsupported worksheets are reported. Required balances, share-total inconsistencies, and unmatched restricted-stock mappings must be resolved before import.

Historical formats vary. [Report a reproducible issue](https://github.com/zain/capy/issues/new/choose) using a synthetic workbook or sanitized header description, never a private cap table. See [FEATURES.md](FEATURES.md) for modeling and workflow limitations.

## Verify a migration

1. Review reconciliation and confirm the import.
2. Reload and compare ownership, shares, options, SAFEs, classes, and equity plans with the original export.
3. Import stakeholder contacts separately; verify matches and confirm ownership totals did not change.
4. Download Excel, import into a separate disposable company, and compare totals, counts, contacts, and reserves.
5. In a disposable company, test a correction, supported vested option exercise, and cancellation; inspect resulting balances and activity records.
6. Test document upload/download and stakeholder access with a second account before using those workflows with real stakeholders.

The importer does not send money, sign documents, or change records in Pulley.

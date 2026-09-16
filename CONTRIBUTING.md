# Contributing to Capy

Thanks for helping make cap tables easier to manage. Small, focused pull requests are welcome: importer edge cases, calculation fixes, accessibility improvements, tests, and clearer documentation all help.

## Before you start

- Read the [development guide](docs/DEVELOPMENT.md) and [current product scope](docs/FEATURES.md).
- For a substantial feature or schema change, open an issue first so we can agree on the behavior and approach.
- Check [existing issues](https://github.com/zain/capy/issues) and [the roadmap](ROADMAP.md). Use Discussions for setup questions.
- Use your own Convex development project. Never test a contribution against a customer deployment.

## Local workflow

1. Fork the repository and create a branch from `main`.
2. Follow the [README setup](README.md#run-locally).
3. Make the smallest complete change that solves the problem.
4. Run `bun run check` and `bun run test`.
5. Open a pull request describing the problem, resulting behavior, and validation. Include screenshots for UI changes and a migration/rollback note for stored-data changes.

Maintainers use squash merges. A concise, descriptive PR title becomes the commit subject; a particular commit-prefix convention is not required.

## What reviewers look for

- **Correct ownership math.** Use the decimal helpers in `packages/equity`; avoid floating-point arithmetic for share and money calculations. State rounding rules.
- **Explicit access checks.** Enforce company membership and write permissions on the server. UI visibility is not authorization. Portal access must stay narrower than company-admin access.
- **Import integrity.** Recompute totals from underlying records, preserve source fields and history, and surface ambiguity. Never silently invent missing balances.
- **Useful tests.** Include a regression test for a bug. Calculation changes should exercise boundaries, conservation of shares, and failure cases. UI-only copy changes do not need mirror-image tests.
- **Honest product behavior.** Do not expose an action that cannot complete, or describe an integration as available before it works.
- **Readable changes.** Keep unrelated formatting and refactors out of a focused fix. Generated files should come from their generator.

## Fixtures and screenshots

Use fictional names, reserved domains such as `example.com`, and synthetic numbers. Never commit customer exports, real cap tables, signed documents, credentials, session cookies, private invite links, or screenshots of real accounts. Keep private local material in ignored `.private/`.

The importer tests in `apps/web/src/server/equity-import.test.ts` build synthetic workbooks in code. Extend those examples instead of uploading a private workbook.

## Database and releases

Prefer additive schema changes. Document how existing records behave before and after a change, and test on a disposable deployment. Do not assume that rolling back the web bundle reverses a database migration.

Add user-visible changes to the `Unreleased` section of [CHANGELOG.md](CHANGELOG.md). Maintainers tag releases after checks pass and record the important changes and upgrade steps.

## Security and conduct

Report vulnerabilities privately using [SECURITY.md](SECURITY.md). All participation follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By submitting a contribution, you agree to license it under this repository's GNU AGPL v3.0 license (`AGPL-3.0-only`). Keep existing third-party notices intact. We do not require a separate contributor license agreement.

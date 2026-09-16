# Security policy

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/zain/capy/security/advisories/new), or email [hello@capyinc.com](mailto:hello@capyinc.com) with “Security” in the subject. Do not open a public issue containing an exploit against a live account, credentials, or company data.

Include the affected version or commit, reproduction steps using synthetic records, expected and actual behavior, and the impact you observed. A minimal test or proof of concept helps. Do not access or modify another person's records to demonstrate a finding.

The maintainers review reports and coordinate a fix and disclosure with the reporter. We do not currently publish a response-time SLA or operate a paid bounty program.

## Supported versions

Security fixes target the latest release and `main`. Older releases do not have a separate maintenance branch. Self-hosted operators are responsible for applying updates and reviewing release notes.

## Boundaries to preserve

- Better Auth identifies the user; Convex functions enforce company membership and administrator permissions.
- Stakeholder portals grant access only to the invited person's holdings. Email matching alone does not grant access.
- Preview workbooks stay in the browser until authenticated import confirmation. Company records and uploaded files are stored in the configured Convex deployment.
- Hosted billing verifies Stripe signatures and records processed events. Self-hosted mode bypasses subscription checks, never authentication or company authorization.
- Secrets belong in Convex environment variables or Cloudflare secrets. `VITE_*` values are public browser build inputs.

## Deployment notes

Current email/password authentication does not provide email verification or recovery delivery. Use a deployment appropriate to that limitation and follow the [self-hosting guide](docs/SELF_HOSTING.md). Provider certifications do not constitute a certification or independent security audit of Capy.

For operational configuration and data flow, see [ARCHITECTURE.md](docs/ARCHITECTURE.md). For ordinary bugs and setup questions, use [SUPPORT.md](SUPPORT.md).

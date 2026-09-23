# Capy backend

Convex stores company records and files, enforces access checks, and hosts Better Auth through its component adapter.

| Module            | Responsibility                                                        |
| ----------------- | --------------------------------------------------------------------- |
| `schema.ts`       | Company, import, membership, record, portal, and billing tables       |
| `equity.ts`       | Company access, import staging, records, corrections, and exports     |
| `records.ts`      | Saved workflows and file access                                       |
| `portal.ts`       | Restricted stakeholder invitations and holdings                       |
| `pulleyAccess.ts` | Encrypted Pulley sign-ins for assisted imports, deleted after 30 days |
| `auth.ts`         | Better Auth configuration                                             |
| `billing.ts`      | Hosted entitlements and self-hosted access policy                     |
| `stripe.ts`       | Signed, mode-checked Stripe webhook handling                          |
| `http.ts`         | Auth and webhook HTTP routes                                          |

Start with [development setup](../../../docs/DEVELOPMENT.md). Use your own deployment. Generated files in `_generated/` are produced by the Convex CLI and should not be edited manually.

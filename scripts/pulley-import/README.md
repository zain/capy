# Assisted Pulley imports

For founders who want everything Pulley holds, not just the Excel export: stakeholder emails, dated vesting events, documents, board approvals and 409A valuations. Run these steps for a company whose Pulley account has invited hello@capyinc.com as an admin.

Keep each company's files outside the repo, for example `~/Developer/capy-imports/<company>/`. They contain confidential cap table data and signed agreements.

## 1. Snapshot Pulley

Sign in to Pulley in a browser as the invited admin. From that session, save these read-only responses as JSON under `raw/`:

| File                           | Source                                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `securities.json`              | `GET api.pulley.com/v3/companies/<id>/securities?include_numbers=true`                                                                                                              |
| `securities/<securityId>.json` | `GET api.pulley.com/v3/securities/<securityId>?include_numbers=true` (carries `vest_events`)                                                                                        |
| `convertibles.json`            | `GET …/companies/<id>/convertibles?include_numbers=true&include_metadata=true`                                                                                                      |
| `stakeholders.json`            | `GET …/companies/<id>/stakeholder_companies?include_numbers=true&include_invitation_status=true&include_crypto_wallets=false&exclude_ex_employees=false`                            |
| `share_classes.json`           | `GET …/companies/<id>/security_classes?share_class_type=share_class`                                                                                                                |
| `equity_plans.json`            | `GET …/companies/<id>/equity_plans?expand=numbers&only_phantom_plans=false`                                                                                                         |
| `board_approvals.json`         | `GET …/companies/<id>/board_approvals`                                                                                                                                              |
| `board_members.json`           | `GET …/companies/<id>/board_members`                                                                                                                                                |
| `employees.json`               | `GET …/companies/<id>/employees`                                                                                                                                                    |
| `fmv.json`                     | `GET api.pulley.com/v3/fmv_report?company_id=<id>`                                                                                                                                  |
| `gql_CompanyNumbers.json`      | The `CompanyNumbers` query the Pulley app sends to `api.pulley.com/caplogic/v1/graphql`, with every `include*` flag set to true. The reconciliation compares against these numbers. |

For the data room, company profile, certificates and history, also save:

- `company.json` from `GET …/companies/<id>?include_permissions=false`, and `certificates.json` from `GET …/companies/<id>/certificates`.
- `gql_DocumentLibrary.json`, `gql_DocumentLibraryFolders.json` and `gql_GetAuditCompany.json`: the queries Pulley's Data Room and Recent Activity pages send to `api.pulley.com/v1/graphql`. Replay them with the same `x-hasura-role` header the app sends, or Pulley rejects some fields.

Download every data room file (the library's `fileUploads`) from `api.pulley.com/companies/<id>/download/<fileId>` into `documents/<fileId>__<filename>`, and every stock certificate from `api.pulley.com/security/<securityId>/certificate` into `certificates/<securityId>__<name>.pdf`.

Also save Pulley's cap table **Download** (all time, no drafts) as `pulley-export.xlsx`.

## 2. Build and check

```sh
bun scripts/pulley-import/build.ts ~/Developer/capy-imports/<company>
bun scripts/pulley-import/reconcile.ts ~/Developer/capy-imports/<company>/raw ~/Developer/capy-imports/<company>/capy-import.json
```

`build.ts` merges the export with the API snapshot. `reconcile.ts` compares every company, class, plan, stakeholder, security and SAFE figure with Pulley's own numbers, including future vesting. Resolve every mismatch before loading.

## 3. Load

```sh
bun scripts/pulley-import/load.ts ~/Developer/capy-imports/<company> --owner hello-or-staff@example.com [--prod]
```

The loader creates the company under an existing Capy account, fills its profile, uploads documents, adds approvals, valuations and board contacts, then reconciles what Capy stored.

To bring an already loaded company up to date with a newer snapshot, run `update.ts` with `--company <id>`. It fills blank profile fields, adds new stakeholder and security fields, uploads documents the company doesn't have yet, and never changes balances. When the founder has signed up, hand the company over:

```sh
cd packages/backend
bunx convex run --prod operator:shareCompany '{"companyId":"<id>","email":"founder@example.com","owner":true}'
```

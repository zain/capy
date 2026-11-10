# Self-hosting Capy

The supported path is the Capy web app on **your Cloudflare account** and a backend project on **your Convex account**. You control those deployments and their data. No Capy subscription or Stripe account is needed when `CAPY_SELF_HOSTED=true`.

This is not a standalone Docker/SQLite application. You can also run the open-source Convex backend on your own server. `bun run deploy` does not support that setup, so it needs the manual steps in [Running the Convex backend yourself](#running-the-convex-backend-yourself).

## 1. Start with a working development installation

Follow [local setup](../README.md#run-locally). Use your own Convex project. Keep development and production separate.

## 2. Configure the web deployment

The checked-in `apps/web/wrangler.toml` describes the hosted Capy service. Replace it with the included example before deploying a fork:

```sh
cp apps/web/wrangler.self-hosted.toml.example apps/web/wrangler.toml
```

Choose a unique Worker name. Set `SITE_URL` to the HTTPS origin you will use, such as your Worker subdomain or custom domain. The example uses `workers_dev = true` and has no Capy domain routes. If adding a custom domain, configure it in your own Cloudflare account and update `SITE_URL` to match.

Authenticate Wrangler in your own account:

```sh
cd apps/web
bunx wrangler login
cd ../..
```

## 3. Configure production Convex

Create/select your own project's production deployment in the Convex dashboard. From `packages/backend`, set:

```sh
bunx convex env set --prod SITE_URL https://your-capy.example.com
bunx convex env set --prod BETTER_AUTH_SECRET "$(openssl rand -hex 32)"
bunx convex env set --prod CAPY_SELF_HOSTED true
```

Replace the example origin with your actual web origin. Use a different auth secret from development. Without the self-hosted flag, the application uses Capy's hosted-service subscription policy and December 2026 editing cutoff.

## 4. Build and deploy

From the repository root:

```sh
bun run check
bun run test
bun run deploy
```

Review the target shown by Convex before confirming. The command selects that project's production backend, writes the corresponding public URLs to ignored `apps/web/.env.production.local`, builds the app, deploys Convex, then deploys the Cloudflare Worker. It does not seed a database or copy data from development.

## 5. Verify your installation

- Open `/signup` and create a disposable account, then sign out and back in.
- Open `/billing`; it should say **Self-hosted Capy**, with no subscription required.
- Import a synthetic workbook, reload, and compare ownership totals.
- Download Excel and re-import into a separate company to check the round trip.
- Verify a second unrelated user cannot access the first company's records.
- If using stakeholder portals, test claim and revocation separately.
- If using AI apps, connect the MCP Inspector (`npx @modelcontextprotocol/inspector`) or Claude Code to `https://your-capy.example.com/mcp`, approve the consent screen, and call `list_companies`. See [MCP.md](MCP.md).

Current account email verification and password recovery delivery are not implemented. Review [SECURITY.md](../SECURITY.md) and [product boundaries](FEATURES.md) before deciding who can use your installation.

## Running the Convex backend yourself

Use this instead of steps 3 and 4 when you want the data on your own server rather than in a Convex cloud project. It has been tested with the `ghcr.io/convex/convex-backend` Docker image behind an HTTPS reverse proxy. The examples use `api.capy.example.com` for the Convex API and `site.capy.example.com` for Convex HTTP actions (auth).

1. Run the backend. Both origins must be the public HTTPS URLs that your proxy serves:

   ```yaml
   services:
     backend:
       image: ghcr.io/convex/convex-backend:latest
       ports:
         - "127.0.0.1:3210:3210" # proxy https://api.capy.example.com here
         - "127.0.0.1:3211:3211" # proxy https://site.capy.example.com here
       volumes:
         - data:/convex/data
       environment:
         - CONVEX_CLOUD_ORIGIN=https://api.capy.example.com
         - CONVEX_SITE_ORIGIN=https://site.capy.example.com
         - DISABLE_BEACON=true
   volumes:
     data:
   ```

   Generate an admin key with `docker compose exec backend ./generate_admin_key.sh`.

2. Point the Convex CLI at the backend. From `packages/backend`, set the variables without `--prod`, because a self-hosted backend has a single deployment:

   ```sh
   export CONVEX_SELF_HOSTED_URL=https://api.capy.example.com
   export CONVEX_SELF_HOSTED_ADMIN_KEY=...   # from generate_admin_key.sh
   bunx convex env set SITE_URL https://capy.example.com
   bunx convex env set BETTER_AUTH_SECRET "$(openssl rand -hex 32)"
   bunx convex env set CAPY_SELF_HOSTED true
   bunx convex deploy -y
   ```

3. Build the web app against the backend. `bun run deploy` cannot do this step, because `scripts/build-production.ts` only accepts `*.convex.cloud` URLs. Write the ignored `apps/web/.env.production.local` yourself:

   ```sh
   VITE_CONVEX_URL=https://api.capy.example.com
   VITE_CONVEX_SITE_URL=https://site.capy.example.com
   ```

   Run `bun run build` from `apps/web`. Then deploy with `bun run deploy:web` from the repository root, as in step 4.

4. Run the smoke checks in step 5.

For backups, `bunx convex export` and `bunx convex import` work against a self-hosted backend when the same two environment variables are set. Do not delete the Docker volume to reset data: it also holds the deployment's admin keys and environment variables.

## Analytics, links, and branding

Public-page analytics only initialize on `capyinc.com`. Local development and other hostnames do not send events to Capy's PostHog project. No analytics script is loaded on company screens.

The source includes the hosted service's landing copy, pricing, support addresses, canonical metadata, sitemap, and privacy/terms pages. Update `copy.md`, public routes, header/support links, and `apps/web/public/{robots.txt,sitemap.xml,llms.txt,mcp.md}` for your own deployment. The hosted Stripe implementation and price ID remain in source but are unused by self-hosted mode.

Provide users access to the corresponding source for your installation, including modifications, under the [AGPL license](../LICENSE).

## Updates and rollback

1. Read [CHANGELOG.md](../CHANGELOG.md) and any migration notes for the target release.
2. Back up production before upgrading. Test with a disposable deployment first.
3. Fetch the desired tag, retain your deployment configuration, install with the frozen lockfile, and run checks.
4. Deploy with `bun run deploy` and repeat the smoke checks above.

A previous Cloudflare Worker version can restore the web bundle, but it does not reverse a Convex schema or data change. Confirm backend compatibility before rolling back either component.

## Backups

Use Convex's deployment export/backup facilities, including file storage, for operational backups. Keep backups encrypted and access restricted, and periodically test restoring to a separate deployment. See the [Convex export documentation](https://docs.convex.dev/database/import-export/export).

The app's Excel export is a portable cap-table download. It is not a full service backup: it does not contain auth sessions, every stored workflow record, uploaded file bytes, or the complete activity log.

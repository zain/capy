# Connect Capy to your AI app

Capy has an MCP server, so you can ask Claude, ChatGPT, Cursor, VS Code or another AI app about your cap table. The app reads ownership, stakeholders, grants, vesting, SAFEs, documents and board records for the companies you choose. It can't change your cap table. If you allow it, it can draft changes, and a company admin reviews and applies them in Capy.

The server URL is:

```text
https://capyinc.com/mcp
```

If you self-host Capy, use your own site URL followed by `/mcp`. **Account → Connected apps** in Capy shows the right URL.

## Connect your app

Every app works the same way: add the server URL, sign in to Capy in the browser window the app opens, then choose what the app can see. You never paste a password or API key into the app.

### Claude (web and desktop)

1. In Claude, open **Settings → Connectors** and choose **Add custom connector**.
2. Enter a name such as Capy and the server URL. Leave the advanced OAuth fields empty.
3. Click **Connect**, sign in to Capy and approve.
4. In a chat, turn Capy on from the tools menu.

Connectors you add on claude.ai also work in the Claude desktop app. On Team and Enterprise plans, an owner may need to add the connector for the organization first; each person then connects their own Capy account.

### Claude Code

```sh
claude mcp add --transport http capy https://capyinc.com/mcp
```

Then run `/mcp` in Claude Code, pick capy and choose to authenticate. Add `--scope user` to use Capy in every project.

### ChatGPT

1. On chatgpt.com, open **Settings → Apps & Connectors → Advanced settings** and turn on **Developer mode**.
2. Back in **Apps & Connectors**, choose **Create**. Enter a name, the server URL, and choose **OAuth** for authentication.
3. Sign in to Capy and approve.
4. In a chat, pick Capy from the tools menu.

Custom connectors depend on your ChatGPT plan, and workspace admins may need to allow them. ChatGPT renames these menus from time to time; its help pages on developer mode have the current steps.

### Cursor

Add Capy to `~/.cursor/mcp.json` to use it in every project, or to `.cursor/mcp.json` in one project:

```json
{
  "mcpServers": {
    "capy": { "url": "https://capyinc.com/mcp" }
  }
}
```

Then open Cursor's MCP settings and sign in next to capy.

### VS Code

Add Capy to `.vscode/mcp.json` in your workspace, or run **MCP: Add Server** from the Command Palette and choose HTTP:

```json
{
  "servers": {
    "capy": { "type": "http", "url": "https://capyinc.com/mcp" }
  }
}
```

VS Code asks before it opens the sign-in page. Use Capy from Copilot Chat in agent mode.

### Other apps

Capy works with any MCP client that supports remote servers with OAuth:

- Transport: Streamable HTTP at the server URL. Current and 2025-era protocol versions both work.
- Sign-in: OAuth 2.1 authorization code flow with PKCE (S256) and dynamic client registration, so there's no client ID or secret to copy.
- Discovery: `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server`.

If an app only runs local servers, bridge to Capy with [mcp-remote](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "capy": { "command": "npx", "args": ["-y", "mcp-remote", "https://capyinc.com/mcp"] }
  }
}
```

To try the server yourself, run `npx @modelcontextprotocol/inspector` and connect it to the server URL.

## The consent screen

After you sign in, Capy asks whether to connect the app. It shows:

- **The app's name and where you'll be sent back.** Apps choose their own name, so check the host underneath it. Apps running on your computer, such as Claude Code, show as local. Only continue if you started connecting from that app.
- **Companies it can see.** Tick each company the app may use. Only companies with a cap table are listed.
- **Allow drafting changes for review.** Off unless you turn it on. You can only turn it on when you're an admin of a company you ticked.

Click **Allow access**, then go back to your app. **Deny** sends the app away with nothing. If the app was already connected, Deny also disconnects it. A connection request lasts 10 minutes and works once.

## What the app can do

With a connection, the app can:

- Summarize ownership: fully diluted totals, ownership by group, share class, plan or holder, the option pool and top holders.
- Look up stakeholders and securities, with vested shares today and post-termination exercise deadlines.
- Forecast vesting month by month or quarter by quarter, and list upcoming vesting events.
- List SAFEs and convertible notes with their terms, and model a priced round, including how SAFEs and notes convert.
- Search the data room and hand you download links, or read files up to 8 MB.
- Read board approvals, consents, 409A valuations, offer letters and other records, and the activity log.
- Run a health check that flags problems such as expiring exercise windows, a low option pool, a missing 409A or unsigned approvals.

Apps that support MCP Apps, such as Claude, show some results as interactive views: an ownership chart, a round model you can adjust, and a card for each drafted change. Other apps show the same results as text.

Capy also offers three prompts: prepare the equity section of a board meeting, assemble a due diligence pack, and draft an option grant for a new hire. How you start a prompt depends on your app; in Claude Code, type `/` and look for the capy prompts.

[mcp.md](https://capyinc.com/mcp.md) is the full list of tools, written for AI assistants.

## Permissions

- The app acts as you. It sees the companies you ticked, with your role in each, and nothing else. Stakeholder portal access does not carry over.
- Capy checks your membership on every request. If you're removed from a company, the app loses it too.
- Viewers can read. Drafting needs drafting turned on for the connection **and** the admin role in that company.
- Only an admin with editing access can apply a draft, and only in Capy. There is no tool that applies changes, sends email, collects signatures or deletes anything.

## Review drafted changes

When an app drafts a change, nothing on the cap table changes. The app gives you a review link. You can also find drafts under **Cap Table → Drafted Changes**, and the dashboard reminds you when some are waiting.

An app can draft:

| Draft                     | What applying it does                                   |
| ------------------------- | ------------------------------------------------------- |
| Option or RSU grant       | Adds the grant from the equity plan                     |
| Option exercise           | Records the exercise and issues the new stock           |
| Cancellation              | Cancels some or all of a security                       |
| Stakeholder update or add | Changes a stakeholder's details, or adds a stakeholder  |
| Board consent             | Saves a draft consent to Board Approvals                |
| Round scenario            | Saves a round model to Fundraising; the cap table stays |

The review page shows:

- the summary, and why the app drafted it, in the app's words
- warnings, such as a certificate label that's already used or a grant date in the future
- a before and after table, the change in fully diluted totals, and the ownership impact
- the exact details the app asked for

For a pending draft, the figures are recomputed against your cap table as it is now. If the cap table changed since the draft was made, a yellow note says so; check the figures again. If the draft no longer fits, for example because the security it changes was edited or the cap table was re-imported, Capy says why and won't apply it.

Click **Apply** to make the change, or **Reject** with an optional reason. An applied change is recorded in Recent Activity under your name. Capy also records which app drafted it, and the app can see whether its drafts were applied, rejected or expired.

Drafts expire after 7 days if nobody reviews them. A company can have up to 50 drafts waiting.

## Change or disconnect an app

Open **Account → Connected apps**. It lists each app, the companies it can see, whether it can draft, and when it was last used.

- **Edit** changes the companies or turns drafting on or off.
- **Disconnect** removes the app's access right away. To use it again, connect it again. A download link the app already fetched keeps working until it expires, at most 15 minutes later.

## Self-hosting

Your installation's MCP server is at your `SITE_URL` followed by `/mcp`, for example `https://your-capy.example.com/mcp`. Nothing else needs to be set up: sign-in, discovery and the cleanup job run on the deployment described in the [self-hosting guide](SELF_HOSTING.md).

- `SITE_URL` on Convex must be the exact origin people use to reach the web app. Sign-in pages and the server URL are built from it.
- For local development, use `http://localhost:3001/mcp` with Claude Code or the MCP Inspector. Apps that run in the cloud, such as claude.ai and ChatGPT, can't reach localhost.

## Troubleshooting

- **"This Capy connection expired or was removed. Reconnect Capy."** Sign-ins last 30 days without use, and disconnecting ends them. Reconnect from your app; in Claude Code, run `/mcp` and authenticate again.
- **"This request has expired" during sign-in.** Connection requests last 10 minutes and work once, and belong to the account that started them. Start connecting again from your app.
- **A company is missing.** Only companies with a cap table can be shared. Tick the company under **Account → Connected apps → Edit**.
- **The app can't draft changes.** Turn on drafting under **Account → Connected apps → Edit**, and check that you're an admin of that company. Some apps only refresh their tool list when you start a new chat or restart them.
- **A download link doesn't work.** Links last 15 minutes. Ask the app for a new one.
- **Apply is greyed out.** The draft no longer fits the cap table, has expired, you're a viewer, or the account is read-only until billing is renewed. The review page says which.
- **The app says it made a change.** It didn't. Only an admin applying a draft in Capy changes the cap table. Check **Drafted Changes** and Recent Activity.

## Limits

- Tokens last an hour and renew automatically; a sign-in lasts 30 days without use.
- Results are paged. Most lists return 25 rows by default and up to 100 or 200.
- A certificate lookup returns up to 20 matches. A stakeholder lists up to 100 holdings.
- Files up to 8 MB can be read directly; larger files come as a download link.
- Drafts expire after 7 days, with at most 50 waiting per company.
- Figures come from your imported snapshot plus the changes recorded in Capy since. The app reports the snapshot date with them.

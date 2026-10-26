/** /connect is the OAuth login page for AI apps; its query string is the pending authorization. */
export const isConnectPath = (path: string) => path === "/connect" || path.startsWith("/connect/");

/** Admin (/invite) and stakeholder portal (/join) invitation links. */
export const isInvitationPath = (path: string) =>
  path.startsWith("/invite/") || path.startsWith("/join/");

/** Continue the authorization that sent the user to /connect, now that they're signed in. */
export function resumeAuthorization() {
  window.location.replace("/api/auth/mcp/authorize" + window.location.search);
}

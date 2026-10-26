// Pure rules for admin invitations, kept apart from team.ts so tests can import them.

export const invitationDays = 7;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Why `email` can't accept the invitation now, or null when it can. */
export function acceptProblem(
  inv: { email: string; expiresAt: number; revoked: boolean; acceptedBy?: string } | null,
  user: { id: string; email: string },
  now: number,
) {
  if (!inv || inv.revoked)
    return "This invitation has been revoked. Ask an admin of the company for a new link.";
  if (inv.acceptedBy)
    return inv.acceptedBy === user.id ? null : "This invitation has already been accepted.";
  if (inv.expiresAt < now)
    return "This invitation has expired. Ask an admin of the company for a new link.";
  if (normalizeEmail(user.email) !== inv.email)
    return `This invitation is for ${inv.email}, but you're signed in as ${user.email}. Sign out and sign in or create an account with ${inv.email}.`;
  return null;
}

/** Whether an invitation still waits to be accepted. */
export function isPending(
  inv: { expiresAt: number; revoked: boolean; acceptedBy?: string },
  now: number,
) {
  return !inv.revoked && !inv.acceptedBy && inv.expiresAt >= now;
}

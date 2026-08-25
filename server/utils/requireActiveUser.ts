import type { H3Event } from "h3";
import { isFuture } from "~~/shared/utils/sqliteTime";
import { requireRole, type Role } from "./requireRole";

/**
 * Middle rung of the authorisation ladder: requireRole, then requireActiveUser,
 * then requireApproved.
 *
 * `requireRole` answers "is this caller who they need to be". This adds "and is
 * their account currently in good standing", which is the check that write
 * endpoints want. Read endpoints deliberately stop at `requireRole`, so a muted
 * user can still browse the archive they cannot post to.
 */
export function requireActiveUser(event: H3Event, minimum: Role = "archivist") {
  const user = requireRole(event, minimum);

  if (user.bannedAt) {
    throw createError({
      statusCode: 403,
      statusMessage: "This account has been banned.",
    });
  }

  if (isFuture(user.mutedUntil)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Your account is muted.",
    });
  }

  return user;
}

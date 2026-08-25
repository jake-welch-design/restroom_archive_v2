import { schema } from "~~/server/utils/db";

/**
 * The subset of the users row that travels in the session cookie and hangs off
 * `event.context.user`.
 *
 * This projection is the single source of truth for that shape. `types/auth.d.ts`
 * derives both the `#auth-utils` `User` interface and the H3 event-context type
 * from it rather than restating the fields, which is what previously let the
 * declared type drift a field ahead of every query that populated it.
 *
 * Deliberately excluded:
 * - `passwordHash`, which must never leave the server.
 * - `emailVerifiedAt`, which `server/api/me/email.patch.ts` writes and nothing
 *   reads. Adding it to the session would ship a value no consumer wants.
 * - `createdAt`, which no client surface displays.
 */
export const SESSION_USER_COLUMNS = {
  id: schema.users.id,
  email: schema.users.email,
  username: schema.users.username,
  displayName: schema.users.displayName,
  role: schema.users.role,
  submissionRequestedAt: schema.users.submissionRequestedAt,
  approvedAt: schema.users.approvedAt,
  mutedUntil: schema.users.mutedUntil,
  bannedAt: schema.users.bannedAt,
  adminMessage: schema.users.adminMessage,
  adminMessageAt: schema.users.adminMessageAt,
};

/** The row shape produced by selecting {@link SESSION_USER_COLUMNS}. */
export interface SessionUser {
  id: number;
  email: string;
  username: string;
  displayName: string | null;
  role: string;
  submissionRequestedAt: string | null;
  approvedAt: string | null;
  mutedUntil: string | null;
  bannedAt: string | null;
  adminMessage: string | null;
  adminMessageAt: string | null;
}

/**
 * Narrows a full users row down to the session shape.
 *
 * Sign-in and sign-up both need the whole row (to verify the password, and to
 * read back what was just inserted), so they cannot use the projection above
 * directly. This gives them the same result without a second query, and keeps
 * the nullable columns explicitly null rather than undefined so the sealed
 * cookie holds a stable shape.
 */
export function toSessionUser(row: {
  id: number;
  email: string;
  username: string;
  displayName: string | null;
  role: string;
  submissionRequestedAt?: string | null;
  approvedAt?: string | null;
  mutedUntil?: string | null;
  bannedAt?: string | null;
  adminMessage?: string | null;
  adminMessageAt?: string | null;
}): SessionUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    submissionRequestedAt: row.submissionRequestedAt ?? null,
    approvedAt: row.approvedAt ?? null,
    mutedUntil: row.mutedUntil ?? null,
    bannedAt: row.bannedAt ?? null,
    adminMessage: row.adminMessage ?? null,
    adminMessageAt: row.adminMessageAt ?? null,
  };
}

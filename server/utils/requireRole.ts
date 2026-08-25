import type { H3Event } from "h3";

export type Role = "archivist" | "admin";

const ROLE_RANK: Record<Role, number> = { archivist: 0, admin: 1 };

export function requireRole(event: H3Event, minimum: Role = "archivist") {
  const user = event.context.user;
  if (!user)
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  const userRank = ROLE_RANK[user.role as Role] ?? -1;
  if (userRank < ROLE_RANK[minimum]) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  return user;
}

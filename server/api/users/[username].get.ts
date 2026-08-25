import { and, eq, sql } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { validateUsername } from "~~/server/utils/username";

export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, "username") ?? "";
  const v = validateUsername(raw);
  if (!v.ok)
    throw createError({ statusCode: 404, statusMessage: "User not found" });

  const db = useDb(event);

  const user = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      createdAt: schema.users.createdAt,
      bannedAt: schema.users.bannedAt,
    })
    .from(schema.users)
    .where(eq(schema.users.username, v.value))
    .get();

  // Banned accounts 404 to avoid leaking that the username exists.
  if (!user || user.bannedAt) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  const restroomCountRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.restrooms)
    .where(
      and(
        eq(schema.restrooms.submittedBy, user.id),
        eq(schema.restrooms.status, "published"),
      ),
    )
    .get();

  const annotationCountRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.annotations)
    .where(eq(schema.annotations.authorId, user.id))
    .get();

  const restrooms = Number(restroomCountRow?.n ?? 0);
  const annotations = Number(annotationCountRow?.n ?? 0);

  return {
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt,
    contributionCount: restrooms + annotations,
  };
});

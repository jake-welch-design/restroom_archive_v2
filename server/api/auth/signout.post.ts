import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";

export default defineEventHandler(async (event) => {
  // Clear any pending admin message. Signing out is the user-side
  // acknowledgement that they've seen it.
  const userId = event.context.user?.id;
  if (userId) {
    try {
      const db = useDb(event);
      await db
        .update(schema.users)
        .set({ adminMessage: null, adminMessageAt: null })
        .where(eq(schema.users.id, userId));
    } catch {
      // No database binding. Proceed with the logout regardless.
    }
  }

  await clearUserSession(event);
  return { ok: true };
});

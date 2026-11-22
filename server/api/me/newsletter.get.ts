import {
  findPlunkContact,
  isWeeklyReportSubscriber,
  plunkConfigured,
} from "~~/server/utils/plunk";
import { requireRole } from "~~/server/utils/requireRole";

/**
 * Whether the signed-in account's email is on the Weekly Report, for the
 * Profile tab. Asked of Plunk each time rather than stored in D1: Plunk's own
 * unsubscribe link changes the answer without telling us.
 *
 * Only ever the caller's own address, so this can't be used to look anyone
 * else up.
 */
export default defineEventHandler(async (event) => {
  const user = requireRole(event, "archivist");

  if (!plunkConfigured(event)) return { subscribed: false, configured: false };

  const contact = await findPlunkContact(event, user.email);
  return { subscribed: isWeeklyReportSubscriber(contact), configured: true };
});

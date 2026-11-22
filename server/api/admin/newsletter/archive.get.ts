import { requireRole } from "~~/server/utils/requireRole";
import { listArchivedIssues } from "~~/server/utils/weeklyReportArchive";

/** The archived issues, newest week first, for the composer. */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");
  return { issues: await listArchivedIssues(event) };
});

import { z } from "zod";
import { requireRole } from "~~/server/utils/requireRole";
import { Issue } from "~~/server/utils/weeklyReportCampaign";
import {
  archiveIssue,
  listArchivedIssues,
} from "~~/server/utils/weeklyReportArchive";

const Body = z.object({ issue: Issue });

/**
 * Adds an issue that has already been sent to the archive by hand, or saves a
 * correction to one that's there. Sends nothing.
 */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");
  const { issue } = await readValidatedBody(event, Body.parse);
  await archiveIssue(event, issue, null);
  return { issues: await listArchivedIssues(event) };
});

import { plunk } from "~~/server/utils/plunk";
import { requireRole } from "~~/server/utils/requireRole";
import {
  CampaignBody,
  saveCampaign,
} from "~~/server/utils/weeklyReportCampaign";
import { archiveIssue } from "~~/server/utils/weeklyReportArchive";

/**
 * Saves the issue to its Plunk draft, sends it to every subscriber, and keeps
 * it in the archive of sent issues.
 */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");
  const { issue, campaignId } = await readValidatedBody(
    event,
    CampaignBody.parse,
  );

  const id = await saveCampaign(event, issue, campaignId);
  await plunk(event, `/campaigns/${id}/send`, { method: "POST", body: {} });

  // The email has gone by now, so a failure here must not read as a failed
  // send (the admin would send it twice). The composer offers "Add to
  // archive" instead.
  let archived = true;
  try {
    await archiveIssue(event, issue, id);
  } catch (err) {
    console.error("weekly report archive write failed", err);
    archived = false;
  }
  return { campaignId: id, archived };
});

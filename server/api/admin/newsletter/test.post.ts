import { plunk } from "~~/server/utils/plunk";
import { requireRole } from "~~/server/utils/requireRole";
import {
  CampaignBody,
  saveCampaign,
} from "~~/server/utils/weeklyReportCampaign";

/**
 * Saves the issue to its Plunk draft and sends that draft to the signed-in
 * admin alone, exactly as subscribers would get it.
 */
export default defineEventHandler(async (event) => {
  const user = requireRole(event, "admin");
  const { issue, campaignId } = await readValidatedBody(
    event,
    CampaignBody.parse,
  );

  const id = await saveCampaign(event, issue, campaignId);
  await plunk(event, `/campaigns/${id}/test`, {
    method: "POST",
    body: { email: user.email },
  });
  return { campaignId: id, sentTo: user.email };
});

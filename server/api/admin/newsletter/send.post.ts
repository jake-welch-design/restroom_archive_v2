import { plunk } from "~~/server/utils/plunk";
import { requireRole } from "~~/server/utils/requireRole";
import {
  CampaignBody,
  saveCampaign,
} from "~~/server/utils/weeklyReportCampaign";

/** Saves the issue to its Plunk draft and sends it to every subscriber. */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");
  const { issue, campaignId } = await readValidatedBody(
    event,
    CampaignBody.parse,
  );

  const id = await saveCampaign(event, issue, campaignId);
  await plunk(event, `/campaigns/${id}/send`, { method: "POST", body: {} });
  return { campaignId: id };
});

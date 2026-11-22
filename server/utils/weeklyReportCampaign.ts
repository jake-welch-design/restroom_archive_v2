import type { H3Event } from "h3";
import { z } from "zod";
import {
  renderWeeklyReport,
  type WeeklyReportIssue,
} from "~~/shared/utils/weeklyReport";
import { plunk, WEEKLY_REPORT_AUDIENCE } from "~~/server/utils/plunk";
import { publicUrls } from "~~/server/utils/urls";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/);
/** Site-relative image paths only, or none: the email shows the archive's own. */
const image = z
  .string()
  .regex(/^\/(api\/r2\/thumbs|newsletter)\//)
  .max(500)
  .nullable();
const text = (max: number) => z.string().max(max);

const Entry = z.object({
  slug: text(200),
  name: text(200),
  isoDate,
  location: text(200),
  imageUrl: image,
});

/** A place new to the archive and the entry its chip links to. */
const Place = z.object({ name: text(200), slug: text(200) });

export const Issue = z.object({
  weekStart: isoDate,
  weekEnd: isoDate,
  subject: z.string().trim().min(1).max(200),
  preheader: text(200),
  featured: Entry.extend({ note: text(2000) }).nullable(),
  submissions: z.array(Entry).max(12),
  notes: z
    .object({
      headline: text(200),
      body: text(5000),
      linkLabel: text(100),
      linkUrl: z
        .string()
        .max(500)
        .regex(/^(https:\/\/|\/|$)/),
    })
    .nullable(),
  stats: z
    .object({
      totals: z
        .object({
          restrooms: z.number().int().nonnegative(),
          archivists: z.number().int().nonnegative(),
          countries: z.number().int().nonnegative().nullable(),
          cities: z.number().int().nonnegative(),
        })
        .nullable(),
      week: z
        .object({
          topArchivists: z
            .array(
              z.object({ name: text(200), count: z.number().int().positive() }),
            )
            .max(20),
          newCountries: z.array(Place).max(100),
          newStates: z.array(Place).max(100),
          newCities: z.array(Place).max(100),
        })
        .nullable(),
    })
    .nullable(),
}) satisfies z.ZodType<WeeklyReportIssue>;

export const CampaignBody = z.object({
  issue: Issue,
  /** The Plunk draft this issue was last saved to, if any. */
  campaignId: z.string().uuid().nullable(),
});

interface PlunkCampaign {
  data?: { id: string; status?: string };
  id?: string;
  status?: string;
}

/**
 * Writes the issue to a Plunk draft campaign, creating one the first time and
 * replacing it after, and returns its id. Headless, so Plunk adds no footer of
 * its own (the design carries the unsubscribe link) but still skips anyone who
 * has unsubscribed.
 */
export async function saveCampaign(
  event: H3Event,
  issue: WeeklyReportIssue,
  campaignId: string | null,
): Promise<string> {
  const html = renderWeeklyReport(issue, { siteUrl: publicUrls(event).site });
  const campaign = {
    name: `Weekly Report ${issue.weekStart} – ${issue.weekEnd}`,
    subject: issue.subject,
    body: html,
    from: "noreply@restroomarchive.com",
    fromName: "The Restroom Archive",
    replyTo: "hello@restroomarchive.com",
    type: "HEADLESS",
    audienceType: "FILTERED",
    audienceCondition: WEEKLY_REPORT_AUDIENCE,
  };

  const res = await plunk<PlunkCampaign>(
    event,
    campaignId ? `/campaigns/${campaignId}` : "/campaigns",
    { method: campaignId ? "PUT" : "POST", body: campaign },
  );
  const id = res.data?.id ?? res.id;
  if (!id)
    throw createError({
      statusCode: 502,
      statusMessage: "Plunk did not return a campaign id.",
    });
  return id;
}

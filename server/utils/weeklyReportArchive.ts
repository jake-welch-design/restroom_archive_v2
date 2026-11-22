import type { H3Event } from "h3";
import { desc, sql } from "drizzle-orm";
import {
  renderWeeklyReport,
  type WeeklyReportIssue,
} from "~~/shared/utils/weeklyReport";
import { useDb, schema } from "~~/server/utils/db";
import { publicUrls } from "~~/server/utils/urls";

/**
 * Saves a sent issue to the archive, keyed by its week: a second save of the
 * same week replaces its contents but keeps the first `sent_at`.
 */
export async function archiveIssue(
  event: H3Event,
  issue: WeeklyReportIssue,
  campaignId: string | null,
) {
  const t = schema.weeklyReportIssues;
  const row = {
    weekStart: issue.weekStart,
    weekEnd: issue.weekEnd,
    subject: issue.subject,
    issue: JSON.stringify(issue),
    html: renderWeeklyReport(issue, { siteUrl: publicUrls(event).site }),
    campaignId,
  };
  await useDb(event)
    .insert(t)
    .values(row)
    .onConflictDoUpdate({
      target: t.weekStart,
      set: {
        ...row,
        // Keep the campaign of the original send when a hand save has none.
        campaignId: sql`coalesce(excluded.campaign_id, ${t.campaignId})`,
        updatedAt: sql`(datetime('now'))`,
      },
    });
}

/** Every archived issue, newest week first, without its contents. */
export async function listArchivedIssues(event: H3Event) {
  const t = schema.weeklyReportIssues;
  return useDb(event)
    .select({
      weekStart: t.weekStart,
      weekEnd: t.weekEnd,
      subject: t.subject,
      sentAt: t.sentAt,
      updatedAt: t.updatedAt,
    })
    .from(t)
    .orderBy(desc(t.weekStart));
}

-- The Weekly Report's sent issues, kept so they can be shown again later to
-- anyone who missed them.
--
-- One row per week. Sending an issue saves it here; the composer's "Add to
-- archive" button saves one by hand (an issue sent before this table existed,
-- or a correction to one already here). Saving the same week again replaces
-- its contents but keeps the first `sent_at`.
--
-- `issue` is the composer's issue as JSON (WeeklyReportIssue in
-- shared/utils/weeklyReport.ts), so a page showing an old issue renders it
-- with the current design and its fixes, while its stats stay as they were
-- that week. `html` is the email exactly as it went out, `{{unsubscribeUrl}}`
-- placeholder and all, kept as the record of what subscribers received.
CREATE TABLE weekly_report_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  subject TEXT NOT NULL,
  issue TEXT NOT NULL,
  html TEXT NOT NULL,
  campaign_id TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX weekly_report_issues_week_unique
  ON weekly_report_issues(week_start);

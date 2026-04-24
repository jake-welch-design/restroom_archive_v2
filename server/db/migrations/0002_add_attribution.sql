-- Add attribution column to restrooms (missed in 0001 migration)
ALTER TABLE `restrooms` ADD COLUMN `attribution` text NOT NULL DEFAULT 'Jake Welch';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_restrooms_iso_date` ON `restrooms` (`iso_date`);

-- Phase 2 migration applied against an existing prod database that already
-- contains the phase-1 `restrooms` table. This migration adds the new columns
-- used by Grid/Map/Search/Auth/Submit/Admin flows, and creates the users table.
-- Local D1 without the phase-1 table will fail on ALTER — expected.

CREATE TABLE IF NOT EXISTS `users` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `email` text NOT NULL,
    `password_hash` text NOT NULL,
    `display_name` text,
    `role` text DEFAULT 'member' NOT NULL,
    `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
ALTER TABLE `restrooms` ADD COLUMN `lat` real;
--> statement-breakpoint
ALTER TABLE `restrooms` ADD COLUMN `lng` real;
--> statement-breakpoint
ALTER TABLE `restrooms` ADD COLUMN `description` text;
--> statement-breakpoint
ALTER TABLE `restrooms` ADD COLUMN `thumb_key` text;
--> statement-breakpoint
ALTER TABLE `restrooms` ADD COLUMN `status` text DEFAULT 'published' NOT NULL;
--> statement-breakpoint
ALTER TABLE `restrooms` ADD COLUMN `submitted_by` integer REFERENCES `users`(`id`);
--> statement-breakpoint
ALTER TABLE `restrooms` ADD COLUMN `updated_at` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `restrooms` SET `updated_at` = `created_at` WHERE `updated_at` = '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_restrooms_status` ON `restrooms` (`status`);

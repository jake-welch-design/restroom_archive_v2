-- Expanded beta application form: socials, how they found the archive, and a
-- record of when they accepted the archivist terms.
ALTER TABLE `beta_applications` ADD COLUMN `socials` text;
--> statement-breakpoint
ALTER TABLE `beta_applications` ADD COLUMN `found_via` text;
--> statement-breakpoint
ALTER TABLE `beta_applications` ADD COLUMN `terms_accepted_at` text;
--> statement-breakpoint
-- Email verification was removed: accounts are only created via emailed invite
-- links, which already prove the address. The users.email_verified_at column is
-- kept as a historical record; the standalone token table is no longer used.
DROP TABLE IF EXISTS `email_verification_tokens`;

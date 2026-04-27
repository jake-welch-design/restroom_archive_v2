-- Add public usernames + drop legacy free-text restroom attribution.
-- Two existing accounts are backfilled by email so they can sign in immediately
-- after migration. Their display_names stay null (rendered as @jake / @test).
ALTER TABLE `users` ADD COLUMN `username` text;
--> statement-breakpoint
UPDATE `users` SET `username` = 'jake' WHERE lower(`email`) = 'jaketwelch@gmail.com';
--> statement-breakpoint
UPDATE `users` SET `username` = 'test' WHERE lower(`email`) = 'vivelaluttedestravallieurs@gmail.com';
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
--> statement-breakpoint
ALTER TABLE `restrooms` DROP COLUMN `attribution`;

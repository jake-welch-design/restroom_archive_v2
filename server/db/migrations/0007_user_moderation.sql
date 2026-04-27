ALTER TABLE `users` ADD COLUMN `muted_until` text;
ALTER TABLE `users` ADD COLUMN `banned_at` text;
ALTER TABLE `users` ADD COLUMN `admin_message` text;
ALTER TABLE `users` ADD COLUMN `admin_message_at` text;

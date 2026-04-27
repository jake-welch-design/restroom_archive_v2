ALTER TABLE `users` ADD COLUMN `submission_requested_at` text;

UPDATE `users` SET `submission_requested_at` = `created_at` WHERE `approved_at` IS NOT NULL;

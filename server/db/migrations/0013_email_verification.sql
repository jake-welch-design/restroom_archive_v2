ALTER TABLE `users` ADD COLUMN `email_verified_at` text;

-- Treat all existing accounts as already verified so no one gets locked out.
UPDATE `users` SET `email_verified_at` = `created_at`;

CREATE TABLE `email_verification_tokens` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `user_id` integer NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `token_hash` text NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `used_at` text
);

CREATE INDEX `idx_evt_token_hash` ON `email_verification_tokens` (`token_hash`);
CREATE INDEX `idx_evt_user_id` ON `email_verification_tokens` (`user_id`);

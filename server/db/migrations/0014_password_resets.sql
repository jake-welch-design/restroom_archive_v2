CREATE TABLE `password_reset_tokens` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `user_id` integer NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `token_hash` text NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `used_at` text
);

CREATE INDEX `idx_prt_token_hash` ON `password_reset_tokens` (`token_hash`);
CREATE INDEX `idx_prt_user_id` ON `password_reset_tokens` (`user_id`);

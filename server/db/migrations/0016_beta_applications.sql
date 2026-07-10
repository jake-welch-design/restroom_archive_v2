CREATE TABLE `beta_applications` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `email` text NOT NULL,
  `display_name` text,
  `reason` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `reviewed_at` text,
  -- Preserve the application if the reviewing admin is later deleted.
  `reviewed_by` integer REFERENCES `users`(`id`) ON DELETE SET NULL,
  `invite_token_hash` text,
  `invite_expires_at` text,
  `invited_at` text,
  `claimed_at` text,
  -- Set once the invite is claimed and the account exists.
  `user_id` integer REFERENCES `users`(`id`) ON DELETE SET NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX `idx_beta_applications_email` ON `beta_applications` (`email`);
CREATE INDEX `idx_beta_applications_status` ON `beta_applications` (`status`);
CREATE INDEX `idx_beta_applications_token_hash` ON `beta_applications` (`invite_token_hash`);

CREATE TABLE `admin_audit_log` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  -- Preserve history if the actor account is later deleted.
  `actor_id` integer REFERENCES `users`(`id`) ON DELETE SET NULL,
  `action` text NOT NULL,
  `target_type` text NOT NULL,
  `target_id` integer,
  `metadata` text,
  `created_at` text NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX `idx_audit_log_created_at` ON `admin_audit_log` (`created_at`);
CREATE INDEX `idx_audit_log_actor` ON `admin_audit_log` (`actor_id`);
CREATE INDEX `idx_audit_log_target` ON `admin_audit_log` (`target_type`, `target_id`);

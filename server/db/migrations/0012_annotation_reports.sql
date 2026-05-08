ALTER TABLE `annotations` ADD COLUMN `hidden_at` text;
ALTER TABLE `annotations` ADD COLUMN `hidden_by` integer REFERENCES `users`(`id`);

CREATE TABLE `annotation_reports` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `annotation_id` integer NOT NULL REFERENCES `annotations`(`id`) ON DELETE CASCADE,
  `reporter_id` integer REFERENCES `users`(`id`),
  `reason` text,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `resolved_at` text,
  `resolved_by` integer REFERENCES `users`(`id`)
);

CREATE UNIQUE INDEX `annotation_reports_unique_per_user` ON `annotation_reports` (`annotation_id`, `reporter_id`);
CREATE INDEX `idx_annotation_reports_open` ON `annotation_reports` (`resolved_at`);

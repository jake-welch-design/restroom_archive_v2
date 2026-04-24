-- Phase 3: roles + approval + annotations + removal requests.
-- Rename 'member' -> 'archivist' and grandfather existing users with approved_at=now()
-- so prod data (currently a single admin) continues to function.

CREATE TABLE `annotations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`restroom_id` integer NOT NULL,
	`author_id` integer NOT NULL,
	`body` text NOT NULL,
	`point_x` real NOT NULL,
	`point_y` real NOT NULL,
	`point_z` real NOT NULL,
	`camera_mode` text NOT NULL,
	`camera_fov` real NOT NULL,
	`orbit_pos_x` real,
	`orbit_pos_y` real,
	`orbit_pos_z` real,
	`rotation_x` real,
	`rotation_y` real,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`restroom_id`) REFERENCES `restrooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `restrooms` ADD `removal_requested_by` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `restrooms` ADD `removal_reason` text;--> statement-breakpoint
ALTER TABLE `users` ADD `approved_at` text;--> statement-breakpoint
CREATE INDEX `idx_annotations_restroom` ON `annotations` (`restroom_id`);--> statement-breakpoint
UPDATE `users` SET `role` = 'archivist' WHERE `role` = 'member';--> statement-breakpoint
UPDATE `users` SET `approved_at` = datetime('now') WHERE `approved_at` IS NULL;

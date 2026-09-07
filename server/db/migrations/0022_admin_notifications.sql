-- Per-admin opt-in push notifications, delivered through ntfy.
--
-- Two columns rather than one boolean, for the same reason the other user
-- flags in this table are timestamps: `ntfy_topic` is the destination and
-- `admin_notify_at` is the consent. Keeping them apart means toggling
-- notifications off does not throw away the topic the admin already set up on
-- their phone, and turning them back on is a checkbox rather than a
-- reconfiguration.
--
-- Both are NULL for every existing row, which is the point: no admin is
-- auto-enrolled by this migration, and an admin who never opens the setting is
-- never notified.
ALTER TABLE users ADD COLUMN ntfy_topic TEXT;
ALTER TABLE users ADD COLUMN admin_notify_at TEXT;

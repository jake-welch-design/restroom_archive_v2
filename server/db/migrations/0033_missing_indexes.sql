-- Indexes covering foreign-key lookups, catalog status+date sorting, and
-- rate-limit expiry sweeps.
CREATE INDEX IF NOT EXISTS idx_restrooms_submitted_by ON restrooms(submitted_by);
CREATE INDEX IF NOT EXISTS idx_restrooms_status_iso_date ON restrooms(status, iso_date);
CREATE INDEX IF NOT EXISTS idx_annotations_author ON annotations(author_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expires_at ON rate_limits(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);
DROP INDEX IF EXISTS idx_user_blocks_blocker;

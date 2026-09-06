-- Rejection becomes reversible for a grace period instead of deleting the
-- scan on the spot.
--
-- `rejected_at` is when the rejection happened, and the clock the countdown
-- and the purge sweep both read. It is deliberately separate from
-- `updated_at`: a ban, an unban, or any other write to the row moves that
-- column, which would silently extend or shorten the window.
--
-- `scan_purged_at` is set once the sweep has actually deleted the blobs. It,
-- not the clock, is what says an entry can no longer be restored, so a sweep
-- that has not run yet cannot make the interface offer a restore that would
-- produce an entry pointing at nothing.
--
-- Both are NULL on entries rejected before this migration. Those had their
-- blobs deleted at rejection time, so a NULL `rejected_at` reads as "no scan,
-- never restorable" -- which is exactly right, and is why no backfill runs
-- here.
ALTER TABLE restrooms ADD COLUMN rejected_at TEXT;
ALTER TABLE restrooms ADD COLUMN scan_purged_at TEXT;

-- The sweep looks up expired rejections by `rejected_at` alone, across every
-- status (a banned submitter's rejected entry sits at `hidden`), so the index
-- is on that column rather than on the existing status index.
CREATE INDEX idx_restrooms_rejected_at ON restrooms (rejected_at);

-- Bans become reversible.
--
-- Banning hides every entry the account submitted by overwriting `status`, which
-- destroyed the only record of what each entry had been. Lifting a ban therefore
-- had no way back: `published`, `pending`, `rejected` and `removed` entries all
-- read as `hidden` afterwards, and restoring them meant guessing one by one.
--
-- `pre_ban_status` holds the status an entry carried at the moment its submitter
-- was banned, and is cleared when the ban is lifted. NULL means "not hidden by a
-- ban", which is every row that has never belonged to a banned account.
ALTER TABLE `restrooms` ADD COLUMN `pre_ban_status` text;

-- Entries hidden by a ban issued before this column existed have no recorded
-- prior status, and `hidden` is only ever written by a ban, so these rows are
-- exactly that set. They are backfilled to `pending` rather than `published`
-- because the real value is unknowable: sending one back through review is a
-- recoverable inconvenience, whereas republishing an entry that had been
-- rejected or removed puts a listing back in the archive whose R2 blobs
-- `deleteRestroomBlobs` already deleted.
UPDATE `restrooms` SET `pre_ban_status` = 'pending' WHERE `status` = 'hidden';

-- Lets one catalog entry hold more than one scan.
--
-- An entry is a place, archived by its name and location first. When the same
-- place is scanned again -- a rescan, a remodel, an old scan submitted late --
-- the new scan joins the existing entry rather than getting one of its own.
-- The catalog shows the entry at its most recent scan, and its date becomes a
-- picker for the others, the way a map shows one place across several years.
-- What changed between two scans is each scan's own description to say.
--
-- Each scan stays its own row, with its own slug and its own /r/<slug> URL, so
-- a link to a scan keeps pointing at that scan.
--
-- Scans of one place share an `establishment` key. It is an opaque grouping
-- value, not a URL. Every row is backfilled with its own slug, which is unique
-- by construction, so this migration combines nothing: the catalog looks
-- exactly as it did. Scans are combined only when an admin points one at
-- another's key. A new submission gets its own slug the same way (see
-- submit.post.ts), which keeps two branches of a chain apart without deriving
-- a key from the name and the street.
--
-- Several restrooms at one place are not modelled here. They stay separate
-- entries, told apart by their names.
ALTER TABLE restrooms ADD COLUMN establishment TEXT;

-- Every status, not only published, for the reason 0028 gave: a pending or
-- rejected row can still reach the catalog later.
UPDATE restrooms SET establishment = slug WHERE establishment IS NULL;

CREATE INDEX idx_restrooms_establishment ON restrooms(establishment);

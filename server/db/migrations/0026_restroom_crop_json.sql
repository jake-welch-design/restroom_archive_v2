-- Replaces the six crop columns from 0025 with one JSON column.
--
-- 0025 stored a crop as a single box, which was all a crop needed when the only
-- thing it could do was keep what was inside it. The tool now also runs the
-- other way round, deleting what is inside the box, and that needs two boxes
-- rather than one: the box the admin drew, and the bounding box of whatever
-- geometry survives it. The second is what the viewer centres and frames on,
-- because in `remove` mode the drawn box is the part being thrown away and
-- centring on it would point the viewer at the hole.
--
-- A mode and two boxes is thirteen columns that only mean anything together, so
-- it goes in one column as JSON, the way `descriptors` already does.
-- shared/utils/crop.ts owns the shape and reads it leniently.
--
-- Dropping the 0025 columns is safe precisely here: they were added a day ago,
-- nothing in the deployed application has ever written to them, and every row
-- holds NULL. That stops being true the moment an admin crops anything, which
-- is why the change happens now rather than later.
ALTER TABLE restrooms ADD COLUMN crop TEXT;

ALTER TABLE restrooms DROP COLUMN crop_min_x;
ALTER TABLE restrooms DROP COLUMN crop_min_y;
ALTER TABLE restrooms DROP COLUMN crop_min_z;
ALTER TABLE restrooms DROP COLUMN crop_max_x;
ALTER TABLE restrooms DROP COLUMN crop_max_y;
ALTER TABLE restrooms DROP COLUMN crop_max_z;

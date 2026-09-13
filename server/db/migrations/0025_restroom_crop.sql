-- An admin-drawn crop box, so a scan that arrived with stray geometry can be
-- trimmed and re-centred without touching the GLB.
--
-- The viewer derives everything about framing from one bounding box: the
-- model's centre, the camera distance, the near/far planes, the orbit pivot and
-- the POV starting point. A floating fragment metres from the room inflates
-- that box and drags all of them off. These six columns are the box to use
-- instead of the measured one, which corrects the crop and the centring
-- together.
--
-- The values are in the GLB's own local space, not the viewer's centred world
-- space. That is what lets a crop be re-edited: the stored box means the same
-- thing no matter where the viewer last centred the model, so a second pass
-- composes with the first instead of drifting by the previous offset.
--
-- Six columns rather than one JSON blob, matching how `annotations` already
-- stores points and cameras (point_x, orbit_pos_x, and so on).
--
-- All NULL means no crop, which is every existing row and is exactly the
-- behaviour before this migration. Nothing is backfilled.
ALTER TABLE restrooms ADD COLUMN crop_min_x REAL;
ALTER TABLE restrooms ADD COLUMN crop_min_y REAL;
ALTER TABLE restrooms ADD COLUMN crop_min_z REAL;
ALTER TABLE restrooms ADD COLUMN crop_max_x REAL;
ALTER TABLE restrooms ADD COLUMN crop_max_y REAL;
ALTER TABLE restrooms ADD COLUMN crop_max_z REAL;

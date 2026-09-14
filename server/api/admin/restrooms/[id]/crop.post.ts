import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";
import { now } from "~~/server/utils/sqlTime";
import { MIN_CROP_SIZE, serializeCrop } from "~~/shared/utils/crop";

const Coord = z.number().finite();

const BoxSchema = z
  .object({
    minX: Coord,
    minY: Coord,
    minZ: Coord,
    maxX: Coord,
    maxY: Coord,
    maxZ: Coord,
  })
  .refine(
    (c) =>
      c.maxX - c.minX >= MIN_CROP_SIZE &&
      c.maxY - c.minY >= MIN_CROP_SIZE &&
      c.maxZ - c.minZ >= MIN_CROP_SIZE,
    { message: "Crop box is too small on at least one axis" },
  );

const CropSchema = z
  .object({
    mode: z.enum(["keep", "remove"]),
    box: BoxSchema,
    // What the viewer centres on. Equal to the box in `keep` mode; in `remove`
    // mode it is the surviving geometry's bounds, which only the client can
    // measure, since the server would have to parse the GLB to find them.
    frame: BoxSchema,
    // The POV eye height, in the same local space as the boxes. Absent means
    // the default.
    povY: Coord.optional(),
  })
  .refine(
    (c) => c.povY == null || (c.povY >= c.frame.minY && c.povY <= c.frame.maxY),
    { message: "POV height is outside the scan" },
  );

const Body = z.object({
  // Null clears the crop, which is how Reset gets back to the scan's own bounds.
  crop: CropSchema.nullable(),
  // How far the model's centre moves as a result, in the viewer's world space.
  // Supplied by the client because it is the only side that knows both the old
  // and the new centre: the old one depends on the crop that was applied when
  // the scan was loaded, and computing it here would mean parsing the GLB.
  recenterDelta: z.object({ x: Coord, y: Coord, z: Coord }),
});

/**
 * Stores an admin's crop box for one entry, and keeps existing annotations
 * pointing where they were pointing.
 *
 * The crop moves the model's centre, and the viewer defines world space by
 * subtracting that centre, so every world-space coordinate already on record
 * for this entry shifts with it. Annotation points do not: they are stored in
 * model-local space precisely so they track the model. Annotation *cameras*
 * are world-space, so the six orbit columns are shifted by the same delta here.
 * Skipping this would leave every saved view flying to a point offset by the
 * amount the crop moved the centre.
 *
 * POV annotations store rotations and no position, and are re-anchored
 * implicitly by the new centre, so there is nothing to migrate for them.
 */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = getRouterId(event);
  const { crop, recenterDelta } = await readValidatedBody(event, Body.parse);

  const db = useDb(event);

  const row = await db
    .update(schema.restrooms)
    .set({
      crop: serializeCrop(crop),
      updatedAt: now(),
    })
    .where(eq(schema.restrooms.id, id))
    .returning({ id: schema.restrooms.id, slug: schema.restrooms.slug })
    .get();

  if (!row)
    throw createError({ statusCode: 404, statusMessage: "Restroom not found" });

  // A delta of zero is the common case on a re-save that only trimmed a face
  // symmetrically, and writing six columns across every annotation to add zero
  // is work with no result.
  const moved =
    recenterDelta.x !== 0 || recenterDelta.y !== 0 || recenterDelta.z !== 0;

  if (moved) {
    // Raw SQL rather than a read-modify-write: the shift is the same arithmetic
    // on every row, and doing it in one statement keeps a partially migrated
    // set of annotations off the table. The NULL guards matter -- a POV
    // annotation has NULL in all six of these, and `NULL + 0.4` is NULL, which
    // would erase the distinction between "no orbit camera" and "an orbit
    // camera at the origin".
    await db.run(sql`
      UPDATE annotations SET
        orbit_pos_x = CASE WHEN orbit_pos_x IS NULL THEN NULL ELSE orbit_pos_x + ${recenterDelta.x} END,
        orbit_pos_y = CASE WHEN orbit_pos_y IS NULL THEN NULL ELSE orbit_pos_y + ${recenterDelta.y} END,
        orbit_pos_z = CASE WHEN orbit_pos_z IS NULL THEN NULL ELSE orbit_pos_z + ${recenterDelta.z} END,
        orbit_target_x = CASE WHEN orbit_target_x IS NULL THEN NULL ELSE orbit_target_x + ${recenterDelta.x} END,
        orbit_target_y = CASE WHEN orbit_target_y IS NULL THEN NULL ELSE orbit_target_y + ${recenterDelta.y} END,
        orbit_target_z = CASE WHEN orbit_target_z IS NULL THEN NULL ELSE orbit_target_z + ${recenterDelta.z} END
      WHERE restroom_id = ${id}
    `);
  }

  await recordAdminAction(event, "restroom.crop", "restroom", id, {
    crop,
    recenterDelta: moved ? recenterDelta : undefined,
  });

  return { ok: true, slug: row.slug };
});

import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireRole } from "~~/server/utils/requireRole";
import { recordAdminAction } from "~~/server/utils/auditLog";
import { getRouterId } from "~~/server/utils/routeParams";
import { now } from "~~/server/utils/sqlTime";
import {
  MIN_CROP_SIZE,
  parseCrop,
  serializeCrop,
  type Crop,
} from "~~/shared/utils/crop";
import {
  IDENTITY_QUAT,
  isLevelled,
  quatConjugate,
  quatMultiply,
  quatNormalize,
  reframeAnnotation,
  type Framing,
} from "~~/shared/utils/levelling";

const Coord = z.number().finite();
const Vec3Schema = z.object({ x: Coord, y: Coord, z: Coord });

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

const LevelSchema = z.object({
  rotation: z
    .object({ x: Coord, y: Coord, z: Coord, w: Coord })
    // A unit quaternion to within rounding. Normalised below regardless, but
    // anything far from unit length is not a rotation that was meant.
    .refine((q) => Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) < 1e-3, {
      message: "Level rotation is not a unit quaternion",
    }),
  pivot: Vec3Schema,
});

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
    // Where the POV eye stands on the floor, likewise. Absent means the frame's
    // centre; always both or neither.
    povX: Coord.optional(),
    povZ: Coord.optional(),
    // The rotation that levels the scan. Absent means as exported.
    level: LevelSchema.optional(),
  })
  .refine(
    (c) => c.povY == null || (c.povY >= c.frame.minY && c.povY <= c.frame.maxY),
    { message: "POV height is outside the scan" },
  )
  .refine((c) => (c.povX == null) === (c.povZ == null), {
    message: "POV position needs both X and Z",
  })
  .refine(
    (c) =>
      c.povX == null ||
      c.povZ == null ||
      (c.povX >= c.frame.minX &&
        c.povX <= c.frame.maxX &&
        c.povZ >= c.frame.minZ &&
        c.povZ <= c.frame.maxZ),
    { message: "POV position is outside the scan" },
  );

const Body = z.object({
  // Null clears the crop, which is how Reset gets back to the scan's own bounds.
  crop: CropSchema.nullable(),
  // The centre of the box the viewer framed on before this save and after it,
  // each in its own levelled space. Supplied by the client because only it can
  // measure them: with no crop, the centre is the scan's own bounds, which the
  // server would have to parse the GLB to find. The rotations are not taken
  // from the client: the one before comes from the stored row, the one after
  // from `crop` itself.
  centreBefore: Vec3Schema,
  centreAfter: Vec3Schema,
});

/**
 * Stores an admin's crop for one entry, and keeps its annotations marking and
 * framing what they marked and framed.
 *
 * A crop changes the frame the scan is drawn in: its centre always can, and its
 * levelling rotation can too. Annotation points are stored in the scan's
 * levelled local space, so a new rotation moves them; annotation cameras are in
 * world space, so any change of centre or rotation moves them. The arithmetic
 * is in shared/utils/levelling.ts. Skipping it would leave every saved view
 * pointing past its subject by however far the scan moved.
 *
 * The annotations are read from the database and rewritten in the same batch
 * as the crop, rather than taken from the client, so one added since the admin's
 * page loaded is moved too, and a failure moves nothing.
 */
export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const id = getRouterId(event);
  const body = await readValidatedBody(event, Body.parse);

  const db = useDb(event);

  const row = await db
    .select({ slug: schema.restrooms.slug, crop: schema.restrooms.crop })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.id, id))
    .get();

  if (!row)
    throw createError({ statusCode: 404, statusMessage: "Restroom not found" });

  // A level that turns the scan by nothing is dropped rather than stored, so a
  // rotation dragged away and back does not leave a crop that only looks set.
  const crop: Crop | null = body.crop
    ? (() => {
        const { level, ...rest } = body.crop;
        const normalised = level && {
          rotation: quatNormalize(level.rotation),
          pivot: level.pivot,
        };
        return isLevelled(normalised) ? { ...rest, level: normalised } : rest;
      })()
    : null;

  const before: Framing = {
    level: parseCrop(row.crop)?.level ?? null,
    centre: body.centreBefore,
  };
  const after: Framing = {
    level: crop?.level ?? null,
    centre: body.centreAfter,
  };

  const rotated = isLevelled({
    rotation: quatMultiply(
      after.level?.rotation ?? IDENTITY_QUAT,
      quatConjugate(before.level?.rotation ?? IDENTITY_QUAT),
    ),
    pivot: { x: 0, y: 0, z: 0 },
  });
  const recentred =
    before.centre.x !== after.centre.x ||
    before.centre.y !== after.centre.y ||
    before.centre.z !== after.centre.z;

  const writeCrop = db
    .update(schema.restrooms)
    .set({ crop: serializeCrop(crop), updatedAt: now() })
    .where(eq(schema.restrooms.id, id));

  let moved = 0;
  if (rotated || recentred) {
    const annotations = await db
      .select({
        id: schema.annotations.id,
        pointX: schema.annotations.pointX,
        pointY: schema.annotations.pointY,
        pointZ: schema.annotations.pointZ,
        cameraMode: schema.annotations.cameraMode,
        orbitPosX: schema.annotations.orbitPosX,
        orbitPosY: schema.annotations.orbitPosY,
        orbitPosZ: schema.annotations.orbitPosZ,
        orbitTargetX: schema.annotations.orbitTargetX,
        orbitTargetY: schema.annotations.orbitTargetY,
        orbitTargetZ: schema.annotations.orbitTargetZ,
        rotationX: schema.annotations.rotationX,
        rotationY: schema.annotations.rotationY,
        modelRotationY: schema.annotations.modelRotationY,
      })
      .from(schema.annotations)
      .where(eq(schema.annotations.restroomId, id))
      .all();

    const writeAnnotations = annotations.map(({ id: annotationId, ...a }) => {
      const next = reframeAnnotation(a, before, after);
      return db
        .update(schema.annotations)
        .set({
          pointX: next.pointX,
          pointY: next.pointY,
          pointZ: next.pointZ,
          orbitPosX: next.orbitPosX,
          orbitPosY: next.orbitPosY,
          orbitPosZ: next.orbitPosZ,
          orbitTargetX: next.orbitTargetX,
          orbitTargetY: next.orbitTargetY,
          orbitTargetZ: next.orbitTargetZ,
          rotationX: next.rotationX,
          rotationY: next.rotationY,
        })
        .where(eq(schema.annotations.id, annotationId));
    });
    moved = writeAnnotations.length;
    // One batch, so the crop and its annotations change together or not at all.
    await db.batch([writeCrop, ...writeAnnotations]);
  } else {
    await writeCrop;
  }

  await recordAdminAction(event, "restroom.crop", "restroom", id, {
    crop,
    ...(recentred
      ? { centreBefore: body.centreBefore, centreAfter: body.centreAfter }
      : {}),
    ...(moved ? { annotationsMoved: moved } : {}),
  });

  return { ok: true, slug: row.slug };
});

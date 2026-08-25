import { eq } from "drizzle-orm";
import { z } from "zod";
import { useDb, schema } from "~~/server/utils/db";
import { requireActiveUser } from "~~/server/utils/requireActiveUser";
import { rateLimitByUser } from "~~/server/utils/rateLimit";
import { getRouterString } from "~~/server/utils/routeParams";

const OrbitSnapshot = z.object({
  cameraMode: z.literal("orbit"),
  cameraFov: z.number().positive(),
  orbitPosX: z.number(),
  orbitPosY: z.number(),
  orbitPosZ: z.number(),
  orbitTargetX: z.number(),
  orbitTargetY: z.number(),
  orbitTargetZ: z.number(),
  rotationX: z.null().optional(),
  rotationY: z.null().optional(),
});

const PovSnapshot = z.object({
  cameraMode: z.literal("pov"),
  cameraFov: z.number().positive(),
  rotationX: z.number(),
  rotationY: z.number(),
  orbitPosX: z.null().optional(),
  orbitPosY: z.null().optional(),
  orbitPosZ: z.null().optional(),
  orbitTargetX: z.null().optional(),
  orbitTargetY: z.null().optional(),
  orbitTargetZ: z.null().optional(),
});

const Body = z.intersection(
  z.object({
    body: z.string().min(1).max(500),
    pointX: z.number(),
    pointY: z.number(),
    pointZ: z.number(),
    modelRotationY: z.number().default(0),
  }),
  z.discriminatedUnion("cameraMode", [OrbitSnapshot, PovSnapshot]),
);

export default defineEventHandler(async (event) => {
  const user = requireActiveUser(event);
  await rateLimitByUser(event, "annotation", { max: 30, windowSec: 3600 });

  const slug = getRouterString(event, "slug");

  const body = await readValidatedBody(event, Body.parse);

  const db = useDb(event);

  const restroom = await db
    .select({ id: schema.restrooms.id })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.slug, slug))
    .get();

  if (!restroom)
    throw createError({ statusCode: 404, statusMessage: "Restroom not found" });

  const row = await db
    .insert(schema.annotations)
    .values({
      restroomId: restroom.id,
      authorId: user.id,
      body: body.body,
      pointX: body.pointX,
      pointY: body.pointY,
      pointZ: body.pointZ,
      cameraMode: body.cameraMode,
      cameraFov: body.cameraFov,
      orbitPosX: body.cameraMode === "orbit" ? body.orbitPosX : null,
      orbitPosY: body.cameraMode === "orbit" ? body.orbitPosY : null,
      orbitPosZ: body.cameraMode === "orbit" ? body.orbitPosZ : null,
      orbitTargetX: body.cameraMode === "orbit" ? body.orbitTargetX : null,
      orbitTargetY: body.cameraMode === "orbit" ? body.orbitTargetY : null,
      orbitTargetZ: body.cameraMode === "orbit" ? body.orbitTargetZ : null,
      rotationX: body.cameraMode === "pov" ? body.rotationX : null,
      rotationY: body.cameraMode === "pov" ? body.rotationY : null,
      modelRotationY: body.modelRotationY,
    })
    .returning()
    .get();

  return { ok: true, id: row.id };
});

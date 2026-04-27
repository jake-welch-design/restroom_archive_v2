import { asc, eq } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)

  const restroom = await db
    .select({ id: schema.restrooms.id })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.slug, slug))
    .get()

  if (!restroom) throw createError({ statusCode: 404, statusMessage: 'Restroom not found' })

  const rows = await db
    .select({
      id: schema.annotations.id,
      restroomId: schema.annotations.restroomId,
      body: schema.annotations.body,
      pointX: schema.annotations.pointX,
      pointY: schema.annotations.pointY,
      pointZ: schema.annotations.pointZ,
      cameraMode: schema.annotations.cameraMode,
      cameraFov: schema.annotations.cameraFov,
      orbitPosX: schema.annotations.orbitPosX,
      orbitPosY: schema.annotations.orbitPosY,
      orbitPosZ: schema.annotations.orbitPosZ,
      orbitTargetX: schema.annotations.orbitTargetX,
      orbitTargetY: schema.annotations.orbitTargetY,
      orbitTargetZ: schema.annotations.orbitTargetZ,
      rotationX: schema.annotations.rotationX,
      rotationY: schema.annotations.rotationY,
      modelRotationY: schema.annotations.modelRotationY,
      createdAt: schema.annotations.createdAt,
      authorId: schema.users.id,
      authorEmail: schema.users.email,
      authorUsername: schema.users.username,
      authorDisplayName: schema.users.displayName,
    })
    .from(schema.annotations)
    .leftJoin(schema.users, eq(schema.annotations.authorId, schema.users.id))
    .where(eq(schema.annotations.restroomId, restroom.id))
    .orderBy(asc(schema.annotations.createdAt))
    .all()

  return rows.map(r => ({
    id: r.id,
    restroomId: r.restroomId,
    body: r.body,
    pointX: r.pointX,
    pointY: r.pointY,
    pointZ: r.pointZ,
    cameraMode: r.cameraMode,
    cameraFov: r.cameraFov,
    orbitPosX: r.orbitPosX,
    orbitPosY: r.orbitPosY,
    orbitPosZ: r.orbitPosZ,
    orbitTargetX: r.orbitTargetX,
    orbitTargetY: r.orbitTargetY,
    orbitTargetZ: r.orbitTargetZ,
    rotationX: r.rotationX,
    rotationY: r.rotationY,
    modelRotationY: r.modelRotationY,
    createdAt: r.createdAt,
    author: {
      id: r.authorId!,
      username: r.authorUsername!,
      displayName: r.authorDisplayName,
      email: r.authorEmail!,
    },
  }))
})

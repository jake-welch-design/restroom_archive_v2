import { integer, real, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  role: text('role').notNull().default('archivist'),
  approvedAt: text('approved_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  emailIdx: uniqueIndex('users_email_unique').on(t.email),
}))

export const restrooms = sqliteTable('restrooms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  date: text('date').notNull(),
  isoDate: text('iso_date').notNull(),
  coords: text('coords').notNull(),
  lat: real('lat'),
  lng: real('lng'),
  location: text('location').notNull(),
  file: text('file').notNull(),
  description: text('description'),
  descriptors: text('descriptors'),
  thumbKey: text('thumb_key'),
  status: text('status').notNull().default('published'),
  submittedBy: integer('submitted_by').references(() => users.id),
  removalRequestedBy: integer('removal_requested_by').references(() => users.id),
  removalReason: text('removal_reason'),
  attribution: text('attribution').notNull().default('Jake Welch'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  slugIdx: uniqueIndex('restrooms_slug_unique').on(t.slug),
  isoDateIdx: index('idx_restrooms_iso_date').on(t.isoDate),
  statusIdx: index('idx_restrooms_status').on(t.status),
}))

export const annotations = sqliteTable('annotations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  restroomId: integer('restroom_id').notNull().references(() => restrooms.id, { onDelete: 'cascade' }),
  authorId: integer('author_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  pointX: real('point_x').notNull(),
  pointY: real('point_y').notNull(),
  pointZ: real('point_z').notNull(),
  cameraMode: text('camera_mode').notNull(),
  cameraFov: real('camera_fov').notNull(),
  orbitPosX: real('orbit_pos_x'),
  orbitPosY: real('orbit_pos_y'),
  orbitPosZ: real('orbit_pos_z'),
  orbitTargetX: real('orbit_target_x'),
  orbitTargetY: real('orbit_target_y'),
  orbitTargetZ: real('orbit_target_z'),
  rotationX: real('rotation_x'),
  rotationY: real('rotation_y'),
  modelRotationY: real('model_rotation_y').default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  restroomIdx: index('idx_annotations_restroom').on(t.restroomId),
}))

export type User = typeof users.$inferSelect
export type Restroom = typeof restrooms.$inferSelect
export type Annotation = typeof annotations.$inferSelect

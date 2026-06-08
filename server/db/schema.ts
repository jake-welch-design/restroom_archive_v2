import { integer, real, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  role: text('role').notNull().default('archivist'),
  submissionRequestedAt: text('submission_requested_at'),
  approvedAt: text('approved_at'),
  mutedUntil: text('muted_until'),
  bannedAt: text('banned_at'),
  adminMessage: text('admin_message'),
  adminMessageAt: text('admin_message_at'),
  emailVerifiedAt: text('email_verified_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  emailIdx: uniqueIndex('users_email_unique').on(t.email),
  usernameIdx: uniqueIndex('users_username_unique').on(t.username),
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
  rejectionMessage: text('rejection_message'),
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
  hiddenAt: text('hidden_at'),
  hiddenBy: integer('hidden_by').references(() => users.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  restroomIdx: index('idx_annotations_restroom').on(t.restroomId),
}))

export const annotationReports = sqliteTable('annotation_reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  annotationId: integer('annotation_id').notNull().references(() => annotations.id, { onDelete: 'cascade' }),
  reporterId: integer('reporter_id').references(() => users.id),
  reason: text('reason'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  resolvedAt: text('resolved_at'),
  resolvedBy: integer('resolved_by').references(() => users.id),
}, (t) => ({
  uniquePerUser: uniqueIndex('annotation_reports_unique_per_user').on(t.annotationId, t.reporterId),
  openIdx: index('idx_annotation_reports_open').on(t.resolvedAt),
}))

export const emailVerificationTokens = sqliteTable('email_verification_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  usedAt: text('used_at'),
}, (t) => ({
  tokenHashIdx: index('idx_evt_token_hash').on(t.tokenHash),
  userIdIdx: index('idx_evt_user_id').on(t.userId),
}))

export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  usedAt: text('used_at'),
}, (t) => ({
  tokenHashIdx: index('idx_prt_token_hash').on(t.tokenHash),
  userIdIdx: index('idx_prt_user_id').on(t.userId),
}))

export const adminAuditLog = sqliteTable('admin_audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: integer('target_id'),
  metadata: text('metadata'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  createdAtIdx: index('idx_audit_log_created_at').on(t.createdAt),
  actorIdx: index('idx_audit_log_actor').on(t.actorId),
  targetIdx: index('idx_audit_log_target').on(t.targetType, t.targetId),
}))

export type User = typeof users.$inferSelect
export type Restroom = typeof restrooms.$inferSelect
export type Annotation = typeof annotations.$inferSelect
export type AnnotationReport = typeof annotationReports.$inferSelect

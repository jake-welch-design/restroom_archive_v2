import { aliasedTable, asc, eq, isNull } from 'drizzle-orm'
import { useDb, schema } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/requireRole'

export default defineEventHandler(async (event) => {
  requireRole(event, 'admin')

  const db = useDb(event)
  const reporter = aliasedTable(schema.users, 'reporter')
  const author = aliasedTable(schema.users, 'author')

  const rows = await db
    .select({
      reportId: schema.annotationReports.id,
      reportReason: schema.annotationReports.reason,
      reportCreatedAt: schema.annotationReports.createdAt,
      annotationId: schema.annotations.id,
      annotationBody: schema.annotations.body,
      annotationCreatedAt: schema.annotations.createdAt,
      annotationHiddenAt: schema.annotations.hiddenAt,
      restroomSlug: schema.restrooms.slug,
      restroomName: schema.restrooms.name,
      reporterUsername: reporter.username,
      reporterDisplayName: reporter.displayName,
      authorUsername: author.username,
      authorDisplayName: author.displayName,
    })
    .from(schema.annotationReports)
    .innerJoin(schema.annotations, eq(schema.annotationReports.annotationId, schema.annotations.id))
    .innerJoin(schema.restrooms, eq(schema.annotations.restroomId, schema.restrooms.id))
    .leftJoin(reporter, eq(schema.annotationReports.reporterId, reporter.id))
    .leftJoin(author, eq(schema.annotations.authorId, author.id))
    .where(isNull(schema.annotationReports.resolvedAt))
    .orderBy(asc(schema.annotationReports.createdAt))
    .all()

  return rows.map(r => ({
    reportId: r.reportId,
    reportReason: r.reportReason,
    reportCreatedAt: r.reportCreatedAt,
    annotation: {
      id: r.annotationId,
      body: r.annotationBody,
      createdAt: r.annotationCreatedAt,
      hiddenAt: r.annotationHiddenAt,
    },
    restroom: {
      slug: r.restroomSlug,
      name: r.restroomName,
    },
    reporter: r.reporterUsername
      ? { username: r.reporterUsername, displayName: r.reporterDisplayName }
      : null,
    author: r.authorUsername
      ? { username: r.authorUsername, displayName: r.authorDisplayName }
      : null,
  }))
})

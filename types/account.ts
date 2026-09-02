/**
 * Response shapes for the account page's endpoints.
 *
 * Kept here rather than inside the components that render them because the page
 * and its children read the same lists: the page counts them for its sub-tab
 * badges while the children display them.
 */

/** A public reference to a user, as returned beside content they created. */
export interface AdminUserRef {
  username: string;
  displayName: string | null;
}

/** The same, plus the email admin queues need in order to act on a request. */
export interface AdminUserContact extends AdminUserRef {
  email: string;
}

/* --- The signed-in user's own content ------------------------------------ */

/** GET /api/me/submissions */
export interface MySubmission {
  id: number;
  slug: string;
  name: string;
  location: string;
  date: string;
  isoDate: string;
  status: string;
  createdAt: string;
  removalRequested: boolean;
  rejectionMessage: string | null;
}

/** GET /api/me/annotations */
export interface MyAnnotation {
  id: number;
  body: string;
  createdAt: string;
  restroomSlug: string;
  restroomName: string;
  restroomLocation: string;
  restroomDate: string;
}

/* --- Admin queues -------------------------------------------------------- */

/** GET /api/admin/restrooms: submissions awaiting review. */
export interface PendingRestroom {
  id: number;
  slug: string;
  name: string;
  location: string;
  date: string;
  isoDate: string;
  lat: number | null;
  lng: number | null;
  description: string | null;
  descriptors: string[];
  modelUrl: string;
  createdAt: string;
  submitter: AdminUserContact | null;
}

/** GET /api/admin/users/pending: accounts requesting submission access. */
export interface PendingUser {
  id: number;
  email: string;
  username: string;
  displayName: string | null;
  createdAt: string;
  submissionRequestedAt: string | null;
}

/** GET /api/admin/restrooms/removals: submitters asking for a takedown. */
export interface RemovalRequest {
  id: number;
  slug: string;
  name: string;
  location: string;
  date: string;
  status: string;
  removalReason: string | null;
  requester: AdminUserContact | null;
}

/** GET /api/admin/annotations/reports: unresolved reports. */
export interface AnnotationReport {
  reportId: number;
  reportReason: string | null;
  reportCreatedAt: string;
  annotation: {
    id: number;
    body: string;
    createdAt: string;
    hiddenAt: string | null;
  };
  restroom: { slug: string; name: string };
  reporter: AdminUserRef | null;
  author: AdminUserRef | null;
}

/* --- Admin browse lists -------------------------------------------------- */

/** GET /api/admin/annotations: every annotation, reported or not. */
export interface AdminAnnotation {
  id: number;
  body: string;
  createdAt: string;
  hiddenAt: string | null;
  openReportCount: number;
  restroom: { slug: string; name: string; location: string; date: string };
  author: AdminUserRef | null;
}

/** GET /api/admin/users: every account, for moderation. */
export interface AccountRow {
  id: number;
  email: string;
  username: string;
  displayName: string | null;
  role: string;
  submissionRequestedAt: string | null;
  approvedAt: string | null;
  mutedUntil: string | null;
  bannedAt: string | null;
  adminMessage: string | null;
  adminMessageAt: string | null;
  createdAt: string;
  /** Submissions of any status attributed to the account. */
  submissionCount: number;
  /** Annotations written by the account, hidden ones included. */
  annotationCount: number;
}

/** GET /api/admin/users/:id/submissions: one account's submissions. */
export interface AccountSubmission {
  id: number;
  slug: string;
  name: string;
  location: string;
  date: string;
  status: string;
}

/** GET /api/admin/users/:id/annotations: one account's annotations. */
export interface AccountAnnotation {
  id: number;
  body: string;
  createdAt: string;
  hiddenAt: string | null;
  restroomSlug: string;
  restroomName: string;
}

/** GET /api/admin/audit-log: a record of one admin action. */
export interface AuditLogEntry {
  id: number;
  action: string;
  targetType: string;
  targetId: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: number; username: string; displayName: string | null } | null;
}

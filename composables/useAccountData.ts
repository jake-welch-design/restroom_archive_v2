import type {
  AccountRow,
  AdminAnnotation,
  AnnotationReport,
  AuditLogEntry,
  MyAnnotation,
  MySubmission,
  PendingRestroom,
  PendingUser,
  RemovalRequest,
} from "~/types/account";

/**
 * The account page's data sources.
 *
 * Every list here is read twice: the page counts it for a tab badge, and a
 * child component renders it. Each is therefore a keyed `useFetch`, which is
 * what makes those two callers share one request and one cache entry instead of
 * fetching the same list separately and drifting apart after a refresh.
 *
 * All of them share three options:
 *
 * - `server: false`, because none of this is public. Fetching during SSR would
 *   put a signed-in user's private data into a payload that route rules may
 *   allow to be cached.
 * - `immediate: false`, because at setup time the session has not resolved and
 *   the request would go out unauthenticated. The page starts each list once it
 *   knows who is looking.
 * - `default: () => []`, so consumers can read `.length` before the first
 *   response without guarding for null.
 */
function privateList<T>(key: string, url: string) {
  return useFetch<T[]>(url, {
    key,
    server: false,
    immediate: false,
    default: () => [],
  });
}

/* --- The signed-in user's own content ------------------------------------ */

export function useMySubmissions() {
  return privateList<MySubmission>("my-submissions", "/api/me/submissions");
}

export function useMyAnnotations() {
  return privateList<MyAnnotation>("my-annotations", "/api/me/annotations");
}

/* --- Admin queues -------------------------------------------------------- */
/* The four lists that carry an actionable badge on the Admin tab. */

export function useRestroomQueue() {
  return privateList<PendingRestroom>(
    "admin-restrooms",
    "/api/admin/restrooms",
  );
}

export function useUserQueue() {
  return privateList<PendingUser>(
    "admin-users-pending",
    "/api/admin/users/pending",
  );
}

export function useRemovalQueue() {
  return privateList<RemovalRequest>(
    "admin-removals",
    "/api/admin/restrooms/removals",
  );
}

export function useAnnotationReports() {
  return privateList<AnnotationReport>(
    "admin-reports",
    "/api/admin/annotations/reports",
  );
}

/* --- Admin browse lists -------------------------------------------------- */
/* Not queues: these have no backlog to clear, so they carry no badge and are
   fetched only when their section is first opened. */

export function useAdminAccounts() {
  return privateList<AccountRow>("admin-accounts", "/api/admin/users");
}

export function useAdminAnnotations() {
  return privateList<AdminAnnotation>(
    "admin-annotations",
    "/api/admin/annotations",
  );
}

export function useAdminAuditLog() {
  return privateList<AuditLogEntry>("admin-audit-log", "/api/admin/audit-log");
}

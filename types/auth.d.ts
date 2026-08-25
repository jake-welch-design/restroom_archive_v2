import type { SessionUser } from "~~/server/utils/sessionUser";

// Both declarations below point at the same interface rather than restating its
// fields. The projection in server/utils/sessionUser.ts is what actually
// populates them, so deriving the types from it is what stops the two drifting
// apart: an earlier hand-written copy here carried an emailVerifiedAt field
// that no query ever selected.

declare module "#auth-utils" {
  // The user as sealed into the session cookie.
  interface User extends SessionUser {}
}

declare module "h3" {
  interface H3EventContext {
    // Populated per request by server/middleware/auth.ts, which re-reads the
    // user from the database so a change of role or a ban takes effect on the
    // next request rather than on the next sign-in.
    user?: SessionUser;
  }
}

export {};

// Extends the nuxt-auth-utils session type with what's stored in the cookie
declare module "#auth-utils" {
  interface User {
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
    emailVerifiedAt: string | null;
  }
}

// Extends the H3 event context with the full user row (populated by server/middleware/auth.ts)
declare module "h3" {
  interface H3EventContext {
    user?: {
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
      emailVerifiedAt: string | null;
    };
  }
}

export {};

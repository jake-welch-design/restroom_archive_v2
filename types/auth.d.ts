// Extends the nuxt-auth-utils session type with what's stored in the cookie
declare module '#auth-utils' {
  interface User {
    id: number
    email: string
    displayName: string | null
    role: string
    approvedAt: string | null
  }
}

// Extends the H3 event context with the full user row (populated by server/middleware/auth.ts)
declare module 'h3' {
  interface H3EventContext {
    user?: {
      id: number
      email: string
      displayName: string | null
      role: string
      approvedAt: string | null
    }
  }
}

export {}

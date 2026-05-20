import 'express-session'

declare module 'express-session' {
  interface SessionData {
    user?: {
      sub: string
      name: string
      email: string | null
      picture: string | null
      role?: string
    }
    pendingUserId?: string
    idToken?: string
    oidc?: { state: string; nonce: string }
    pendingTotpSecret?: string
  }
}

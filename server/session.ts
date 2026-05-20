import { jwtDecrypt } from 'jose'
import { subtle } from 'crypto'
import type { IncomingMessage } from 'http'
import type { Session, Storage } from '@hono/session'

const TTL_MS   = 8 * 60 * 60 * 1000
const HKDF_INFO = new TextEncoder().encode('session jwe cek')

export interface OurSessionData extends Record<string, unknown> {
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

export type AppEnv = {
  Variables: {
    session: Session<OurSessionData>
    sessionStorage?: Storage<OurSessionData>
  }
}

// Shared in-memory store — used by both HTTP middleware and WebSocket
const _store = new Map<string, { data: OurSessionData; expires: number }>()

export const sessionStorage: Storage<OurSessionData> = {
  get:    (sid) => {
    const entry = _store.get(sid)
    if (!entry || entry.expires <= Date.now()) { _store.delete(sid); return null }
    return entry.data
  },
  set:    (sid, data) => { _store.set(sid, { data, expires: Date.now() + TTL_MS }) },
  delete: (sid) => { _store.delete(sid) },
}

setInterval(() => {
  const now = Date.now()
  for (const [id, s] of _store) if (s.expires <= now) _store.delete(id)
}, 60_000).unref()

// ── WebSocket session reader ──────────────────────────────────────────────────

const _keyCache = new Map<string, Uint8Array>()

async function getDerivedKey(secret: string): Promise<Uint8Array> {
  let key = _keyCache.get(secret)
  if (!key) {
    const ikm = new TextEncoder().encode(secret)
    const ck  = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
    key = new Uint8Array(await subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', info: HKDF_INFO, salt: new Uint8Array(0) },
      ck, 256,
    ))
    _keyCache.set(secret, key)
  }
  return key
}

export async function getSessionFromRequest(req: IncomingMessage, secret: string): Promise<OurSessionData | null> {
  const cookieHeader = req.headers['cookie'] ?? ''
  let token: string | undefined
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === 'sid') {
      try { token = decodeURIComponent(part.slice(eq + 1).trim()) } catch { /* malformed */ }
      break
    }
  }
  if (!token) return null
  try {
    const key = await getDerivedKey(secret)
    const { payload } = await jwtDecrypt(token, key)
    const sid = payload['sid'] as string | undefined
    if (!sid) return null
    return sessionStorage.get(sid)
  } catch {
    return null
  }
}

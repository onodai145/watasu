import { Hono } from 'hono'
import type { Context } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { logger as honoLogger } from 'hono/logger'
import { serveStatic } from '@hono/node-server/serve-static'
import { createAdaptorServer } from '@hono/node-server'
import { getConnInfo } from '@hono/node-server/conninfo'
import { useSession, useSessionStorage } from '@hono/session'
import { rateLimiter } from 'hono-rate-limiter'
import logger from './logger'
import { sessionStorage, type AppEnv, type OurSessionData } from './session'
import authRouter from './routes/auth'
import apiRouter from './routes/api'
import adminRouter from './routes/admin'

export const SESSION_SECRET = process.env.SESSION_SECRET ?? 'dev-secret-change-in-production'

const hono = new Hono<AppEnv>()

hono.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc:     ["'self'"],
    scriptSrc:      ["'self'", "'unsafe-inline'"],
    styleSrc:       ["'self'", "'unsafe-inline'"],
    imgSrc:         ["'self'", "data:", "https:"],
    connectSrc:     ["'self'", "wss:", "ws:"],
    fontSrc:        ["'self'"],
    objectSrc:      ["'none'"],
    frameAncestors: ["'none'"],
  },
  crossOriginEmbedderPolicy: false,
}))

const logMiddleware = honoLogger((message) => logger.info(message))
hono.use('*', async (c, next) => {
  if (/\.(css|js|ico|png|woff2?)(\?.*)?$/.test(c.req.path)) return next()
  return logMiddleware(c, next)
})

function getClientIp(c: Context): string {
  try { return getConnInfo(c).remote.address ?? '' }
  catch { return c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? '' }
}

const authLimiter = rateLimiter({
  windowMs:        15 * 60 * 1000,
  limit:           20,
  standardHeaders: 'draft-6',
  keyGenerator:    (c) => getClientIp(c),
  skip:            () => process.env.NODE_ENV === 'test',
})
hono.use('/auth/local/login', authLimiter)
hono.use('/auth/totp/verify', authLimiter)
hono.use('/setup',            authLimiter)

hono.use('*', useSessionStorage(sessionStorage))
hono.use('*', useSession<OurSessionData>({
  secret:   SESSION_SECRET,
  duration: { absolute: 8 * 60 * 60 },
}))

hono.route('/', adminRouter)
hono.route('/', authRouter)
hono.route('/', apiRouter)

hono.use('*', serveStatic({ root: './public' }))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const app = createAdaptorServer({ fetch: (req, env) => hono.fetch(req, env) }) as any as import('http').Server

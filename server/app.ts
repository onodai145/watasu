import './session.d'
import express, { RequestHandler } from 'express'
import session from 'express-session'
import pinoHttp from 'pino-http'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import logger from './logger'
import authRouter from './routes/auth'
import apiRouter from './routes/api'
import adminRouter from './routes/admin'

const SESSION_SECRET = process.env.SESSION_SECRET ?? 'dev-secret-change-in-production'

export const sessionParser = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
  },
}) as RequestHandler

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
})

export const app = express()

function parseTrustProxy(val: string | undefined): boolean | number | string | string[] {
  if (val === undefined || val === '0' || val === 'false') return false
  const n = Number(val)
  if (!isNaN(n)) return n
  const parts = val.split(',').map(s => s.trim()).filter(Boolean)
  return parts.length === 1 ? parts[0] : parts
}
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY))

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'"],
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", "data:", "https:"],
      connectSrc:     ["'self'", "wss:", "ws:"],
      fontSrc:        ["'self'"],
      objectSrc:      ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}))

app.use(sessionParser)
app.use(pinoHttp({
  logger,
  autoLogging: { ignore: (req) => /\.(css|js|ico|png|woff2?)(\?.*)?$/.test(req.url ?? '') },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  customProps: (req) => ({
    ...((req as express.Request).session?.user?.name && { user: (req as express.Request).session.user!.name }),
  }),
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use('/auth/local/login', authLimiter)
app.use('/auth/totp/verify', authLimiter)
app.use('/setup',            authLimiter)
app.use(adminRouter)
app.use(authRouter)
app.use(express.static(path.join(__dirname, '../public')))
app.use(apiRouter)

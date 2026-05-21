import path from 'path'
import { readFileSync } from 'fs'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { Prisma } from '@prisma/client'
import logger from '../logger'
import * as users from '../users'
import oidc from '../oidc'
import type { AppEnv } from '../session'

const SPA_PAGE = path.join(__dirname, '../../public/spa/index.html')
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

function sendSpa(c: Context<AppEnv>): Response {
  try {
    return c.html(readFileSync(SPA_PAGE, 'utf8'))
  } catch {
    return c.text('Frontend not built. Run pnpm build:ui', 503)
  }
}

const router = new Hono<AppEnv>()

router.get('/auth/login', async (c) => {
  if (!oidc.client) return c.text('OIDC not configured', 503)
  const state = oidc.generators.state()
  const nonce = oidc.generators.nonce()
  await c.var.session.update({ oidc: { state, nonce } })
  return c.redirect(oidc.client.authorizationUrl({ scope: 'openid email profile', state, nonce }))
})

router.get('/auth/callback', async (c) => {
  if (!oidc.client) return c.text('OIDC not configured', 503)
  try {
    const data   = await c.var.session.get()
    const { state, nonce } = data?.oidc ?? {}
    if (!state) return c.redirect('/login?auth_error=1')
    const params   = oidc.client.callbackParams(c.req.url)
    const tokenSet = await oidc.client.callback(`${BASE_URL}/auth/callback`, params, { state, nonce })
    const claims   = tokenSet.claims()
    const name     = (claims['name'] ?? claims['preferred_username'] ?? claims.email ?? claims.sub) as string
    const dbUser   = await users.findOrCreateOidcUser({ sub: claims.sub, name, email: claims.email ?? null })
    if (!dbUser.enabled) {
      logger.warn({ sub: claims.sub }, 'auth: oidc user disabled')
      return c.redirect('/login?auth_error=1')
    }
    await c.var.session.update({
      user: {
        sub:     `oidc:${dbUser.id}`,
        name:    dbUser.display_name,
        email:   dbUser.email,
        picture: (claims['picture'] ?? null) as string | null,
        role:    dbUser.role,
      },
      idToken: tokenSet.id_token,
    })
    logger.info({ sub: claims.sub, email: claims.email, role: dbUser.role }, 'auth: oidc login')
    return c.redirect('/')
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'auth: oidc callback failed')
    return c.redirect('/login?auth_error=1')
  }
})

router.get('/auth/logout', async (c) => {
  const data = await c.var.session.get()
  logger.info({ user: data?.user?.name }, 'auth: logout')
  c.var.session.delete()
  return c.redirect('/')
})

router.get('/login',    (c) => sendSpa(c))

router.get('/register', (c) => {
  if (process.env.ALLOW_REGISTRATION !== 'true') return c.redirect('/login')
  return sendSpa(c)
})

router.get('/settings', async (c) => {
  const data = await c.var.session.get()
  if (!data?.user) return c.redirect('/login')
  return sendSpa(c)
})

router.post('/auth/local/login', async (c) => {
  const body     = await c.req.parseBody()
  const username = body['username'] as string | undefined
  const password = body['password'] as string | undefined
  if (!username || !password) return c.redirect('/login?error=1')
  const user = await users.verifyPassword(username, password)
  if (!user) {
    logger.warn({ username, ip: c.req.header('x-forwarded-for') }, 'auth: login failed')
    return c.redirect('/login?error=1')
  }
  if (user.totp_enabled) {
    await c.var.session.update({ pendingUserId: user.id })
    logger.info({ username: user.username }, 'auth: totp required')
    return c.redirect('/login/totp')
  }
  await c.var.session.update({
    user: { sub: `local:${user.id}`, name: user.display_name, email: user.email, picture: null, role: user.role },
  })
  logger.info({ username: user.username }, 'auth: login')
  return c.redirect('/')
})

router.get('/login/totp', async (c) => {
  const data = await c.var.session.get()
  if (!data?.pendingUserId) return c.redirect('/login')
  return sendSpa(c)
})

router.post('/auth/register', async (c) => {
  if (process.env.ALLOW_REGISTRATION !== 'true') return c.json({ error: '登録は無効です' }, 403)
  const body = await c.req.json<{ username?: string; email?: string; password?: string }>()
  const { username, email, password } = body
  if (!username || !email || !password)
    return c.json({ error: 'すべての項目を入力してください' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return c.json({ error: 'メールアドレスの形式が正しくありません' }, 400)
  const allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS?.split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
  if (allowedDomains?.length) {
    const domain = email.split('@')[1].toLowerCase()
    if (!allowedDomains.includes(domain))
      return c.json({ error: `登録できないドメインです（許可: ${allowedDomains.join(', ')}）` }, 400)
  }
  if (password.length < 6)
    return c.json({ error: 'パスワードは6文字以上にしてください' }, 400)
  try {
    const user = await users.createUser({ username, email, password, role: 'user' })
    await c.var.session.update({
      user: { sub: `local:${user.id}`, name: user.display_name, email: user.email, picture: null, role: user.role },
    })
    logger.info({ username: user.username }, 'auth: registered')
    return c.json({ ok: true })
  } catch (err) {
    const isDuplicate = (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
      || (err instanceof Error && (err.message.includes('UNIQUE') || (err as { code?: string }).code === '23505'))
    if (isDuplicate) return c.json({ error: 'このユーザー名は既に使われています' }, 409)
    logger.error({ err }, 'auth: register failed')
    return c.json({ error: 'サーバーエラーが発生しました' }, 500)
  }
})

router.get('/auth/totp/cancel', (c) => {
  c.var.session.delete()
  return c.redirect('/login')
})

router.post('/auth/totp/verify', async (c) => {
  const data      = await c.var.session.get()
  const pendingId = data?.pendingUserId as string | undefined
  if (!pendingId) return c.redirect('/login')
  const body  = await c.req.parseBody()
  const token = body['token'] as string | undefined
  const ok    = await users.verifyTotpToken(pendingId, token ?? '')
  if (!ok) {
    logger.warn({ userId: pendingId }, 'auth: totp failed')
    return c.redirect('/login/totp?error=1')
  }
  const user = await users.findById(pendingId)
  if (!user || !user.enabled) return c.redirect('/login')
  await c.var.session.update({
    user: { sub: `local:${user.id}`, name: user.display_name, email: user.email, picture: null, role: user.role },
  })
  logger.info({ username: user.username }, 'auth: totp verified')
  return c.redirect('/')
})

export default router

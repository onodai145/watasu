import path from 'path'
import { readFileSync } from 'fs'
import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { Prisma } from '@prisma/client'
import logger from '../logger'
import * as users from '../users'
import { prisma } from '../prisma'
import oidc from '../oidc'
import { UserError } from '../errors'
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

async function noUsersExist(): Promise<boolean> {
  return (await prisma.user.count()) === 0
}

async function requireSetup(c: Context<AppEnv>, next: Next): Promise<void | Response> {
  if (process.env.NODE_ENV !== 'production' || await noUsersExist()) return next()
  return c.redirect('/')
}

async function requireAdmin(c: Context<AppEnv>, next: Next): Promise<void | Response> {
  const data = await c.var.session.get()
  if (data?.user?.role === 'admin') return next()
  if (c.req.path.startsWith('/admin/api/')) return c.json({ error: 'Forbidden' }, 403)
  return c.redirect(data?.user ? '/' : '/login')
}

const router = new Hono<AppEnv>()

router.get('/setup', requireSetup, (c) => sendSpa(c))

router.post('/setup', requireSetup, async (c) => {
  const body        = await c.req.parseBody()
  const username    = body['username']    as string | undefined
  const displayName = body['displayName'] as string | undefined
  const password    = body['password']    as string | undefined
  if (!username || !password) return c.redirect('/setup?error=missing')
  try {
    const user = await users.createUser({ username, displayName, password, role: 'admin' })
    await c.var.session.update({
      user: { sub: `local:${user.id}`, name: user.display_name, email: user.email, picture: null, role: user.role },
    })
    logger.info({ username: user.username }, 'setup: first admin created')
    return c.redirect('/admin/users')
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'setup: failed')
    return c.redirect('/setup?error=failed')
  }
})

router.get('/admin/users',  requireAdmin, (c) => sendSpa(c))
router.get('/admin/server', requireAdmin, (c) => sendSpa(c))

router.get('/admin/api/me', requireAdmin, async (c) => {
  const data = await c.var.session.get()
  return c.json({ sub: data?.user?.sub ?? null })
})

router.get('/admin/api/server', requireAdmin, (c) =>
  c.json({
    db:          process.env.DB_CLIENT ?? 'better-sqlite3',
    dbPath:      (!process.env.DB_CLIENT || process.env.DB_CLIENT === 'better-sqlite3')
                   ? (process.env.DB_PATH ?? './data/app.db') : null,
    oidc:        oidc.client ? { issuer: process.env.OIDC_ISSUER } : null,
    baseUrl:     BASE_URL,
    nodeVersion: process.version,
    uptime:      Math.floor(process.uptime()),
  })
)

router.get('/admin/api/users', requireAdmin, async (c) =>
  c.json(await users.listUsers())
)

router.post('/admin/api/users', requireAdmin, async (c) => {
  const body = await c.req.json<{ username?: string; displayName?: string; email?: string; password?: string; role?: string }>()
  const { username, displayName, email, password, role } = body
  if (!username || !password)
    return c.json({ error: 'username と password は必須です' }, 400)
  try {
    const data = await c.var.session.get()
    const user = await users.createUser({ username, displayName, email, password, role })
    logger.info({ username: user.username, role: user.role, by: data?.user?.name }, 'admin: user created')
    return c.json(user, 201)
  } catch (err) {
    const isDuplicate = (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
      || (err instanceof Error && (err.message.includes('UNIQUE') || (err as { code?: string }).code === '23505'))
    if (isDuplicate) return c.json({ error: 'ユーザー名が既に存在します' }, 409)
    if (err instanceof UserError) return c.json({ error: err.message }, 400)
    logger.error({ err }, 'admin: user create failed')
    return c.json({ error: 'サーバーエラーが発生しました' }, 500)
  }
})

router.patch('/admin/api/users/:id', requireAdmin, async (c) => {
  const id   = String(c.req.param('id'))
  const body = await c.req.json<Record<string, unknown>>()
  const data = await c.var.session.get()
  if (body['role'] !== undefined && data?.user?.sub === `local:${id}`) {
    return c.json({ error: '自分自身のロールは変更できません' }, 400)
  }
  try {
    const user = await users.updateUser(id, body as Parameters<typeof users.updateUser>[1])
    if (!user) return c.json({ error: 'Not found' }, 404)
    logger.info({ userId: id, changes: Object.keys(body), by: data?.user?.name }, 'admin: user updated')
    return c.json(user)
  } catch (err) {
    if (err instanceof UserError) return c.json({ error: err.message }, 400)
    logger.error({ err }, 'admin: user update failed')
    return c.json({ error: 'サーバーエラーが発生しました' }, 500)
  }
})

router.delete('/admin/api/users/:id', requireAdmin, async (c) => {
  const id   = String(c.req.param('id'))
  const data = await c.var.session.get()
  if (data?.user?.sub === `local:${id}`)
    return c.json({ error: '自分自身は削除できません' }, 400)
  const deleted = await users.deleteUser(id)
  if (!deleted) return c.json({ error: 'Not found' }, 404)
  logger.info({ userId: id, by: data?.user?.name }, 'admin: user deleted')
  return c.json({ ok: true })
})

export default router

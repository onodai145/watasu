import express, { Request, Response, NextFunction } from 'express'
import path from 'path'
import { Prisma } from '@prisma/client'
import logger from '../logger'
import * as users from '../users'
import { prisma } from '../prisma'
import oidc from '../oidc'

const SPA_PAGE = path.join(__dirname, '../../public/spa/index.html')
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const router   = express.Router()

async function noUsersExist(): Promise<boolean> {
  return (await prisma.user.count()) === 0
}

async function requireSetup(_req: Request, res: Response, next: NextFunction): Promise<void> {
  if (process.env.NODE_ENV !== 'production' || await noUsersExist()) return next()
  res.redirect('/')
}

router.get('/setup', requireSetup, (_req, res) => res.sendFile(SPA_PAGE))

router.post('/setup', requireSetup, async (req, res) => {
  const { username, displayName, password } = req.body as {
    username?: string; displayName?: string; password?: string
  }
  if (!username || !password) return void res.redirect('/setup?error=missing')
  try {
    const user = await users.createUser({ username, displayName, password, role: 'admin' })
    req.session.user = { sub: `local:${user.id}`, name: user.display_name, email: user.email, picture: null, role: user.role }
    logger.info({ username: user.username }, 'setup: first admin created')
    res.redirect('/admin/users')
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'setup: failed')
    res.redirect('/setup?error=failed')
  }
})

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session.user?.role === 'admin') return next()
  if (req.path.startsWith('/admin/api/')) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  res.redirect(req.session.user ? '/' : '/login')
}

router.get('/admin/users', requireAdmin, (_req, res) => res.sendFile(SPA_PAGE))
router.get('/admin/server', requireAdmin, (_req, res) => res.sendFile(SPA_PAGE))

router.get('/admin/api/me', requireAdmin, (req, res) =>
  res.json({ sub: req.session.user?.sub ?? null })
)

router.get('/admin/api/server', requireAdmin, (_req, res) =>
  res.json({
    db:          process.env.DB_CLIENT ?? 'better-sqlite3',
    dbPath:      (!process.env.DB_CLIENT || process.env.DB_CLIENT === 'better-sqlite3')
                   ? (process.env.DB_PATH ?? './data/app.db') : null,
    oidc:        oidc.client ? { issuer: process.env.OIDC_ISSUER } : null,
    baseUrl:     BASE_URL,
    nodeVersion: process.version,
    uptime:      Math.floor(process.uptime()),
  })
)

router.get('/admin/api/users', requireAdmin, async (_req, res) =>
  res.json(await users.listUsers())
)

router.post('/admin/api/users', requireAdmin, async (req, res) => {
  const { username, displayName, email, password, role } = req.body as {
    username?: string; displayName?: string; email?: string; password?: string; role?: string
  }
  if (!username || !password)
    return void res.status(400).json({ error: 'username と password は必須です' })
  try {
    const user = await users.createUser({ username, displayName, email, password, role })
    logger.info({ username: user.username, role: user.role, by: req.session.user!.name }, 'admin: user created')
    res.status(201).json(user)
  } catch (err) {
    const msg = (err as Error).message
    const isDuplicate = (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
      || msg.includes('UNIQUE') || (err as { code?: string }).code === '23505'
    res.status(isDuplicate ? 409 : 500).json({ error: isDuplicate ? 'ユーザー名が既に存在します' : msg })
  }
})

router.patch('/admin/api/users/:id', requireAdmin, async (req, res) => {
  const id = String(req.params['id'])
  if (req.body.role !== undefined && req.session.user?.sub === `local:${id}`) {
    return void res.status(400).json({ error: '自分自身のロールは変更できません' })
  }
  try {
    const user = await users.updateUser(id, req.body)
    if (!user) return void res.status(404).json({ error: 'Not found' })
    logger.info({ userId: id, changes: Object.keys(req.body), by: req.session.user!.name }, 'admin: user updated')
    res.json(user)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/admin/api/users/:id', requireAdmin, async (req, res) => {
  const id = String(req.params['id'])
  if (req.session.user?.sub === `local:${id}`)
    return void res.status(400).json({ error: '自分自身は削除できません' })
  const deleted = await users.deleteUser(id)
  if (!deleted) return void res.status(404).json({ error: 'Not found' })
  logger.info({ userId: id, by: req.session.user!.name }, 'admin: user deleted')
  res.json({ ok: true })
})

export default router

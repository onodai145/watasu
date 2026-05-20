import { Hono } from 'hono'
import QRCode from 'qrcode'
import logger from '../logger'
import * as users from '../users'
import oidc from '../oidc'
import { UserError } from '../errors'
import type { AppEnv, OurSessionData } from '../session'

const router = new Hono<AppEnv>()

router.get('/health', (c) => c.json({ status: 'ok' }))

router.get('/api/ice-servers', (c) => {
  type IceServer = { urls: string; username?: string; credential?: string }
  const servers: IceServer[] = []
  const stunUrls = process.env.STUN_URLS
    ? process.env.STUN_URLS.split(',').map(s => s.trim()).filter(Boolean)
    : ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']
  stunUrls.forEach(urls => servers.push({ urls }))
  if (process.env.TURN_URL) {
    const turn: IceServer = { urls: process.env.TURN_URL.trim() }
    if (process.env.TURN_USERNAME)   turn.username   = process.env.TURN_USERNAME
    if (process.env.TURN_CREDENTIAL) turn.credential = process.env.TURN_CREDENTIAL
    servers.push(turn)
  }
  return c.json(servers)
})

router.get('/api/me', async (c) => {
  const data = await c.var.session.get()
  if (!data?.user) {
    return c.json({ authenticated: false, oidcAvailable: !!oidc.client })
  }
  const user = { ...data.user } as Record<string, unknown>
  if ((user['sub'] as string)?.startsWith('local:')) {
    const row = await users.findById((user['sub'] as string).slice('local:'.length))
    user['totpEnabled'] = !!row?.totp_enabled
  }
  return c.json({ authenticated: true, user })
})

router.patch('/api/me', async (c) => {
  const data = await c.var.session.get()
  if (!data?.user) return c.json({ error: 'Unauthorized' }, 401)
  const { sub } = data.user
  if (!sub?.startsWith('local:')) {
    return c.json({ error: 'OIDC ユーザーのプロフィールは変更できません' }, 400)
  }
  const userId = sub.slice('local:'.length)
  const body   = await c.req.json<{ displayName?: string; currentPassword?: string; newPassword?: string }>()
  const { displayName, currentPassword, newPassword } = body
  try {
    if (newPassword !== undefined) {
      if (!currentPassword) return c.json({ error: '現在のパスワードを入力してください' }, 400)
      if (newPassword.length < 6) return c.json({ error: 'パスワードは6文字以上にしてください' }, 400)
      await users.changePassword(userId, currentPassword, newPassword)
    }
    if (displayName !== undefined) {
      const updated = await users.updateUser(userId, { displayName })
      await c.var.session.update(prev => ({ ...prev, user: { ...prev?.user!, name: updated!.display_name } }))
    }
    return c.json({ ok: true, name: c.var.session.data?.user?.name })
  } catch (err) {
    if (err instanceof UserError) return c.json({ error: err.message }, 400)
    logger.error({ err }, 'patch /api/me failed')
    return c.json({ error: 'サーバーエラーが発生しました' }, 500)
  }
})

router.post('/api/me/totp/setup', async (c) => {
  const data = await c.var.session.get()
  if (!data?.user?.sub?.startsWith('local:')) return c.json({ error: 'Unauthorized' }, 401)
  const secret     = users.generateTotpSecret()
  const account    = encodeURIComponent(data.user.email ?? data.user.name ?? 'user')
  const otpauthUrl = `otpauth://totp/Watasu:${account}?secret=${secret}&issuer=Watasu`
  const qrDataUri  = await QRCode.toDataURL(otpauthUrl, { width: 200, margin: 1 })
  await c.var.session.update(prev => ({ ...prev, pendingTotpSecret: secret }))
  return c.json({ secret, qrDataUri })
})

router.post('/api/me/totp/enable', async (c) => {
  const data = await c.var.session.get()
  if (!data?.user?.sub?.startsWith('local:')) return c.json({ error: 'Unauthorized' }, 401)
  const secret = data.pendingTotpSecret as string | undefined
  if (!secret) return c.json({ error: 'セットアップを先に実行してください' }, 400)
  const userId = data.user.sub.slice('local:'.length)
  try {
    const body = await c.req.json<{ token?: string }>()
    await users.enableTotp(userId, secret, body.token ?? '')
    await c.var.session.update(prev => {
      const { pendingTotpSecret: _, ...rest } = prev ?? {}
      return rest as OurSessionData
    })
    logger.info({ user: data.user!.name }, 'totp: enabled')
    return c.json({ ok: true })
  } catch (err) {
    if (err instanceof UserError) return c.json({ error: err.message }, 400)
    logger.error({ err }, 'totp enable failed')
    return c.json({ error: 'サーバーエラーが発生しました' }, 500)
  }
})

router.post('/api/me/totp/disable', async (c) => {
  const data = await c.var.session.get()
  if (!data?.user?.sub?.startsWith('local:')) return c.json({ error: 'Unauthorized' }, 401)
  const userId = data.user.sub.slice('local:'.length)
  try {
    const body = await c.req.json<{ token?: string }>()
    await users.disableTotp(userId, body.token ?? '')
    logger.info({ user: data.user!.name }, 'totp: disabled')
    return c.json({ ok: true })
  } catch (err) {
    if (err instanceof UserError) return c.json({ error: err.message }, 400)
    logger.error({ err }, 'totp disable failed')
    return c.json({ error: 'サーバーエラーが発生しました' }, 500)
  }
})

export default router

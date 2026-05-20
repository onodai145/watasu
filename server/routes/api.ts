import express from 'express'
import QRCode from 'qrcode'
import logger from '../logger'
import * as users from '../users'
import oidc from '../oidc'

const router = express.Router()

router.get('/health', (_req, res) => res.json({ status: 'ok' }))

router.get('/api/ice-servers', (_req, res) => {
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
  res.json(servers)
})

router.get('/api/me', async (req, res) => {
  if (!req.session.user) {
    return void res.json({ authenticated: false, oidcAvailable: !!oidc.client })
  }
  const user = { ...req.session.user } as Record<string, unknown>
  if ((user['sub'] as string)?.startsWith('local:')) {
    const row = await users.findById((user['sub'] as string).slice('local:'.length))
    user['totpEnabled'] = !!row?.totp_enabled
  }
  res.json({ authenticated: true, user })
})

router.patch('/api/me', async (req, res) => {
  if (!req.session.user) return void res.status(401).json({ error: 'Unauthorized' })
  const { sub } = req.session.user
  if (!sub?.startsWith('local:')) {
    return void res.status(400).json({ error: 'OIDC ユーザーのプロフィールは変更できません' })
  }
  const userId = sub.slice('local:'.length)
  const { displayName, currentPassword, newPassword } = req.body as {
    displayName?: string
    currentPassword?: string
    newPassword?: string
  }
  try {
    if (newPassword !== undefined) {
      if (!currentPassword) return void res.status(400).json({ error: '現在のパスワードを入力してください' })
      if (newPassword.length < 6) return void res.status(400).json({ error: 'パスワードは6文字以上にしてください' })
      await users.changePassword(userId, currentPassword, newPassword)
    }
    if (displayName !== undefined) {
      const updated = await users.updateUser(userId, { displayName })
      req.session.user!.name = updated!.display_name
    }
    res.json({ ok: true, name: req.session.user!.name })
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.post('/api/me/totp/setup', async (req, res) => {
  if (!req.session.user?.sub?.startsWith('local:')) return void res.status(401).json({ error: 'Unauthorized' })
  const secret = users.generateTotpSecret()
  const account = encodeURIComponent(req.session.user.email ?? req.session.user.name ?? 'user')
  const otpauthUrl = `otpauth://totp/Watasu:${account}?secret=${secret}&issuer=Watasu`
  const qrDataUri = await QRCode.toDataURL(otpauthUrl, { width: 200, margin: 1 })
  req.session.pendingTotpSecret = secret
  res.json({ secret, qrDataUri })
})

router.post('/api/me/totp/enable', async (req, res) => {
  if (!req.session.user?.sub?.startsWith('local:')) return void res.status(401).json({ error: 'Unauthorized' })
  const secret = req.session.pendingTotpSecret
  if (!secret) return void res.status(400).json({ error: 'セットアップを先に実行してください' })
  const userId = req.session.user.sub.slice('local:'.length)
  try {
    await users.enableTotp(userId, secret, (req.body as { token?: string }).token ?? '')
    delete req.session.pendingTotpSecret
    logger.info({ user: req.session.user.name }, 'totp: enabled')
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.post('/api/me/totp/disable', async (req, res) => {
  if (!req.session.user?.sub?.startsWith('local:')) return void res.status(401).json({ error: 'Unauthorized' })
  const userId = req.session.user.sub.slice('local:'.length)
  try {
    await users.disableTotp(userId, (req.body as { token?: string }).token ?? '')
    logger.info({ user: req.session.user.name }, 'totp: disabled')
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

export default router

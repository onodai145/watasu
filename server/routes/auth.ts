import express from 'express'
import path from 'path'
import logger from '../logger'
import * as users from '../users'
import oidc from '../oidc'

const SPA_PAGE = path.join(__dirname, '../../public/spa/index.html')
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const router   = express.Router()

router.get('/auth/login', (req, res) => {
  if (!oidc.client) return void res.status(503).send('OIDC not configured')
  const state = oidc.generators.state()
  const nonce = oidc.generators.nonce()
  req.session.oidc = { state, nonce }
  res.redirect(oidc.client.authorizationUrl({ scope: 'openid email profile', state, nonce }))
})

router.get('/auth/callback', async (req, res) => {
  if (!oidc.client) return void res.status(503).send('OIDC not configured')
  try {
    const { state, nonce } = req.session.oidc ?? {}
    const params   = oidc.client.callbackParams(req)
    const tokenSet = await oidc.client.callback(`${BASE_URL}/auth/callback`, params, { state, nonce })
    const claims   = tokenSet.claims()
    const userData = {
      sub:     claims.sub,
      name:    (claims['name'] ?? claims['preferred_username'] ?? claims.email ?? claims.sub) as string,
      email:   claims.email ?? null,
      picture: (claims['picture'] ?? null) as string | null,
    }
    const idToken = tokenSet.id_token
    req.session.regenerate((err) => {
      if (err) return res.redirect('/login?auth_error=1')
      req.session.user    = userData
      req.session.idToken = idToken
      logger.info({ sub: claims.sub, email: claims.email }, 'auth: oidc login')
      res.redirect('/')
    })
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'auth: oidc callback failed')
    res.redirect('/login?auth_error=1')
  }
})

router.get('/auth/logout', (req, res) => {
  const idToken = req.session.idToken
  logger.info({ user: req.session.user?.name }, 'auth: logout')
  req.session.destroy(() => {
    if (oidc.client?.issuer.end_session_endpoint && idToken) {
      return res.redirect(oidc.client.endSessionUrl({ post_logout_redirect_uri: BASE_URL, id_token_hint: idToken }))
    }
    res.redirect('/')
  })
})

router.get('/login', (_req, res) => res.sendFile(SPA_PAGE))

router.get('/settings', (req, res) => {
  if (!req.session.user) return void res.redirect('/login')
  res.sendFile(SPA_PAGE)
})

router.post('/auth/local/login', async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string }
  if (!username || !password) return void res.redirect('/login?error=1')
  const user = await users.verifyPassword(username, password)
  if (!user) {
    logger.warn({ username, ip: req.ip }, 'auth: login failed')
    return void res.redirect('/login?error=1')
  }
  if (user.totp_enabled) {
    req.session.regenerate((err) => {
      if (err) return res.redirect('/login?error=1')
      req.session.pendingUserId = user.id
      logger.info({ username: user.username }, 'auth: totp required')
      res.redirect('/login/totp')
    })
    return
  }
  req.session.regenerate((err) => {
    if (err) return res.redirect('/login?error=1')
    req.session.user = { sub: `local:${user.id}`, name: user.display_name, email: user.email, picture: null, role: user.role }
    logger.info({ username: user.username, ip: req.ip }, 'auth: login')
    res.redirect('/')
  })
})

router.get('/login/totp', (req, res) => {
  if (!req.session.pendingUserId) return void res.redirect('/login')
  res.sendFile(SPA_PAGE)
})

router.get('/auth/totp/cancel', (req, res) => {
  delete req.session.pendingUserId
  res.redirect('/login')
})

router.post('/auth/totp/verify', async (req, res) => {
  const pendingId = req.session.pendingUserId
  if (!pendingId) return void res.redirect('/login')
  const ok = await users.verifyTotpToken(pendingId, (req.body as { token?: string }).token ?? '')
  if (!ok) {
    logger.warn({ userId: pendingId, ip: req.ip }, 'auth: totp failed')
    return void res.redirect('/login/totp?error=1')
  }
  const user = await users.findById(pendingId)
  if (!user) return void res.redirect('/login')
  req.session.regenerate((err) => {
    if (err) return res.redirect('/login?error=1')
    req.session.user = { sub: `local:${user.id}`, name: user.display_name, email: user.email, picture: null, role: user.role }
    logger.info({ username: user.username, ip: req.ip }, 'auth: totp verified')
    res.redirect('/')
  })
})

export default router

import { Issuer, generators, Client } from 'openid-client'
import logger from './logger'

let _client: Client | null = null

async function setup(baseUrl: string): Promise<void> {
  const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET } = process.env
  if (!OIDC_ISSUER || !OIDC_CLIENT_ID || !OIDC_CLIENT_SECRET) {
    logger.warn('OIDC not configured — set OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET')
    return
  }
  const issuer = await Issuer.discover(OIDC_ISSUER)
  _client = new issuer.Client({
    client_id:      OIDC_CLIENT_ID,
    client_secret:  OIDC_CLIENT_SECRET,
    redirect_uris:  [`${baseUrl}/auth/callback`],
    response_types: ['code'],
  })
  logger.info({ issuer: OIDC_ISSUER }, 'OIDC ready')
}

export default {
  setup,
  generators,
  get client() { return _client },
}

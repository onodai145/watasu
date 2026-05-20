import 'dotenv/config'
import logger from './logger'
import oidc from './oidc'
import { app, SESSION_SECRET } from './app'
import { setupWS } from './ws'

const PORT     = Number(process.env.PORT) || 3000
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`

setupWS(app, SESSION_SECRET)

;(async () => {
  await oidc.setup(BASE_URL)
  app.listen(PORT, () => logger.info({ port: PORT, url: BASE_URL }, 'server started'))
})()

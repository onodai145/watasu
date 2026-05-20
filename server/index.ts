import 'dotenv/config'
import http from 'http'
import logger from './logger'
import oidc from './oidc'
import { app, sessionParser } from './app'
import { setupWS } from './ws'

const PORT     = Number(process.env.PORT) || 3000
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`

const server = http.createServer(app)
setupWS(server, sessionParser)

;(async () => {
  await oidc.setup(BASE_URL)
  server.listen(PORT, () => logger.info({ port: PORT, url: BASE_URL }, 'server started'))
})()

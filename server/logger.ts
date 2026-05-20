import pino from 'pino'
import path from 'path'
import fs from 'fs'

const level = process.env.LOG_LEVEL ?? 'info'

function createLogger(): pino.Logger {
  if (level === 'silent') return pino({ level: 'silent' })

  const usePretty = process.env.LOG_PRETTY !== '0' && process.env.NODE_ENV !== 'production'

  const targets: pino.TransportTargetOptions[] = [
    usePretty
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:yyyy-mm-dd HH:MM:ss', ignore: 'pid,hostname', messageFormat: '{msg}' },
          level,
        }
      : { target: 'pino/file', options: { destination: 1 }, level },
  ]

  if (process.env.LOG_FILE) {
    fs.mkdirSync(path.dirname(path.resolve(process.env.LOG_FILE)), { recursive: true })
    targets.push({ target: 'pino/file', options: { destination: process.env.LOG_FILE, append: true }, level })
  }

  return pino({ level }, pino.transport({ targets }))
}

export default createLogger()

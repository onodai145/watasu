import { PrismaClient } from '@prisma/client'

// DATABASE_URL 未設定なら SQLite をデフォルトとして使用
process.env.DATABASE_URL ??= 'file:../data/app.db'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.LOG_LEVEL === 'trace' ? ['query'] : [],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

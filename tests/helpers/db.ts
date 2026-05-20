import { execSync } from 'child_process'
import { prisma } from '../../server/prisma'

export { prisma }

export async function setup(): Promise<void> {
  // スキーマをテスト DB に適用（provider は既存の schema.prisma に従う）
  execSync('pnpm exec prisma db push --skip-generate --accept-data-loss', {
    stdio: 'ignore',
    cwd: process.cwd(),
  })
}

export async function teardown(): Promise<void> {
  await prisma.$disconnect()
}

export async function reset(): Promise<void> {
  await prisma.user.deleteMany()
}

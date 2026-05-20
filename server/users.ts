import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { authenticator } from 'otplib'
import { prisma } from './prisma'
import type { User } from '@prisma/client'

export type { User }
export type SafeUser = Omit<User, 'password_hash' | 'totp_secret'>

const BCRYPT_ROUNDS = 12
authenticator.options = { window: 1 }

export const VALID_ROLES = ['user', 'admin'] as const

const safeSelect = {
  id: true, username: true, display_name: true, email: true,
  role: true, enabled: true, totp_enabled: true, created_at: true,
} as const

export async function listUsers(): Promise<SafeUser[]> {
  return prisma.user.findMany({
    select: safeSelect,
    orderBy: { created_at: 'desc' },
  })
}

export async function findById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } })
}

export async function createUser({ username, displayName, email, password, role = 'user' }: {
  username: string
  displayName?: string
  email?: string
  password: string
  role?: string
}): Promise<SafeUser> {
  if (!(VALID_ROLES as readonly string[]).includes(role)) throw new Error(`Invalid role: ${role}`)
  return prisma.user.create({
    data: {
      id:           crypto.randomUUID(),
      username,
      display_name: displayName ?? username,
      email:        email ?? null,
      password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      role,
      enabled:      true,
      created_at:   new Date(),
    },
    select: safeSelect,
  })
}

export async function updateUser(id: string, { displayName, email, enabled, password, role }: {
  displayName?: string
  email?: string
  enabled?: boolean
  password?: string
  role?: string
}): Promise<SafeUser | null> {
  if (role !== undefined && !(VALID_ROLES as readonly string[]).includes(role))
    throw new Error(`Invalid role: ${role}`)
  const data: Record<string, unknown> = {}
  if (displayName !== undefined) data['display_name'] = displayName
  if (email       !== undefined) data['email']        = email
  if (enabled     !== undefined) data['enabled']      = enabled
  if (password)                  data['password_hash'] = await bcrypt.hash(password, BCRYPT_ROUNDS)
  if (role        !== undefined) data['role']         = role
  return prisma.user.update({ where: { id }, data, select: safeSelect }).catch(() => null)
}

export async function deleteUser(id: string): Promise<boolean> {
  return prisma.user.delete({ where: { id } }).then(() => true).catch(() => false)
}

export async function changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new Error('ユーザーが見つかりません')
  const ok = await bcrypt.compare(currentPassword, user.password_hash ?? '')
  if (!ok) throw new Error('現在のパスワードが正しくありません')
  await prisma.user.update({ where: { id }, data: { password_hash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) } })
}

export async function verifyPassword(username: string, password: string): Promise<SafeUser | null> {
  const user = await prisma.user.findFirst({ where: { username, enabled: true } })
  if (!user) return null
  const ok = await bcrypt.compare(password, user.password_hash ?? '')
  if (!ok) return null
  const { password_hash: _ph, totp_secret: _ts, ...safe } = user
  return safe
}

export function generateTotpSecret(): string {
  return authenticator.generateSecret()
}

export async function enableTotp(id: string, secret: string, token: string): Promise<void> {
  if (!authenticator.verify({ token, secret })) throw new Error('コードが正しくありません')
  await prisma.user.update({ where: { id }, data: { totp_secret: secret, totp_enabled: true } })
}

export async function disableTotp(id: string, token: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user?.totp_enabled) throw new Error('2段階認証は有効ではありません')
  if (!authenticator.verify({ token, secret: user.totp_secret! }))
    throw new Error('コードが正しくありません')
  await prisma.user.update({ where: { id }, data: { totp_secret: null, totp_enabled: false } })
}

export async function verifyTotpToken(userId: string, token: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.totp_enabled || !user.totp_secret) return false
  return authenticator.verify({ token, secret: user.totp_secret })
}

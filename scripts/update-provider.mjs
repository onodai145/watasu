#!/usr/bin/env node
// DATABASE_URL のプレフィックスから prisma/schema.prisma の provider を自動設定する
import { readFileSync, writeFileSync } from 'fs'
import { parse } from 'dotenv'

let url = process.env.DATABASE_URL
if (!url) {
  try {
    const env = parse(readFileSync('.env', 'utf-8'))
    url = env.DATABASE_URL
  } catch {
    // .env がない場合は SQLite をデフォルトとする
  }
}
url ??= 'file:./data/app.db'

const provider =
  url.startsWith('postgresql://') || url.startsWith('postgres://')
    ? 'postgresql'
    : url.startsWith('mysql://')
    ? 'mysql'
    : 'sqlite'

const schema = readFileSync('prisma/schema.prisma', 'utf-8')
// datasource ブロックの provider のみ更新（generator client の provider は対象外）
const updated = schema.replace(
  /(datasource\s+\w+\s*\{[^}]*provider\s*=\s*")[^"]*"/s,
  `$1${provider}"`,
)
writeFileSync('prisma/schema.prisma', updated)
console.log(`[prisma] provider → ${provider} (${url.slice(0, 30)}...)`)

#!/usr/bin/env node
// DATABASE_URL のプレフィックスから prisma/schema.prisma の provider を自動設定する
import { readFileSync, writeFileSync } from 'fs'
import { parse } from 'dotenv'

let envVars = {}
try {
  envVars = parse(readFileSync('.env', 'utf-8'))
} catch { /* .env がない場合は無視 */ }

const url = process.env.DATABASE_URL ?? envVars['DATABASE_URL']

let provider
let displayUrl

if (url?.startsWith('postgresql://') || url?.startsWith('postgres://')) {
  provider   = 'postgresql'
  displayUrl = url
} else if (url?.startsWith('mysql://')) {
  provider   = 'mysql'
  displayUrl = url
} else {
  // デフォルト: SQLite
  provider   = 'sqlite'
  displayUrl = 'data/app.db'
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'file:../data/app.db'
  }
}

const schema  = readFileSync('prisma/schema.prisma', 'utf-8')
const updated = schema.replace(
  /(datasource\s+\w+\s*\{[^}]*provider\s*=\s*")[^"]*"/s,
  `$1${provider}"`,
)
writeFileSync('prisma/schema.prisma', updated)
console.log(`[prisma] provider → ${provider} (${displayUrl.slice(0, 40)})`)

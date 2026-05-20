<template>
  <main class="server-main">
    <div class="server-wrap">

      <div class="card" style="padding:24px;">
        <h2 class="section-head">サーバー情報</h2>
        <div v-if="info" class="info-table">
          <div class="info-row">
            <span class="info-key">データベース</span>
            <span class="info-val">{{ info.db }}{{ info.dbPath ? ` (${info.dbPath})` : '' }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">OIDC</span>
            <span class="info-val">{{ info.oidc?.issuer ?? '未設定' }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">ベース URL</span>
            <span class="info-val">{{ info.baseUrl }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">Node.js</span>
            <span class="info-val">{{ info.nodeVersion }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">稼働時間</span>
            <span class="info-val">{{ formatUptime(info.uptime) }}</span>
          </div>
        </div>
        <p v-else style="color:var(--text-muted); font-size:0.87rem;">読み込み中...</p>
      </div>

      <div class="card" style="padding:24px;">
        <h2 class="section-head">管理</h2>
        <a href="/admin/users" class="manage-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          ユーザー管理
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:auto">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </a>
      </div>

    </div>
  </main>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../services/api'

interface ServerInfo {
  db: string
  dbPath: string | null
  oidc: { issuer: string } | null
  baseUrl: string
  nodeVersion: string
  uptime: number
}

const info = ref<ServerInfo | null>(null)

onMounted(async () => {
  info.value = await api<ServerInfo>('GET', '/admin/api/server')
})

function formatUptime(s: number): string {
  if (s < 60)   return `${s}秒`
  if (s < 3600) return `${Math.floor(s / 60)}分`
  return `${Math.floor(s / 3600)}時間${Math.floor((s % 3600) / 60)}分`
}
</script>

<style scoped>
.server-main { padding: 32px clamp(24px, 4vw, 64px); align-items: flex-start; }
.server-main > .server-wrap { max-width: none !important; width: 100% !important; }
.server-wrap { width: 100%; display: flex; flex-direction: column; gap: 16px; }
h2.section-head { font-size: 0.9rem; font-weight: 600; margin-bottom: 16px; }
.info-table { display: flex; flex-direction: column; }
.info-row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 10px 0; font-size: 0.87rem; border-bottom: 1px solid rgba(46,50,71,0.6); }
.info-row:last-child { border-bottom: none; }
.info-key { color: var(--text-muted); flex-shrink: 0; }
.info-val { color: var(--text); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; font-size: 0.82rem; }
.manage-link {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 8px; font-size: 0.9rem;
  color: var(--text-muted); text-decoration: none;
  transition: background 0.12s, color 0.12s;
}
.manage-link:hover { background: var(--surface2); color: var(--text); }
</style>

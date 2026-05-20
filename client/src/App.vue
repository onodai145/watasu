<template>
  <header>
    <a href="/" class="logo" style="text-decoration:none;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
        <polyline points="13 2 13 9 20 9"/>
        <line x1="12" y1="13" x2="12" y2="19"/>
        <polyline points="9 16 12 19 15 16"/>
      </svg>
      Watasu
    </a>
    <div style="display:flex; align-items:center; gap:8px;">
      <ThemeToggle />
      <template v-if="showBack">
        <a href="/" class="btn btn-ghost btn-sm">← アプリ</a>
      </template>
      <template v-if="showLogout">
        <a href="/auth/logout" class="btn btn-ghost btn-sm">ログアウト</a>
      </template>
    </div>
  </header>
  <RouterView />
  <footer class="app-footer">
    <span>Watasu</span>
    <span class="footer-sep">|</span>
    <span>ファイルはサーバーを経由しません</span>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ThemeToggle from './components/ThemeToggle.vue'

const route = useRoute()
const showBack   = computed(() => ['/admin/users', '/admin/server', '/settings'].includes(route.path))
const showLogout = computed(() => route.path === '/admin/users')
</script>

<template>
  <div class="center-page-outer">
  <div class="login-wrap">
    <div class="login-logo">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
        <polyline points="13 2 13 9 20 9"/>
        <line x1="12" y1="13" x2="12" y2="19"/>
        <polyline points="9 16 12 19 15 16"/>
      </svg>
      <h1>Watasu</h1>
    </div>

    <div class="login-card">
      <div v-if="hasError" class="error-banner">
        ユーザー名またはパスワードが正しくありません
      </div>

      <div v-if="oidcAvailable" class="oidc-section">
        <a href="/auth/login" class="btn btn-primary oidc-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
          </svg>
          OIDC でログイン
        </a>
        <div class="or-divider">または</div>
      </div>

      <form method="POST" action="/auth/local/login">
        <div class="form-group">
          <label for="username">ユーザー名</label>
          <input id="username" type="text" name="username" autocomplete="username" required>
        </div>
        <div class="form-group">
          <label for="password">パスワード</label>
          <input id="password" type="password" name="password" autocomplete="current-password" required>
        </div>
        <button type="submit" class="btn btn-primary btn-block" style="margin-top:6px">ログイン</button>
      </form>
    </div>

    <a href="/" class="back-link">← トップに戻る</a>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const params = new URLSearchParams(location.search)
const hasError = params.get('error') !== null || params.get('auth_error') !== null
const oidcAvailable = ref(false)

onMounted(async () => {
  const data = await fetch('/api/me').then(r => r.json()).catch(() => ({})) as { oidcAvailable?: boolean }
  oidcAvailable.value = !!data.oidcAvailable
})
</script>

<style scoped>
.or-divider { display: flex; align-items: center; gap: 12px; margin: 18px 0; color: var(--text-muted); font-size: 0.8rem; }
.or-divider::before, .or-divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
.oidc-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; }
.oidc-section { margin-bottom: 4px; }
</style>

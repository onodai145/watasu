<template>
  <div class="center-page-outer">
  <div class="setup-wrap">
    <div class="setup-logo">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
        <polyline points="13 2 13 9 20 9"/>
        <line x1="12" y1="13" x2="12" y2="19"/>
        <polyline points="9 16 12 19 15 16"/>
      </svg>
      <h1>Watasu</h1>
      <p>Watasu へようこそ。<br>管理者アカウントを作成してください。</p>
    </div>

    <div class="setup-card">
      <div class="setup-badge">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        このページはユーザーが0人の間のみ表示されます
      </div>

      <div v-if="errorMsg" class="error-banner">{{ errorMsg }}</div>

      <form method="POST" action="/setup">
        <div class="form-group">
          <label for="username">ユーザー名 <span style="color:var(--error)">*</span></label>
          <input id="username" type="text" name="username" required autocomplete="username" autofocus>
        </div>
        <div class="form-group">
          <label for="displayName">表示名</label>
          <input id="displayName" type="text" name="displayName" autocomplete="name">
          <p class="form-hint">省略するとユーザー名が使われます</p>
        </div>
        <div class="form-group">
          <label for="password">パスワード <span style="color:var(--error)">*</span></label>
          <input id="password" type="password" name="password" required autocomplete="new-password">
        </div>
        <div class="submit-area">
          <button type="submit" class="btn btn-primary btn-block">セットアップ完了</button>
        </div>
      </form>
    </div>
  </div>
  </div>
</template>

<script setup lang="ts">
const messages: Record<string, string> = {
  missing: 'ユーザー名とパスワードは必須です',
  failed:  'ユーザーの作成に失敗しました',
}
const code = new URLSearchParams(location.search).get('error') ?? ''
const errorMsg = messages[code] ?? null
</script>

<style scoped>
.setup-wrap { width: 100%; max-width: 460px; }
.setup-logo { text-align: center; margin-bottom: 28px; }
.setup-logo h1 { font-size: 1.4rem; margin-top: 10px; }
.setup-logo p { font-size: 0.83rem; color: var(--text-muted); margin-top: 6px; line-height: 1.5; }
.setup-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px; }
.setup-badge {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(99,102,241,0.12); color: var(--accent);
  border: 1px solid rgba(99,102,241,0.25); border-radius: 20px;
  padding: 3px 10px; font-size: 0.75rem; font-weight: 600; margin-bottom: 18px;
}
.form-hint { font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; }
.submit-area { margin-top: 20px; }
</style>

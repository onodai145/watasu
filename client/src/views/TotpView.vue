<template>
  <div class="center-page-outer">
  <div class="login-wrap">
    <div class="login-logo">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2">
        <rect x="5" y="11" width="14" height="10" rx="2"/>
        <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
        <circle cx="12" cy="16" r="1" fill="#6366f1"/>
      </svg>
      <h1>2段階認証</h1>
      <p>認証アプリの6桁のコードを入力してください</p>
    </div>

    <div class="login-card">
      <div v-if="hasError" class="error-banner">
        コードが正しくありません。もう一度お試しください。
      </div>
      <form method="POST" action="/auth/totp/verify">
        <div class="form-group">
          <label>認証コード</label>
          <input
            class="token-input"
            type="text"
            name="token"
            maxlength="6"
            pattern="[0-9]{6}"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="000000"
            required
            autofocus
            @input="onInput">
        </div>
        <button type="submit" class="btn btn-primary btn-block">確認</button>
      </form>
    </div>

    <a href="/auth/totp/cancel" class="back-link">← ログインに戻る</a>
  </div>
  </div>
</template>

<script setup lang="ts">
const hasError = new URLSearchParams(location.search).get('error') !== null

function onInput(e: Event) {
  const input = e.target as HTMLInputElement
  const digits = input.value.replace(/\D/g, '')
  if (digits.length === 6) {
    input.value = digits
    input.form?.submit()
  }
}
</script>

<style scoped>
.login-logo h1 { font-size: 1.3rem; }
.token-input {
  width: 100%; text-align: center;
  font-size: 2rem; letter-spacing: 0.4em; font-variant-numeric: tabular-nums;
  font-weight: 600; padding: 12px;
}
</style>

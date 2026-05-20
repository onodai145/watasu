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
      <div class="tabs">
        <a href="/login"    class="tab">ログイン</a>
        <a href="/register" class="tab tab-active">新規登録</a>
      </div>

      <div v-if="errorMsg" class="error-banner">{{ errorMsg }}</div>

      <form @submit.prevent="submit">
        <div class="form-group">
          <label for="username">ユーザー名 <span class="required">*</span></label>
          <input id="username" v-model="form.username" type="text" autocomplete="username" required autofocus>
        </div>
        <div class="form-group">
          <label for="email">メールアドレス <span class="required">*</span></label>
          <input id="email" v-model="form.email" type="email" autocomplete="email" required>
        </div>
        <div class="form-group">
          <label for="password">パスワード <span class="required">*</span></label>
          <input id="password" v-model="form.password" type="password" autocomplete="new-password" required>
          <p class="form-hint">6文字以上</p>
        </div>
        <div class="form-group">
          <label for="passwordConfirm">パスワード（確認） <span class="required">*</span></label>
          <input id="passwordConfirm" v-model="form.passwordConfirm" type="password" autocomplete="new-password" required>
        </div>
        <button type="submit" class="btn btn-primary btn-block" :disabled="loading" style="margin-top:6px">
          {{ loading ? '登録中...' : 'アカウント登録' }}
        </button>
      </form>

    </div>

    <a href="/" class="back-link">← トップに戻る</a>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../services/api'

const form = ref({ username: '', email: '', password: '', passwordConfirm: '' })
const errorMsg = ref<string | null>(null)
const loading = ref(false)

async function submit() {
  errorMsg.value = null
  if (form.value.password !== form.value.passwordConfirm) {
    errorMsg.value = 'パスワードが一致しません'
    return
  }
  loading.value = true
  try {
    await api('POST', '/auth/register', {
      username: form.value.username,
      email:    form.value.email,
      password: form.value.password,
    })
    location.href = '/'
  } catch (err) {
    errorMsg.value = (err as Error).message
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.tabs { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
.tab { flex: 1; text-align: center; padding: 10px; font-size: 0.9rem; font-weight: 500; color: var(--text-muted); text-decoration: none; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color 0.15s, border-color 0.15s; }
.tab:hover { color: var(--text); }
.tab-active { color: var(--accent); border-bottom-color: var(--accent); }
.required { color: var(--error); }
.form-hint { font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; }
</style>

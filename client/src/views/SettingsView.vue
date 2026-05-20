<template>
  <main>
    <div v-if="loading" class="settings-wrap">
      <p style="color:var(--text-muted); text-align:center;">読み込み中...</p>
    </div>

    <div v-else class="settings-wrap">

      <!-- User info -->
      <div class="card" style="padding:20px 24px;">
        <div class="user-row">
          <div v-if="user.picture" class="avatar-lg">
            <img :src="user.picture" alt="">
          </div>
          <div v-else class="avatar-initial">{{ initial }}</div>
          <div>
            <div class="user-name-lg">{{ user.name }}</div>
            <div class="user-email-sm">{{ user.email ?? (isLocal ? 'ローカルアカウント' : '') }}</div>
          </div>
          <a href="/auth/logout" class="btn btn-ghost btn-sm" style="margin-left:auto">ログアウト</a>
        </div>
      </div>

      <!-- Profile (local only) -->
      <template v-if="isLocal">
        <div class="card" style="padding:24px;">
          <h2 class="section-head">プロフィール</h2>

          <div class="field-group">
            <label class="field-label">表示名</label>
            <div class="field-row">
              <input v-model="displayName" type="text" autocomplete="off">
              <button class="btn btn-secondary btn-sm" @click="saveDisplayName">保存</button>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">パスワード変更</label>
            <input v-model="pwCur"  type="password" placeholder="現在のパスワード"  autocomplete="current-password" class="field-input-mt">
            <input v-model="pwNew"  type="password" placeholder="新しいパスワード（6文字以上）" autocomplete="new-password" class="field-input-mt">
            <input v-model="pwNew2" type="password" placeholder="もう一度入力"       autocomplete="new-password" class="field-input-mt">
            <div class="field-submit">
              <button class="btn btn-secondary btn-sm" @click="savePassword">変更</button>
            </div>
          </div>
        </div>

        <div class="card" style="padding:24px;">
          <h2 class="section-head">2段階認証 (TOTP)</h2>

          <div class="totp-row">
            <span class="tag" :class="totpEnabled ? 'tag-enabled' : 'tag-user'">
              {{ totpEnabled ? '有効' : '未設定' }}
            </span>
            <button v-if="!totpEnabled" class="btn btn-secondary btn-sm" @click="startTotpSetup">設定する</button>
            <button v-else class="btn btn-sm totp-danger-btn" @click="totpPhase = 'disable'">無効にする</button>
          </div>

          <!-- Setup -->
          <div v-if="totpPhase === 'setup'" class="totp-expand">
            <div class="totp-qr-wrap">
              <img :src="totpQr" alt="QR code" class="totp-qr">
            </div>
            <p class="totp-hint">認証アプリでスキャン、または手動でシークレットを入力</p>
            <div class="totp-secret-box"><code class="totp-secret">{{ totpSecret }}</code></div>
            <input v-model="totpCode" type="text" placeholder="認証アプリの6桁コードで確認"
              maxlength="6" inputmode="numeric" autocomplete="one-time-code" class="field-input-mt">
            <div class="field-submit" style="gap:8px">
              <button class="btn btn-ghost btn-sm" @click="totpPhase = 'idle'; totpCode = ''">キャンセル</button>
              <button class="btn btn-primary btn-sm" @click="confirmTotpEnable">有効にする</button>
            </div>
          </div>

          <!-- Disable -->
          <div v-if="totpPhase === 'disable'" class="totp-expand">
            <input v-model="totpCode" type="text" placeholder="現在の認証コード（6桁）"
              maxlength="6" inputmode="numeric" autocomplete="one-time-code" class="field-input-mt">
            <div class="field-submit" style="gap:8px">
              <button class="btn btn-ghost btn-sm" @click="totpPhase = 'idle'; totpCode = ''">キャンセル</button>
              <button class="btn btn-sm totp-danger-btn" @click="confirmTotpDisable">無効にする</button>
            </div>
          </div>
        </div>
      </template>

      <!-- OIDC notice -->
      <div v-else class="card" style="padding:20px 24px;">
        <p style="font-size:0.87rem; color:var(--text-muted);">プロフィールは認証プロバイダで管理されています</p>
      </div>

    </div>
  </main>

  <div class="toast" :class="[toast.type, { hidden: !toast.visible }]">{{ toast.msg }}</div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '../services/api'

interface MeUser {
  sub: string
  name: string
  email: string | null
  picture: string | null
  role?: string
  totpEnabled?: boolean
}
const loading = ref(true)
const user = ref<MeUser>({ sub: '', name: '', email: null, picture: null })
const isLocal = computed(() => user.value.sub?.startsWith('local:'))
const initial  = computed(() => (user.value.name || user.value.email || '?')[0].toUpperCase())

const displayName = ref('')
const pwCur = ref(''); const pwNew = ref(''); const pwNew2 = ref('')

const totpEnabled = ref(false)
const totpPhase   = ref<'idle' | 'setup' | 'disable'>('idle')
const totpQr      = ref(''); const totpSecret = ref(''); const totpCode = ref('')

const toast = reactive({ msg: '', type: 'info', visible: false })
let toastTimer: ReturnType<typeof setTimeout>
function showToast(msg: string, type = 'info') {
  clearTimeout(toastTimer)
  Object.assign(toast, { msg, type, visible: true })
  toastTimer = setTimeout(() => { toast.visible = false }, 3500)
}

onMounted(async () => {
  const data = await fetch('/api/me').then(r => r.json()).catch(() => ({})) as { authenticated?: boolean; user?: MeUser }
  if (!data.authenticated || !data.user) { window.location.href = '/login'; return }
  user.value      = data.user
  displayName.value = data.user.name
  totpEnabled.value = !!data.user.totpEnabled
  loading.value   = false
})

async function saveDisplayName() {
  if (!displayName.value.trim()) return
  try {
    const res = await api<{ name: string }>('PATCH', '/api/me', { displayName: displayName.value.trim() })
    user.value.name = res.name
    showToast('表示名を変更しました')
  } catch (err) { showToast((err as Error).message, 'error') }
}

async function savePassword() {
  if (!pwCur.value || !pwNew.value) { showToast('全て入力してください', 'error'); return }
  if (pwNew.value !== pwNew2.value) { showToast('新しいパスワードが一致しません', 'error'); return }
  try {
    await api('PATCH', '/api/me', { currentPassword: pwCur.value, newPassword: pwNew.value })
    pwCur.value = pwNew.value = pwNew2.value = ''
    showToast('パスワードを変更しました')
  } catch (err) { showToast((err as Error).message, 'error') }
}

async function startTotpSetup() {
  try {
    const data = await api<{ qrDataUri: string; secret: string }>('POST', '/api/me/totp/setup')
    totpQr.value = data.qrDataUri; totpSecret.value = data.secret
    totpPhase.value = 'setup'
  } catch (err) { showToast((err as Error).message, 'error') }
}

async function confirmTotpEnable() {
  if (totpCode.value.length !== 6) { showToast('6桁のコードを入力してください', 'error'); return }
  try {
    await api('POST', '/api/me/totp/enable', { token: totpCode.value })
    totpEnabled.value = true; totpPhase.value = 'idle'; totpCode.value = ''
    showToast('2段階認証を有効にしました')
  } catch (err) { showToast((err as Error).message, 'error') }
}

async function confirmTotpDisable() {
  if (totpCode.value.length !== 6) { showToast('6桁のコードを入力してください', 'error'); return }
  try {
    await api('POST', '/api/me/totp/disable', { token: totpCode.value })
    totpEnabled.value = false; totpPhase.value = 'idle'; totpCode.value = ''
    showToast('2段階認証を無効にしました')
  } catch (err) { showToast((err as Error).message, 'error') }
}


</script>

<style scoped>
.settings-wrap { width: 100%; max-width: 560px; display: flex; flex-direction: column; gap: 16px; }
h2.section-head { font-size: 0.9rem; font-weight: 600; margin-bottom: 16px; }

.user-row { display: flex; align-items: center; gap: 14px; }
.avatar-lg img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
.avatar-initial {
  width: 48px; height: 48px; border-radius: 50%;
  background: var(--accent); color: #fff; font-weight: 700; font-size: 1.2rem;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.user-name-lg  { font-weight: 600; font-size: 0.95rem; }
.user-email-sm { font-size: 0.78rem; color: var(--text-muted); margin-top: 2px; }

.field-group { margin-bottom: 20px; }
.field-group:last-child { margin-bottom: 0; }
.field-label { display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 7px; }
.field-row { display: flex; gap: 8px; align-items: center; }
.field-row input { flex: 1; }
.field-input-mt { width: 100%; margin-top: 8px; }
.field-submit { display: flex; justify-content: flex-end; margin-top: 10px; }

.totp-row { display: flex; align-items: center; gap: 10px; margin-bottom: 2px; }
.totp-expand { margin-top: 12px; padding: 14px; background: var(--surface2); border: 1px solid var(--border); border-radius: 9px; }
.totp-qr-wrap { display: flex; justify-content: center; margin-bottom: 12px; }
.totp-qr { border-radius: 8px; background: #fff; padding: 6px; width: 160px; height: 160px; }
.totp-hint { font-size: 0.78rem; color: var(--text-muted); margin-bottom: 8px; line-height: 1.4; }
.totp-secret-box { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; margin-bottom: 4px; }
.totp-secret { font-family: monospace; font-size: 0.8rem; color: var(--accent); letter-spacing: 0.08em; word-break: break-all; }
.totp-danger-btn { border: 1px solid rgba(239,68,68,0.35); background: rgba(239,68,68,0.1); color: var(--error); padding: 6px 12px; border-radius: 6px; font-size: 0.82rem; font-weight: 500; cursor: pointer; }
.totp-danger-btn:hover { background: rgba(239,68,68,0.2); }

.nav-link, .nav-btn {
  display: flex; align-items: center; gap: 9px;
  padding: 9px 10px; border-radius: 7px; font-size: 0.88rem;
  color: var(--text-muted); text-decoration: none;
  border: none; background: none; cursor: pointer; width: 100%; text-align: left;
  transition: background 0.12s, color 0.12s; margin-bottom: 2px;
}
.nav-link:hover, .nav-btn:hover { background: var(--surface2); color: var(--text); }
.server-info { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-top: 4px; }
.info-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 4px 0; font-size: 0.8rem; border-bottom: 1px solid rgba(46,50,71,0.5); }
.info-row:last-child { border-bottom: none; }
.info-key { color: var(--text-muted); flex-shrink: 0; }
.info-val { color: var(--text); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; font-size: 0.77rem; }
</style>

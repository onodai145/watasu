<template>
  <main class="admin-main">
    <div class="admin-wrap">
      <div class="card" style="padding:24px;">
        <h2 class="section-head">ユーザーを作成</h2>
        <form class="create-form" @submit.prevent="submitCreate">
          <div class="form-group">
            <label>ユーザー名 <span style="color:var(--error)">*</span></label>
            <input v-model="form.username" type="text" placeholder="alice" required autocomplete="off">
          </div>
          <div class="form-group">
            <label>表示名</label>
            <input v-model="form.displayName" type="text" placeholder="Alice" autocomplete="off">
          </div>
          <div class="form-group">
            <label>メールアドレス</label>
            <input v-model="form.email" type="email" placeholder="alice@example.com" autocomplete="off">
          </div>
          <div class="form-group">
            <label>パスワード <span style="color:var(--error)">*</span></label>
            <input v-model="form.password" type="password" required autocomplete="new-password">
          </div>
          <div class="form-group">
            <label>ロール</label>
            <select v-model="form.role">
              <option value="user">一般ユーザー</option>
              <option value="admin">管理者</option>
            </select>
          </div>
          <div class="create-submit">
            <label style="visibility:hidden">_</label>
            <button type="submit" class="btn btn-primary">作成</button>
          </div>
        </form>
      </div>

      <div class="card" style="padding:24px;">
        <h2 class="section-head">
          ローカルユーザー
          <span style="color:var(--text-muted); font-weight:400;">({{ users.length }}人)</span>
        </h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ユーザー名</th><th>表示名</th><th>メール</th>
                <th>ロール</th><th>状態</th><th>作成日</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="users.length === 0" class="empty-row">
                <td colspan="7">ユーザーはいません</td>
              </tr>
              <tr v-for="u in users" :key="u.id">
                <td>
                  <strong>{{ u.username }}</strong>
                  <span v-if="isSelf(u)" class="self-badge">（あなた）</span>
                </td>
                <td>{{ u.display_name }}</td>
                <td style="color:var(--text-muted)">{{ u.email ?? '—' }}</td>
                <td>
                  <span class="tag" :class="u.role === 'admin' ? 'tag-admin' : 'tag-user'">
                    {{ u.role === 'admin' ? '管理者' : '一般' }}
                  </span>
                </td>
                <td>
                  <span class="tag" :class="u.enabled ? 'tag-enabled' : 'tag-disabled'">
                    {{ u.enabled ? '有効' : '無効' }}
                  </span>
                </td>
                <td style="color:var(--text-muted);white-space:nowrap">{{ fmtDate(u.created_at) }}</td>
                <td>
                  <div class="actions">
                    <button class="btn-action promote"
                      :disabled="isSelf(u)"
                      :title="isSelf(u) ? '自分自身は変更できません' : ''"
                      @click="changeRole(u.id, u.role === 'admin' ? 'user' : 'admin')">
                      {{ u.role === 'admin' ? '一般に変更' : '管理者に昇格' }}
                    </button>
                    <button class="btn-action" @click="toggleEnabled(u.id, !u.enabled)">
                      {{ u.enabled ? '無効化' : '有効化' }}
                    </button>
                    <button class="btn-action" @click="resetPassword(u.id, u.username)">
                      PW変更
                    </button>
                    <button class="btn-action danger"
                      :disabled="isSelf(u)"
                      :title="isSelf(u) ? '自分自身は削除できません' : ''"
                      @click="deleteUser(u.id, u.username)">
                      削除
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </main>

  <div class="toast" :class="[toast.type, { hidden: !toast.visible }]">{{ toast.msg }}</div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { api } from '../services/api'

interface User {
  id: string
  username: string
  display_name: string
  email: string | null
  role: 'user' | 'admin'
  enabled: boolean
  created_at: string
}

interface MeResponse { sub: string }

const users = ref<User[]>([])
const currentSub = ref<string | null>(null)
const toast = reactive({ msg: '', type: 'info', visible: false })
const form = reactive({ username: '', displayName: '', email: '', password: '', role: 'user' })
let toastTimer: ReturnType<typeof setTimeout>

function showToast(msg: string, type = 'info') {
  clearTimeout(toastTimer)
  Object.assign(toast, { msg, type, visible: true })
  toastTimer = setTimeout(() => { toast.visible = false }, 3500)
}

function isSelf(user: User) {
  return currentSub.value === `local:${user.id}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

async function loadUsers() {
  try {
    users.value = await api<User[]>('GET', '/admin/api/users')
  } catch (err) {
    showToast('読み込みエラー: ' + (err as Error).message, 'error')
  }
}

async function changeRole(id: string, newRole: string) {
  try {
    await api('PATCH', `/admin/api/users/${id}`, { role: newRole })
    await loadUsers()
    showToast(newRole === 'admin' ? '管理者に昇格しました' : '一般ユーザーに変更しました')
  } catch (err) { showToast((err as Error).message, 'error') }
}

async function toggleEnabled(id: string, enabled: boolean) {
  try {
    await api('PATCH', `/admin/api/users/${id}`, { enabled })
    await loadUsers()
    showToast(enabled ? 'ユーザーを有効化しました' : 'ユーザーを無効化しました')
  } catch (err) { showToast((err as Error).message, 'error') }
}

async function resetPassword(id: string, username: string) {
  const pw = prompt(`「${username}」の新しいパスワードを入力してください:`)
  if (!pw) return
  if (pw.length < 6) { showToast('パスワードは6文字以上にしてください', 'error'); return }
  try {
    await api('PATCH', `/admin/api/users/${id}`, { password: pw })
    showToast('パスワードを変更しました')
  } catch (err) { showToast((err as Error).message, 'error') }
}

async function deleteUser(id: string, username: string) {
  if (!confirm(`「${username}」を削除してもよいですか？\nこの操作は元に戻せません。`)) return
  try {
    await api('DELETE', `/admin/api/users/${id}`)
    await loadUsers()
    showToast('削除しました')
  } catch (err) { showToast((err as Error).message, 'error') }
}

async function submitCreate() {
  const username = form.username
  try {
    await api('POST', '/admin/api/users', { ...form })
    Object.assign(form, { username: '', displayName: '', email: '', password: '', role: 'user' })
    await loadUsers()
    showToast(`「${username}」を作成しました`)
  } catch (err) { showToast((err as Error).message, 'error') }
}

onMounted(async () => {
  try {
    const { sub } = await api<MeResponse>('GET', '/admin/api/me')
    currentSub.value = sub
  } catch {
    window.location.href = '/login'
    return
  }
  await loadUsers()
})
</script>

<style scoped>
.admin-main { padding: 32px clamp(24px, 4vw, 64px); align-items: flex-start; }
.admin-main > .admin-wrap { max-width: none !important; width: 100% !important; }

h2.section-head { font-size: 1rem; font-weight: 600; margin-bottom: 16px; }

.create-form { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.create-form .form-group { flex: 1; min-width: 160px; margin-bottom: 0; }
.create-submit { flex: 0 0 auto; display: flex; flex-direction: column; gap: 5px; }
.create-submit label { font-size: 0.82rem; margin-bottom: 6px; }
.form-group { display: flex; flex-direction: column; gap: 5px; margin-bottom: 0; }
.form-group label { font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0; }
.form-group label { font-size: 0.78rem; color: var(--text-muted); }
.form-group input, .form-group select {
  background: var(--surface2); border: 1px solid var(--border); color: var(--text);
  padding: 8px 11px; border-radius: 7px; font-size: 0.88rem; outline: none;
  transition: border-color 0.15s;
}
.form-group input:focus, .form-group select:focus { border-color: var(--accent); }
.create-submit { flex: 0 0 auto; display: flex; flex-direction: column; gap: 5px; }

.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.87rem; }
th { padding: 9px 12px; text-align: left; font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); white-space: nowrap; }
td { padding: 11px 12px; border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent); vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: color-mix(in srgb, var(--text) 2%, transparent); }

.tag { border-radius: 5px; padding: 2px 8px; font-size: 0.74rem; font-weight: 600; white-space: nowrap; }
.tag-enabled  { background: color-mix(in srgb, var(--success) 15%, transparent);  color: var(--success); border: 1px solid color-mix(in srgb, var(--success) 25%, transparent); }
.tag-disabled { background: rgba(239,68,68,0.1);   color: var(--error);   border: 1px solid color-mix(in srgb, var(--error) 25%, transparent); }
.tag-admin    { background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent);  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); }
.tag-user     { background: var(--surface2);       color: var(--text-muted); border: 1px solid var(--border); }

.actions { display: flex; gap: 5px; flex-wrap: wrap; }
.btn-action { padding: 4px 9px; font-size: 0.77rem; border-radius: 5px; border: 1px solid var(--border); background: var(--surface2); color: var(--text-muted); cursor: pointer; transition: all 0.12s; white-space: nowrap; }
.btn-action:hover         { color: var(--text);   border-color: var(--text-muted); }
.btn-action.promote:hover { color: var(--accent); border-color: var(--accent); }
.btn-action.danger:hover  { color: var(--error);  border-color: var(--error); }
.btn-action:disabled { opacity: 0.35; cursor: not-allowed; }

.empty-row td { color: var(--text-muted); text-align: center; padding: 28px; }
.card { margin-bottom: 20px; }
.self-badge { font-size: 0.7rem; color: var(--text-muted); margin-left: 6px; }
</style>

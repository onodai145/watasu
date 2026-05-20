import { createRouter, createWebHistory } from 'vue-router'
import AdminView    from '../views/AdminView.vue'
import LoginView    from '../views/LoginView.vue'
import TotpView     from '../views/TotpView.vue'
import SetupView    from '../views/SetupView.vue'
import SettingsView from '../views/SettingsView.vue'
import ServerView   from '../views/ServerView.vue'
import RegisterView from '../views/RegisterView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAdmin?: boolean
    requiresAuth?: boolean
    bodyClass?: string
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login',      component: LoginView,    meta: { bodyClass: 'center-page' } },
    { path: '/login/totp', component: TotpView,     meta: { bodyClass: 'center-page' } },
    { path: '/register',   component: RegisterView, meta: { bodyClass: 'center-page' } },
    { path: '/setup',      component: SetupView,    meta: { bodyClass: 'center-page' } },
    { path: '/admin/users',  component: AdminView,    meta: { requiresAdmin: true } },
    { path: '/admin/server', component: ServerView,   meta: { requiresAdmin: true } },
    { path: '/settings',     component: SettingsView, meta: { requiresAuth: true } },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.requiresAdmin) {
    const res = await fetch('/admin/api/me')
    if (!res.ok) return '/login'
  } else if (to.meta.requiresAuth) {
    const data = await fetch('/api/me').then(r => r.json()).catch(() => ({})) as { authenticated?: boolean }
    if (!data.authenticated) return '/login'
  }
})

router.afterEach((to) => {
  document.body.className = to.meta.bodyClass ?? ''
})

export default router

import { ref } from 'vue'

const isDark = ref(
  typeof document !== 'undefined'
    ? document.documentElement.dataset.theme !== 'light'
    : matchMedia('(prefers-color-scheme: dark)').matches
)

export function useTheme() {
  function toggle() {
    isDark.value = !isDark.value
    const theme = isDark.value ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }

  return { isDark, toggle }
}

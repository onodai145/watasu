import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/spa/',
  build: {
    outDir: '../public/spa',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api':       'http://localhost:3000',
      '/auth':      'http://localhost:3000',
      '/admin/api': 'http://localhost:3000',
      '/setup': {
        target: 'http://localhost:3000',
        bypass: (req) => req.method === 'GET' ? req.url : undefined,
      },
      '/style.css': 'http://localhost:3000',
    },
  },
})

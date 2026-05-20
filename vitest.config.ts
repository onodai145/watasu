import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    env: {
      DATABASE_URL: 'file:../data/test.db',
      SESSION_SECRET: 'test-secret-not-for-production',
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['server/**/*.ts'],
      exclude: ['server/index.ts', 'server/session.d.ts', 'server/prisma.ts'],
    },
  },
})

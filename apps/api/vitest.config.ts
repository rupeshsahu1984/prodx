import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // The integration tests share one database; parallel files would collide.
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      // The non-owner role, so RLS is genuinely exercised rather than bypassed.
      DATABASE_URL:
        process.env['TEST_APP_DATABASE_URL'] ??
        'postgresql://prodx_app:prodx_test_pw@localhost:5432/prodx_test',
      JWT_SECRET: 'a-test-secret-that-is-definitely-long-enough',
    },
  },
})

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // These tests share one database; parallel files would fight over rows.
    fileParallelism: false,
    testTimeout: 30_000,
  },
})

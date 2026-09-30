import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    jsx: 'automatic'
  },
  test: {
    exclude: ['node_modules/**', 'test/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['server/**/*.js', 'client/image/src/**/*.js', 'client/markdown/src/**/*.js', 'client/shared/**/*.js'],
      exclude: ['node_modules/', 'client/dist/']
    }
  }
})

import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Integration tests need the local Supabase stack: npm run test:integration
    exclude: ['src/**/*.int.test.ts', 'node_modules/**'],
  },
})

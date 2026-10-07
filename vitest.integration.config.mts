import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Integration tests run against the local Supabase stack (`npm run db:start`).
// Supabase URL and publishable key come from .env.local; workers inherit process.env.
process.loadEnvFile('.env.local')

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.int.test.ts'],
    fileParallelism: false,
  },
})

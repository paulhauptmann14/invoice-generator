/** Local seed data (supabase/seed.sql) used by integration tests; never present in the cloud project. */
export const SEED = {
  password: 'lokales-dev-passwort-123',
  dev: 'dev@invoice.localhost',
  stranger: 'stranger@invoice.localhost',
  gasthaus: 'c0000000-0000-4000-8000-000000000001',
  metzgerei: 'c0000000-0000-4000-8000-000000000002',
} as const

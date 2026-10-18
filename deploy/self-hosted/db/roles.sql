-- Vendored from supabase/supabase, docker/volumes/db/roles.sql
-- Pinned commit: bc27d2661edd09a5d0b8d76ce33da6d4071a756e (2026-10-18).
-- Runs once on first database start (mounted into /docker-entrypoint-initdb.d/init-scripts/) and sets the
-- service role passwords from POSTGRES_PASSWORD.
-- Change from upstream: the supabase_functions_admin line is removed. That role is created by upstream's
-- webhooks.sql (edge functions), which this stack does not use; ALTER USER on a missing role aborts this script
-- and with it the image's remaining init migrations (auth/storage ownership), so GoTrue then fails to migrate.

-- NOTE: change to your own passwords for production environments
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';

-- Vendored from supabase/supabase, docker/volumes/db/jwt.sql
-- Pinned commit: bc27d2661edd09a5d0b8d76ce33da6d4071a756e (2026-10-18). Unmodified apart from this header.
-- Runs once on first database start and stores the JWT lifetime (JWT_EXP) as a database setting.
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';

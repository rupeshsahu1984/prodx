-- PRODX ERP — application database role (ADR 0002)
--
--   psql "$DATABASE_MIGRATION_URL" -v app_password="$PRODX_APP_PASSWORD" \
--        -f packages/db/scripts/create-app-role.sql
--
-- The role owns no objects, which is what stops it bypassing RLS. The password
-- is never written in this file: it is required as a psql variable and the
-- script refuses to run without one.
--
-- In a managed environment, provision the role through your secrets manager
-- instead and skip this script entirely.

\if :{?app_password}
\else
  \warn 'FATAL: app_password is required.'
  \warn 'Run with:  psql ... -v app_password="$PRODX_APP_PASSWORD" -f create-app-role.sql'
  \quit 1
\endif

-- Interpolation must happen outside a dollar-quoted block: psql deliberately
-- does not substitute variables inside $$ ... $$, so the usual
-- "DO $$ IF NOT EXISTS ... $$" guard would embed the literal ":'app_password'".
-- Generating the statement and running it with \gexec keeps it idempotent.
SELECT format('CREATE ROLE prodx_app LOGIN PASSWORD %L', :'app_password')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prodx_app')
\gexec

SELECT format('ALTER ROLE prodx_app PASSWORD %L', :'app_password')
 WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prodx_app')
\gexec

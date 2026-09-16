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

-- The deliberate cross-tenant role ADR 0002 anticipated.
--
-- The outbox worker has to FIND work before it knows whose work it is: it scans
-- for pending messages across every tenant, then processes each one inside that
-- tenant's own scope. Under RLS a connection with no tenant context sees
-- nothing — including as the owner, because tables are FORCEd — so without this
-- the worker silently delivered nothing at all.
--
-- BYPASSRLS is granted to this role and to nothing else. It is used for the
-- claim query and for no business read.
SELECT format('CREATE ROLE prodx_worker LOGIN BYPASSRLS PASSWORD %L', :'app_password')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prodx_worker')
\gexec

SELECT format('ALTER ROLE prodx_worker LOGIN BYPASSRLS PASSWORD %L', :'app_password')
 WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prodx_worker')
\gexec

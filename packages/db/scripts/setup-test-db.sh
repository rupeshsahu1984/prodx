#!/usr/bin/env bash
# Creates a clean prodx_test database with migrations and RLS applied.
# Idempotent: safe to re-run, and it drops the database each time so tests
# never inherit state from a previous run.
#
#   ./scripts/setup-test-db.sh
set -euo pipefail

DB=${TEST_DB_NAME:-prodx_test}
PW=${TEST_DB_PASSWORD:-prodx_test_pw}
SUPERUSER=${TEST_SUPERUSER:-$(whoami)}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> roles"
psql -U "$SUPERUSER" -d postgres -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='prodx_owner') THEN
    CREATE ROLE prodx_owner LOGIN CREATEDB PASSWORD '${PW}';
  ELSE
    ALTER ROLE prodx_owner PASSWORD '${PW}';
  END IF;
END \$\$;
SQL

echo "==> database ${DB} (dropped and recreated)"
psql -U "$SUPERUSER" -d postgres -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE IF EXISTS ${DB} WITH (FORCE)" \
  -c "CREATE DATABASE ${DB} OWNER prodx_owner"

OWNER_URL="postgresql://prodx_owner:${PW}@localhost:5432/${DB}"

echo "==> migrations"
# The workspace's pinned prisma, not npx. npx resolves through the npm cache,
# which makes this depend on network state and on the cache being writable —
# neither of which a database setup script should care about.
PRISMA="$HERE/../node_modules/.bin/prisma"
if [ ! -x "$PRISMA" ]; then
  echo "FAIL: $PRISMA not found. Run pnpm install first."
  exit 1
fi
DATABASE_URL="$OWNER_URL" "$PRISMA" migrate deploy --schema "$HERE/../prisma/schema.prisma"

echo "==> application role"
# Created as the superuser, not as prodx_owner. Giving the schema owner
# CREATEROLE would hand it a privilege-escalation path, and in production this
# role is provisioned by the DBA or secrets manager anyway.
psql -U "$SUPERUSER" -d "$DB" -v ON_ERROR_STOP=1 -q \
  -v app_password="$PW" -f "$HERE/create-app-role.sql"

echo "==> row level security"
PGPASSWORD="$PW" psql "$OWNER_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/rls.sql"

echo "==> verifying RLS"
# Count first. check-rls.sql only inspects tables that HAVE a tenant_id column,
# so if the column were named differently it would inspect nothing and report
# success — a vacuous pass that once hid the fact that RLS was applied to zero
# tables. Assert a plausible floor before trusting the check.
protected=$(PGPASSWORD="$PW" psql "$OWNER_URL" -t -A -c "
  SELECT count(*) FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_policy  p ON p.polrelid = c.oid
   WHERE n.nspname='public' AND c.relkind='r'")
if [ "$protected" -lt 15 ]; then
  echo "FAIL: only ${protected} table(s) carry a tenant policy. Expected 15+."
  echo "      Check that the tenant_id column is really named tenant_id."
  exit 1
fi

unprotected=$(PGPASSWORD="$PW" psql "$OWNER_URL" -t -A -f "$HERE/check-rls.sql" | wc -l | tr -d ' ')
if [ "$unprotected" != "0" ]; then
  echo "FAIL: ${unprotected} table(s) without RLS:"
  PGPASSWORD="$PW" psql "$OWNER_URL" -f "$HERE/check-rls.sql"
  exit 1
fi
echo "    ${protected} tables protected"

echo "==> ready: ${DB}"

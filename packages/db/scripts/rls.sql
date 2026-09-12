-- PRODX ERP — row level security bootstrap (ADR 0002)
--
-- Run after `prisma migrate deploy`, as the schema OWNER.
-- CI fails the build if any table under `public` lacks a policy, so this file
-- must be extended whenever a table is added.
--
-- Why FORCE: the owning role bypasses RLS by default, and Prisma is commonly
-- pointed at the owner. FORCE closes that, and the application additionally
-- connects as prodx_app, which owns nothing.

-- Application role. Owns no objects, so it can never bypass a policy.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prodx_app') THEN
    CREATE ROLE prodx_app LOGIN PASSWORD 'change-me';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO prodx_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO prodx_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO prodx_app;

-- Apply the tenant policy to every table that has a tenant_id column.
-- Generated rather than hand-listed, so a new table cannot be forgotten.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND a.attname = 'tenant_id'
       AND NOT a.attisdropped
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I
         USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)
         WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  END LOOP;
END
$$;

-- Append-only enforcement. Reversal is the only correction for these tables
-- (ADR 0005, 0006, and the immutability invariant in CLAUDE.md).
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only. Reverse the entry instead of % it.',
    TG_TABLE_NAME, lower(TG_OP);
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'stock_ledger_entry', 'stock_unit_link', 'journal_entry', 'journal_line', 'audit_event'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_append_only ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_append_only BEFORE UPDATE OR DELETE ON public.%I
         FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation()', t, t);
  END LOOP;
END
$$;

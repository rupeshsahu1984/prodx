-- CI guard: every table carrying tenant_id must have RLS enabled, forced,
-- and a policy. Returns rows only when something is wrong, so CI can fail on
-- a non-empty result.
SELECT c.relname AS table_without_protection,
       c.relrowsecurity  AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'
   AND a.attname = 'tenant_id'
   AND NOT a.attisdropped
   AND (NOT c.relrowsecurity
        OR NOT c.relforcerowsecurity
        OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) = 0);

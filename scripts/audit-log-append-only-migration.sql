-- ============================================================================
-- Audit log — APPEND-ONLY lock (piece 1)
--
-- CRITICAL FIX. audit_log is currently mutable by clinic users: authenticated (and
-- anon) hold UPDATE + DELETE grants, and RLS explicitly permits them via
-- audit_log_{delete,update}_{own_org,operator}. Any clinic member can DELETE or
-- REWRITE the record of their own actions. This is live on prod and voids the entire
-- premise of an audit log. We lock it exactly as charges/payments were locked
-- (billing-charges-payments-migration.sql): append-only is enforced by REVOKEing
-- UPDATE/DELETE and dropping the UPDATE/DELETE policies — not by convention.
--
-- ⛔ DRAFT — DO NOT RUN. Staging clone first (dujnbboyeugrisgewnqu), dry-run, verify,
--    then prod (aajwuwjxpmmqcwhiynla) via the human-runs-it ceremony.
--
-- Trace-confirmed current state (scripts/_prod-schema-snapshot-clean.sql):
--   • GRANT SELECT,INSERT,DELETE,UPDATE ON audit_log TO authenticated;  (line ~4095)
--   • GRANT SELECT,INSERT,DELETE,UPDATE ON audit_log TO anon;           (line ~4096)
--   • GRANT ALL ON audit_log TO service_role;                           (line ~4097)
--   • Policies (8): insert_{own_org,operator}, select_{own_org,operator},
--     delete_{own_org,operator}, update_{own_org,operator}.
--   • Index: only idx_audit_log_created_at (created_at DESC) — NO org_id index.
--   • Writer path: src/lib/audit.js logAuditEvent → supabase.from('audit_log').insert
--     (runs as `authenticated`; requireUser() first, so `anon` is never a write path).
--
-- RESULT after this migration: audit_log is INSERT + SELECT only for every user —
-- clinic staff, owners, AND operators (SupCod3). No one can edit or delete a log row
-- through a user path. service_role KEEPS ALL — that is unavoidable (it owns the
-- table / runs migrations) and is a server-only key, never exposed to a user session;
-- it is the same trust boundary the charges/payments lock lives with.
--
-- DECISION: KEEP the insert policies (writes must keep working) and the select
--   policies (all org members read their own org, operators read all — per the
--   trace decision). Only the 4 UPDATE/DELETE policies are dropped.
-- ============================================================================
BEGIN;

-- ── 1. Grants: strip mutation from authenticated; strip everything from anon ──
-- REVOKE is idempotent (revoking a privilege not held is a no-op). authenticated
-- keeps SELECT + INSERT; anon keeps nothing (it is never a legitimate audit path).
REVOKE UPDATE, DELETE ON public.audit_log FROM authenticated;
REVOKE ALL            ON public.audit_log FROM anon;

-- ── 2. Drop the UPDATE/DELETE RLS policies (append-only = no mutate path) ─────
DROP POLICY IF EXISTS audit_log_delete_own_org  ON public.audit_log;
DROP POLICY IF EXISTS audit_log_delete_operator ON public.audit_log;
DROP POLICY IF EXISTS audit_log_update_own_org  ON public.audit_log;
DROP POLICY IF EXISTS audit_log_update_operator ON public.audit_log;

-- ── 3. Missing index to back the per-org Log UI (org filter + newest-first) ───
CREATE INDEX IF NOT EXISTS idx_audit_log_org_created
    ON public.audit_log USING btree (org_id, created_at DESC);

COMMIT;

-- KEPT (untouched, listed for the reviewer): the INSERT + SELECT policies remain —
--   audit_log_insert_own_org   FOR INSERT WITH CHECK (org_id = public.current_org_id())
--   audit_log_insert_operator  FOR INSERT WITH CHECK (public.is_operator())
--   audit_log_select_own_org   FOR SELECT USING       (org_id = public.current_org_id())
--   audit_log_select_operator  FOR SELECT USING       (public.is_operator())

-- ── VERIFY (run separately, AFTER commit, on the staging clone) ──────────────
-- 1) authenticated grants on audit_log = {INSERT, SELECT} only (NO UPDATE/DELETE):
--   SELECT privilege_type FROM information_schema.role_table_grants
--    WHERE grantee='authenticated' AND table_schema='public' AND table_name='audit_log'
--    ORDER BY privilege_type;
--   -- EXPECT exactly: INSERT, SELECT
--
-- 2) anon has NO grants on audit_log:
--   SELECT count(*)::int AS n FROM information_schema.role_table_grants
--    WHERE grantee='anon' AND table_schema='public' AND table_name='audit_log';
--   -- EXPECT: 0
--
-- 3) NO UPDATE/DELETE policies remain (only insert_* + select_* survive):
--   SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname='public' AND tablename='audit_log' ORDER BY cmd, policyname;
--   -- EXPECT cmd set: INSERT (x2) + SELECT (x2) only — no UPDATE, no DELETE row.
--
-- 4) append-only lock holds functionally (exercise on the staging clone as an
--    authenticated org member — the dry-run runner self-seeds + simulates this):
--    • INSERT a row for the caller's org                 → SUCCEEDS (writes still work)
--    • SELECT own-org rows                                → SUCCEEDS (reads still work)
--    • UPDATE audit_log SET payload='{}'::jsonb WHERE …   → REJECTED (no grant/policy)
--    • DELETE FROM audit_log WHERE …                      → REJECTED (no grant/policy)
--
-- 5) the org index exists:
--   SELECT indexname FROM pg_indexes
--    WHERE schemaname='public' AND tablename='audit_log' AND indexname='idx_audit_log_org_created';
--   -- EXPECT: 1 row.

-- ── ROLLBACK (if the dry-run is rejected) ───────────────────────────────────
-- Restores the pre-migration (mutable) state exactly. ⚠️ This re-opens the delete/
-- edit hole — only for aborting a bad apply, never as a target state.
--   BEGIN;
--     GRANT UPDATE, DELETE ON public.audit_log TO authenticated;
--     GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log TO anon;
--     CREATE POLICY audit_log_delete_own_org  ON public.audit_log FOR DELETE TO authenticated USING ((org_id = public.current_org_id()));
--     CREATE POLICY audit_log_delete_operator ON public.audit_log FOR DELETE TO authenticated USING (public.is_operator());
--     CREATE POLICY audit_log_update_own_org  ON public.audit_log FOR UPDATE TO authenticated USING ((org_id = public.current_org_id())) WITH CHECK ((org_id = public.current_org_id()));
--     CREATE POLICY audit_log_update_operator ON public.audit_log FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
--     DROP INDEX IF EXISTS public.idx_audit_log_org_created;
--   COMMIT;

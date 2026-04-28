-- ════════════════════════════════════════════════════════════════════════════
-- Velo CRM — first-org creation: cleanup + SECURITY DEFINER function
-- ════════════════════════════════════════════════════════════════════════════
--
-- This migration ships in three sections:
--   1. CLEANUP: undo the two failed RLS-fix attempts. Restores
--      organizations RLS to its security-migration.sql state.
--   2. PIVOT:  install create_first_org() — SECURITY DEFINER function
--      that bypasses RLS for the single operation that needs to (first
--      org creation during Onboarding step 1).
--   3. VERIFICATION: confirm function exists with correct properties,
--      and confirm RLS state on organizations matches expected.
--
-- BACKGROUND
-- The Onboarding step 1 first-org INSERT was blocked by an RLS policy
-- interaction we exhaustively diagnosed and could not fully explain. The
-- same FOR ALL policy idiom that works for treatments/prescriptions/xrays
-- inserts on this Supabase instance does not work for organizations.
-- After ruling out: command-type groups, triggers, CHECK constraints,
-- RESTRICTIVE policies, GRANTs, role inheritance, FORCE RLS, role
-- assignments — we pivoted to a SECURITY DEFINER function that bypasses
-- RLS entirely for first-org creation.
--
-- Two prior RLS-fix attempts existed on this branch (untracked, never
-- committed):
--   - scripts/onboarding-first-org-rls.sql      (added permissive INSERT
--                                               policy — didn't fix)
--   - scripts/onboarding-org-rls-with-check.sql (added explicit WITH
--                                               CHECK with carve-out —
--                                               didn't fix either)
-- Both files are removed from disk as part of this commit. Section 1
-- below undoes their effect on the live Supabase schema.
--
-- DEFERRED ARCHITECTURE CLEANUP (post-demo)
-- The current state of organizations RLS — 1 FOR ALL + per-command
-- policies from schema_v2.sql — is messy and the FOR ALL idiom hid the
-- original bug for months. Post-demo: split organizations_own_org into
-- explicit FOR SELECT/UPDATE/DELETE policies, drop org_insert WITH CHECK
-- TRUE (over-permissive). Tracked in MEMORY.md Deferred follow-ups
-- (inline).
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — CLEANUP: undo the two failed RLS-fix attempts
-- ════════════════════════════════════════════════════════════════════════════
-- Restores organizations RLS to the state security-migration.sql:154-159
-- left it in (organizations_own_org FOR ALL with USING and no explicit
-- WITH CHECK). DROP IF EXISTS makes this safe to re-run and safe to run
-- against environments where the failed attempts were never applied.
-- The CREATE POLICY syntax matches security-migration.sql exactly — no
-- schema prefix on the table, identical USING clause structure.

DROP POLICY IF EXISTS "organizations_insert_first_org" ON organizations;

DROP POLICY IF EXISTS "organizations_own_org" ON organizations;
CREATE POLICY "organizations_own_org" ON organizations
  FOR ALL
  USING (
    id = get_user_org_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — PIVOT: install create_first_org() SECURITY DEFINER function
-- ════════════════════════════════════════════════════════════════════════════
--
-- DESIGN
-- Function signature:
--   public.create_first_org(
--     org_name     TEXT,
--     org_slug     TEXT,
--     org_color    TEXT,
--     org_industry TEXT
--   ) RETURNS public.organizations
--
-- Body (single transaction; rolls back on any failure):
--   1. Resolve auth.uid() — RAISE if NULL (must be authenticated).
--   2. Look up caller's profile.org_id — RAISE if profile not found.
--      RAISE if profile.org_id IS NOT NULL (already in an org; cannot
--      create another).
--   3. INSERT new organization (plan/status default per
--      security-migration.sql column defaults: 'free', 'active').
--   4. UPDATE caller's profile to set org_id = new_org.id and
--      role = 'admin'.
--   5. RETURN the new organization row.
--
-- SECURITY: SECURITY DEFINER + search_path
-- Function runs as its owner (postgres role) which bypasses RLS.
-- Mitigations:
--   - SET search_path = pg_catalog, public — prevents search-path
--     injection (a known Postgres vulnerability with SECURITY DEFINER
--     functions).
--   - Function body is the ONLY access path. Body has explicit guards
--     replicating the constraints the failed RLS WITH CHECK attempted:
--     auth.uid() not NULL, profile exists, profile.org_id IS NULL.
--   - INSERT/UPDATE scoped to organizations + caller's own profile
--     (WHERE id = auth.uid()). No path to other orgs/users.
--
-- SECURITY: GRANT
-- REVOKE EXECUTE FROM PUBLIC, GRANT to authenticated only. Service role
-- retains bypass-everything. Anon cannot call (API gateway blocks at the
-- GRANT layer; the function's auth.uid() guard is defense-in-depth).
--
-- THREAT MODEL
--   - Authenticated user, no org (just signed up):
--       Guards pass → INSERT + UPDATE succeed → returns new org row.
--       Desired.
--   - Authenticated user, already in an org:
--       org_id IS NULL guard fails → RAISE → client receives error.
--       Cannot create additional orgs.
--   - Loop attack:
--       First call succeeds; profile.org_id set; subsequent calls fail
--       at the guard. Self-resetting limit of one org per user.
--   - Anon:
--       No EXECUTE permission → API gateway blocks. auth.uid() guard
--       defense-in-depth.
--   - SQL injection:
--       Typed TEXT params, parameterized binding, no dynamic EXECUTE.
--   - Privilege escalation:
--       Function only INSERTs into organizations and UPDATEs caller's
--       own profile. No write path to other users/orgs.
--
-- IDEMPOTENT
-- CREATE OR REPLACE FUNCTION + idempotent GRANT/REVOKE. Re-runs safe.

CREATE OR REPLACE FUNCTION public.create_first_org(
  org_name     TEXT,
  org_slug     TEXT,
  org_color    TEXT,
  org_industry TEXT
)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller_id     UUID;
  caller_org_id UUID;
  new_org       public.organizations%ROWTYPE;
BEGIN
  -- Guard 1: must be authenticated
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'create_first_org: not authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- Guard 2: profile must exist and have no org yet
  SELECT org_id INTO caller_org_id
  FROM public.profiles
  WHERE id = caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_first_org: profile not found for user %', caller_id
      USING ERRCODE = '42501';
  END IF;

  IF caller_org_id IS NOT NULL THEN
    RAISE EXCEPTION 'create_first_org: user % already belongs to org %',
                    caller_id, caller_org_id
      USING ERRCODE = '42501';
  END IF;

  -- Insert the new organization. plan and status default per
  -- security-migration.sql column defaults ('free', 'active').
  INSERT INTO public.organizations (name, slug, primary_color, industry)
  VALUES (org_name, org_slug, org_color, org_industry)
  RETURNING * INTO new_org;

  -- Link the caller to the new org as admin
  UPDATE public.profiles
  SET org_id = new_org.id,
      role   = 'admin'
  WHERE id = caller_id;

  RETURN new_org;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_first_org(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_first_org(TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — VERIFICATION
-- ════════════════════════════════════════════════════════════════════════════
-- Two queries:
--   (a) Confirm create_first_org() exists with correct properties:
--       SECURITY DEFINER, search_path set, EXECUTE granted to authenticated.
--   (b) Confirm cleanup landed: organizations RLS state matches the
--       security-migration.sql original — organizations_own_org has its
--       USING clause back, with_check_clause is NULL,
--       organizations_insert_first_org is absent.

-- (a) Function verification
SELECT
  p.proname                                       AS function_name,
  p.prosecdef                                     AS is_security_definer,
  pg_catalog.pg_get_function_arguments(p.oid)     AS arguments,
  pg_catalog.pg_get_function_result(p.oid)        AS returns,
  p.proconfig                                     AS config_settings,
  pg_catalog.array_to_string(p.proacl, E'\n')     AS acl
FROM pg_catalog.pg_proc p
WHERE p.proname     = 'create_first_org'
  AND p.pronamespace = 'public'::regnamespace;

-- (b) Organizations RLS state after cleanup
SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual        AS using_clause,
  with_check  AS with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'organizations'
ORDER BY policyname;

-- ============================================================================
-- seed-staging-search-test.sql
-- ----------------------------------------------------------------------------
-- ⛔ DO NOT RUN ON PRODUCTION. STAGING ONLY (project ref: dujnbboyeugrisgewnqu).
--
-- Purpose: create a single test org + ~150 patients so SB-2 server-side patient
-- search can be proven. The patient list (src/lib/database.js -> fetchPatients)
-- loads only PATIENTS_PAGE_SIZE = 100 rows, ordered by created_at DESC, and the
-- OLD behaviour filtered those 100 client-side. This seed plants ONE patient
-- with a far-older created_at so it lands at ~row 150 (PAST the 100-row page):
--   • OLD client filter  -> never loads it  -> search returns NOTHING.
--   • NEW searchPatients -> ILIKE over the whole org -> FINDS it.
-- That single target is the proof.
--
-- SAFETY:
--   • Tripwire below ABORTS if the Le Royal production org is present.
--   • Run with psql -v ON_ERROR_STOP=1 so the tripwire actually halts the run.
--   • Whole thing is one transaction; any error rolls everything back.
--   • Re-runnable: it DELETEs this test org's patients first, then reseeds.
--     The DELETE is scoped to the dedicated test org only.
--
-- NOTE on the owner profile: public.profiles.id is a FK to auth.users(id), so a
-- profile CANNOT be created by SQL alone — an auth user must exist first. This
-- script binds an owner profile ONLY IF an auth user with the email below already
-- exists (create it via Supabase Auth dashboard -> Add user, then re-run). The
-- ~150 patients seed regardless — they need only the org, not a profile, and
-- this script runs as the postgres role (RLS bypassed) so no session is needed.
-- The owner profile is only required later, to LOG IN and exercise search in the
-- app UI.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_org_id      uuid;
  v_le_royal    uuid := '66f75f33-40b0-4f00-bf33-b9ac1c20af46';  -- prod tripwire
  v_owner_email text := 'staging-owner@velo.test';               -- change if you used another
  v_owner_uid   uuid;
  v_target_id   uuid := gen_random_uuid();
  v_first       text[] := ARRAY[
    'Ahmed','Mohammed','Ali','Hassan','Hussein','Omar','Yusuf','Karim',
    'Mustafa','Sami','Zaid','Bilal','Fatima','Zainab','Maryam','Noor',
    'Huda','Aisha','Rana','Sara','Layla','Dina','Hala','Yara'];
  v_last        text[] := ARRAY[
    'Al-Bayati','Al-Mansour','Al-Obeidi','Al-Dulaimi','Al-Jubouri','Al-Hashimi',
    'Al-Saadi','Al-Khafaji','Al-Tikriti','Al-Najjar','Al-Rawi','Al-Azzawi',
    'Al-Samarrai','Al-Janabi','Al-Maliki','Kurdi','Salih','Ibrahim'];
BEGIN
  -- 0. PRODUCTION TRIPWIRE -----------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.orgs WHERE id = v_le_royal) THEN
    RAISE EXCEPTION
      'ABORT: Le Royal production org (%) is present — this looks like PRODUCTION. '
      'This seed is STAGING-ONLY. Refusing to run.', v_le_royal;
  END IF;

  -- 1. Test org (idempotent by slug) ------------------------------------------
  SELECT id INTO v_org_id FROM public.orgs WHERE slug = 'staging-search-test';
  IF v_org_id IS NULL THEN
    INSERT INTO public.orgs (name, slug, status)
    VALUES ('Staging Search Test Clinic', 'staging-search-test', 'test')
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created test org %', v_org_id;
  ELSE
    RAISE NOTICE 'Reusing existing test org %', v_org_id;
  END IF;

  -- 2. Owner profile — ONLY if a matching auth user already exists -------------
  --    (profiles.id FK -> auth.users.id; INSERT bypasses the role-immutability
  --     trigger, which is BEFORE UPDATE only.)
  SELECT id INTO v_owner_uid FROM auth.users WHERE email = v_owner_email;
  IF v_owner_uid IS NOT NULL THEN
    INSERT INTO public.profiles (id, org_id, role, full_name)
    VALUES (v_owner_uid, v_org_id, 'owner', 'Staging Test Owner')
    ON CONFLICT (id) DO UPDATE
      SET org_id = EXCLUDED.org_id, full_name = EXCLUDED.full_name;  -- role left as-is on re-run
    RAISE NOTICE 'Bound owner profile % to org %', v_owner_uid, v_org_id;
  ELSE
    RAISE NOTICE
      'No auth user "%" found — owner profile NOT created. To log in and test in '
      'the app: Supabase dashboard -> Authentication -> Add user (this email), '
      'then re-run this script. Patients are seeded regardless.', v_owner_email;
  END IF;

  -- 3. Clean slate for THIS test org only --------------------------------------
  DELETE FROM public.patients WHERE org_id = v_org_id;

  -- 4. TARGET patient — far-oldest created_at so it sorts to ~row 150 ----------
  --    Distinctive token "Searchtarget" so it never substring-collides with a
  --    filler name. This is the name you search for to prove server-side search.
  INSERT INTO public.patients (id, org_id, full_name, phone, created_at, updated_at)
  VALUES (
    v_target_id, v_org_id,
    'Zubaida Searchtarget Al-Mansour',
    '+964 750 100 0000',
    now() - interval '3 years',
    now() - interval '3 years');

  -- 5. 149 filler patients — ALL newer than the target (rows 1..149) -----------
  --    Varied names from the pools above; phones unique per org; created_at
  --    strictly within the last ~6 days so none predates the target.
  INSERT INTO public.patients (org_id, full_name, phone, created_at, updated_at)
  SELECT
    v_org_id,
    v_first[1 + (g.i % array_length(v_first, 1))] || ' '
      || v_last[1 + (g.i % array_length(v_last, 1))],
    '+964 750 100 ' || lpad(g.i::text, 4, '0'),
    now() - (g.i * interval '1 hour'),
    now() - (g.i * interval '1 hour')
  FROM generate_series(1, 149) AS g(i);

  RAISE NOTICE
    'Seeded 150 patients into org % (1 target "Zubaida Searchtarget Al-Mansour" '
    '+ 149 fillers). Search "Searchtarget" to prove SB-2.', v_org_id;
END $$;

COMMIT;


-- ============================================================================
-- VERIFICATION (run after the transaction commits)
-- ============================================================================

-- 4a. Total count for the test org — expect 150.
SELECT count(*) AS patient_count
FROM public.patients p
JOIN public.orgs o ON o.id = p.org_id
WHERE o.slug = 'staging-search-test';

-- 4b. Confirm the target sorts PAST row 100 in the list's ordering
--     (created_at DESC, exactly what fetchPatients uses). Expect rank = 150.
WITH ranked AS (
  SELECT p.full_name,
         row_number() OVER (ORDER BY p.created_at DESC) AS list_rank
  FROM public.patients p
  JOIN public.orgs o ON o.id = p.org_id
  WHERE o.slug = 'staging-search-test'
)
SELECT full_name, list_rank
FROM ranked
WHERE full_name ILIKE '%Searchtarget%';   -- expect a single row with list_rank = 150

-- 4c. Sanity: the SAME query searchPatients runs (server-side ILIKE) DOES find
--     the target even though it is past the 100-row page.
SELECT id, full_name, phone, created_at
FROM public.patients p
JOIN public.orgs o ON o.id = p.org_id
WHERE o.slug = 'staging-search-test'
  AND p.full_name ILIKE '%Searchtarget%';

-- In the APP: open the patients list, confirm the target is NOT on the first
-- page (scroll/observe it loads 100), then type "Searchtarget" in search. The
-- old client filter returns nothing; SB-2 server search returns the one patient.


-- ============================================================================
-- CLEANUP (uncomment to remove everything this script created)
-- ----------------------------------------------------------------------------
--   DELETE FROM public.patients
--    WHERE org_id = (SELECT id FROM public.orgs WHERE slug = 'staging-search-test');
--   -- Optionally drop the test org too (only if no profiles/other rows depend on it):
--   -- DELETE FROM public.orgs WHERE slug = 'staging-search-test';
-- ============================================================================

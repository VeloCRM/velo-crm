-- ============================================================================
-- seed-demo-patient-ahmed-hassan.sql
-- ----------------------------------------------------------------------------
-- Rich demo patient for the Dr. Saif demonstration. Exercises the dental chart
-- (6 findings incl. fracture + wear), X-rays (4), a treatment plan (3 items),
-- a prescription, and a patient note — all under the Le Royal org.
--
-- TEST DATA ONLY. A commented cleanup section at the bottom removes it.
--
-- HOW TO RUN
--   Supabase  →  Production project  →  SQL Editor  →  paste this whole file →
--   Run. It executes as one transaction; any error rolls the whole thing back.
--   Run it ONCE (patients has UNIQUE(org_id, phone), so a re-run aborts cleanly).
--
-- AFTER RUNNING — X-ray images (the rows are metadata only):
--   The X-ray UI's upload flow creates its OWN rows, so to avoid duplicates pick
--   one of:
--     (A) RECOMMENDED — open the patient's X-rays tab and upload 4 sample images
--         via the UI with the metadata listed below, then run the "X-ray
--         placeholder cleanup" delete at the bottom to drop these 4 seeded rows.
--     (B) ADVANCED — upload 4 image files directly into the `patient-xrays`
--         Storage bucket at the EXACT storage_path values printed by the
--         verification query below (path = {org_id}/{patient_id}/{xray_id}.jpg).
--         Then these seeded rows render fully (grid + lightbox) with no dupes.
--   The seeded rows have no thumbnail, so until an image exists they show as a
--   placeholder tile in the grid (metadata/type/date/teeth/notes are correct).
--
-- IDENTITY RESOLUTION (no guessed UUIDs):
--   • org_id is the known Le Royal id (verified below; aborts if absent).
--   • doctor_id is resolved to a role='doctor' profile in Le Royal — the
--     prescriptions trigger (enforce_prescription_doctor_role) REQUIRES this.
--     It prefers alialjobory89@gmail.com if that account is a doctor; otherwise
--     it falls back to any doctor in the org (a NOTICE prints which was used).
--   • created_by audit columns use alialjobory89's auth.users id (may be NULL —
--     those columns are nullable).
--
-- SCHEMA NOTES (verified against src/lib/schema.sql + scripts/xray-module-migration.sql):
--   • patients has NO notes column      → patient note inserted into `notes` table.
--   • treatment_plans has NO title      → plan name stored in `notes` ("Restorative Phase").
--   • treatment_plan_items has NO FK to dental_chart_entries → items "link" to
--     findings only by tooth_number/surface; procedure_code is NOT NULL.
--   • dental finding "Root Canal"        = enum value 'root_canal_done'.
--   • surface 'incisal' is DISPLAY-ONLY  → stored as 'occlusal' for anterior teeth
--     (11, 21); whole-tooth findings (crown, root_canal_done) store surface NULL.
--   • IQD amounts: minor units == whole IQD (divisor 1), so amount_minor = IQD.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_org_id     uuid := '66f75f33-40b0-4f00-bf33-b9ac1c20af46';  -- Le Royal
  v_user_id    uuid;        -- alialjobory89@gmail.com (auth.users) → created_by
  v_doctor_id  uuid;        -- a role='doctor' profile in Le Royal (Rx trigger)
  v_patient_id uuid := gen_random_uuid();
  v_plan_id    uuid := gen_random_uuid();
  v_rx_id      uuid := gen_random_uuid();
  v_xr_pano    uuid := gen_random_uuid();
  v_xr_biteR   uuid := gen_random_uuid();
  v_xr_biteL   uuid := gen_random_uuid();
  v_xr_pa11    uuid := gen_random_uuid();
  v_bite_batch uuid := gen_random_uuid();   -- groups the two bitewings (mimics a batch upload)
  v_plan_total bigint;
BEGIN
  -- 0. Verify the org exists --------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = v_org_id) THEN
    RAISE EXCEPTION 'Le Royal org % not found — verify org_id before seeding.', v_org_id;
  END IF;

  -- Demo user (for created_by audit columns; nullable so NULL is acceptable).
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'alialjobory89@gmail.com';

  -- Resolve a doctor-role profile (prescriptions REQUIRE role=doctor in-org).
  SELECT id INTO v_doctor_id
    FROM public.profiles
   WHERE org_id = v_org_id AND role = 'doctor' AND id = v_user_id;
  IF v_doctor_id IS NULL THEN
    SELECT id INTO v_doctor_id
      FROM public.profiles
     WHERE org_id = v_org_id AND role = 'doctor'
     ORDER BY created_at
     LIMIT 1;
  END IF;
  IF v_doctor_id IS NULL THEN
    RAISE EXCEPTION 'No role=doctor profile in Le Royal — the prescription insert would fail. Create/assign a doctor first.';
  END IF;
  RAISE NOTICE 'Seeding with doctor_id=%, created_by user_id=%', v_doctor_id, v_user_id;

  -- 1. Patient ----------------------------------------------------------------
  INSERT INTO public.patients
    (id, org_id, full_name, phone, email, dob, gender, allergies, primary_doctor_id, created_at, updated_at)
  VALUES
    (v_patient_id, v_org_id, 'Ahmed Hassan Al-Bayati', '+964 750 123 4567',
     'ahmed.hassan@example.com', DATE '1985-03-15', 'male',
     '["Penicillin"]'::jsonb, v_doctor_id, now() - interval '14 days', now() - interval '14 days');

  -- Patient note (patients has no notes column → notes table; shows in Notes tab)
  INSERT INTO public.notes
    (org_id, patient_id, body, title, pinned, created_by, created_at)
  VALUES
    (v_org_id, v_patient_id, 'Regular checkup patient. Last cleaning 6 months ago.',
     'Patient summary', true, v_user_id, now() - interval '14 days');

  -- 2. Dental chart entries (6) ----------------------------------------------
  --    surface: 5 standard values; 'occlusal' = center wedge (shown as "Incisal"
  --    for anterior teeth 11/21). Whole-tooth findings → surface NULL.
  INSERT INTO public.dental_chart_entries
    (org_id, patient_id, tooth_number, surface, finding, notes, recorded_by, recorded_at)
  VALUES
    (v_org_id, v_patient_id, 16, 'occlusal', 'cavity',
     'Deep cavity in occlusal pit, requires composite restoration', v_doctor_id, now() - interval '3 days'),
    (v_org_id, v_patient_id, 26, 'mesial', 'restoration',
     'Existing amalgam restoration, intact, no replacement needed', v_doctor_id, now() - interval '1 year'),
    (v_org_id, v_patient_id, 36, NULL, 'crown',
     'PFM crown placed 2024, in good condition', v_doctor_id, TIMESTAMPTZ '2024-06-15 10:00:00+00'),
    (v_org_id, v_patient_id, 46, NULL, 'root_canal_done',
     'RCT completed 2024, asymptomatic', v_doctor_id, TIMESTAMPTZ '2024-08-20 11:30:00+00'),
    (v_org_id, v_patient_id, 11, 'occlusal', 'fracture',
     'Recent fracture from biting hard object, needs evaluation', v_doctor_id, now() - interval '1 day'),
    (v_org_id, v_patient_id, 21, 'occlusal', 'wear',
     'Generalized incisal wear suggesting nocturnal bruxism, recommend night guard', v_doctor_id, now() - interval '3 days');

  -- 3. Treatment plan + items -------------------------------------------------
  --    No FK to findings exists, so items reference the same tooth/surface as the
  --    related chart finding. Plan total = sum of item amounts (IQD whole units).
  v_plan_total := 50000 + 50000 + 150000;  -- 250,000 IQD

  INSERT INTO public.treatment_plans
    (id, org_id, patient_id, doctor_id, status, total_amount_minor, currency, notes, created_at, updated_at)
  VALUES
    (v_plan_id, v_org_id, v_patient_id, v_doctor_id, 'in_progress', v_plan_total, 'IQD',
     'Restorative Phase', now() - interval '5 days', now() - interval '5 days');

  INSERT INTO public.treatment_plan_items
    (org_id, treatment_plan_id, tooth_number, surface, procedure_code, procedure_label, amount_minor, currency, status, sequence)
  VALUES
    -- → Cavity finding on 16
    (v_org_id, v_plan_id, 16, 'occlusal', 'composite_filling', 'Composite filling tooth 16',
     50000, 'IQD', 'in_progress', 1),
    -- → Fracture finding on 11
    (v_org_id, v_plan_id, 11, NULL, 'crown_evaluation', 'Crown evaluation tooth 11',
     50000, 'IQD', 'pending', 2),
    -- → Wear finding on 21 (whole-mouth appliance; tooth_number left NULL)
    (v_org_id, v_plan_id, NULL, NULL, 'night_guard', 'Night guard for bruxism',
     150000, 'IQD', 'pending', 3);

  -- 4. X-rays (4) — METADATA rows (see header for the image-upload step) -------
  --    teeth_shown is text[] of FDI strings; storage_path follows the bucket
  --    convention {org_id}/{patient_id}/{xray_id}.jpg.
  INSERT INTO public.xrays
    (id, org_id, patient_id, file_name, storage_path, mime_type, xray_type, date_taken, teeth_shown, notes, batch_id, uploaded_by, created_at, updated_at)
  VALUES
    (v_xr_pano, v_org_id, v_patient_id, 'panoramic-annual.jpg',
     v_org_id::text || '/' || v_patient_id::text || '/' || v_xr_pano::text || '.jpg',
     'image/jpeg', 'panoramic', CURRENT_DATE - 14, '{}'::text[],
     'Annual panoramic review', NULL, v_doctor_id, now() - interval '14 days', now() - interval '14 days'),

    (v_xr_biteR, v_org_id, v_patient_id, 'bitewing-right.jpg',
     v_org_id::text || '/' || v_patient_id::text || '/' || v_xr_biteR::text || '.jpg',
     'image/jpeg', 'bitewing', CURRENT_DATE - 7, ARRAY['16','17','46','47'],
     'Right side bitewings', v_bite_batch, v_doctor_id, now() - interval '7 days', now() - interval '7 days'),

    (v_xr_biteL, v_org_id, v_patient_id, 'bitewing-left.jpg',
     v_org_id::text || '/' || v_patient_id::text || '/' || v_xr_biteL::text || '.jpg',
     'image/jpeg', 'bitewing', CURRENT_DATE - 7, ARRAY['26','27','36','37'],
     'Left side bitewings', v_bite_batch, v_doctor_id, now() - interval '7 days', now() - interval '7 days'),

    (v_xr_pa11, v_org_id, v_patient_id, 'periapical-11.jpg',
     v_org_id::text || '/' || v_patient_id::text || '/' || v_xr_pa11::text || '.jpg',
     'image/jpeg', 'periapical', CURRENT_DATE, ARRAY['11'],
     'Evaluation of recent fracture', NULL, v_doctor_id, now(), now());

  -- 5. Prescription + item (issued ~1 week ago) -------------------------------
  INSERT INTO public.prescriptions
    (id, org_id, patient_id, doctor_id, issued_at, general_instructions, created_by, created_at)
  VALUES
    (v_rx_id, v_org_id, v_patient_id, v_doctor_id, now() - interval '7 days',
     'Post-extraction prophylaxis. Complete the full course.', v_user_id, now() - interval '7 days');

  INSERT INTO public.prescription_items
    (org_id, prescription_id, drug_name, dosage, frequency, duration, instructions, sort_order)
  VALUES
    (v_org_id, v_rx_id, 'Amoxicillin', '500 mg', '3 times daily', '7 days',
     'Post-extraction prophylaxis', 0);

  RAISE NOTICE 'Seeded demo patient % (Ahmed Hassan Al-Bayati): 6 chart entries, 4 x-rays, 1 plan (3 items), 1 prescription, 1 note.', v_patient_id;
END $$;

COMMIT;


-- ============================================================================
-- VERIFICATION (run after the transaction commits)
-- ============================================================================

-- Patient + per-table counts (also prints the storage_path values you need for
-- option (B) image upload).
SELECT
  p.id              AS patient_id,
  p.full_name,
  p.phone,
  p.dob,
  p.gender,
  p.allergies,
  (SELECT count(*) FROM public.dental_chart_entries d WHERE d.patient_id = p.id) AS chart_entries,
  (SELECT count(*) FROM public.xrays x                WHERE x.patient_id = p.id) AS xrays,
  (SELECT count(*) FROM public.treatment_plans tp     WHERE tp.patient_id = p.id) AS plans,
  (SELECT count(*) FROM public.treatment_plan_items i
     JOIN public.treatment_plans tp ON tp.id = i.treatment_plan_id
    WHERE tp.patient_id = p.id) AS plan_items,
  (SELECT count(*) FROM public.prescriptions r        WHERE r.patient_id = p.id) AS prescriptions,
  (SELECT count(*) FROM public.notes n                WHERE n.patient_id = p.id) AS notes
FROM public.patients p
WHERE p.org_id = '66f75f33-40b0-4f00-bf33-b9ac1c20af46'
  AND p.phone  = '+964 750 123 4567';

-- X-ray storage paths (for option (B): upload each image to this exact path in
-- the patient-xrays bucket).
-- SELECT file_name, xray_type, date_taken, teeth_shown, storage_path
--   FROM public.xrays x
--   JOIN public.patients p ON p.id = x.patient_id
--  WHERE p.phone = '+964 750 123 4567'
--  ORDER BY x.date_taken;


-- ============================================================================
-- CLEANUP (post-demo) — uncomment to run
-- ----------------------------------------------------------------------------
-- Deleting the patient CASCADES to: dental_chart_entries, xrays, treatment_plans
-- (→ treatment_plan_items), prescriptions (→ prescription_items), and notes.
-- (Appointments/payments would cascade too — none seeded here.)
--
--   DELETE FROM public.patients
--    WHERE org_id = '66f75f33-40b0-4f00-bf33-b9ac1c20af46'
--      AND phone  = '+964 750 123 4567';
--
-- NOTE: the row cascade does NOT remove uploaded image files from the
-- patient-xrays Storage bucket. If you uploaded images (option A or B), also
-- delete that patient's folder from the bucket in the Storage UI.
--
-- ----------------------------------------------------------------------------
-- X-RAY PLACEHOLDER CLEANUP (option A only) — after uploading real images via
-- the UI, drop the 4 seeded metadata rows so the tab doesn't show duplicates:
--
--   DELETE FROM public.xrays x
--    USING public.patients p
--    WHERE x.patient_id = p.id
--      AND p.phone = '+964 750 123 4567'
--      AND x.file_name IN ('panoramic-annual.jpg','bitewing-right.jpg','bitewing-left.jpg','periapical-11.jpg');
-- ============================================================================

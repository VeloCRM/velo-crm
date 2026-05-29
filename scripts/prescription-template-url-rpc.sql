-- ============================================================================
-- set_prescription_template_url — SECURITY DEFINER RPC
-- ============================================================================
-- Fixes the core "prescription_template_url stays NULL" bug.
--
-- ─── Why this exists ───────────────────────────────────────────────────────
-- The only profiles UPDATE policies are profiles_update_self (id = auth.uid())
-- and profiles_update_operator (is_operator()). So when an OWNER uploads a
-- template FOR ANOTHER DOCTOR, the UPDATE
--   UPDATE profiles SET prescription_template_url = ... WHERE id = <doctor>
-- matches 0 rows under RLS and PostgREST returns SUCCESS WITH NO ERROR. The
-- column never changes, but the UI sees no error → false-success toast, and the
-- value is "gone" after refresh.
--
-- This SECURITY DEFINER function runs as its owner (bypassing profiles RLS) and
-- enforces authorization itself: operator, OR a same-org owner (any doctor), OR
-- the doctor themselves. It touches ONLY prescription_template_url, so the
-- profiles_enforce_immutable trigger (which gates role/org_id/id) is unaffected.
-- Pass p_path = NULL to clear the template (used by the delete helper).
--
-- ─── How to apply ──────────────────────────────────────────────────────────
-- 1. supabase.com → velo-crm project → SQL editor → New query → paste → run
-- 2. Verify the function exists:
--    SELECT proname, prosecdef FROM pg_proc
--      WHERE proname = 'set_prescription_template_url';
--    -- Expect 1 row, prosecdef = true (SECURITY DEFINER)
--
-- Idempotent (CREATE OR REPLACE + idempotent GRANT/REVOKE). Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_prescription_template_url(
  p_doctor_id uuid,
  p_path      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_caller_org  uuid;
  v_target_org  uuid;
BEGIN
  IF p_doctor_id IS NULL THEN
    RAISE EXCEPTION 'set_prescription_template_url: doctor_id is required';
  END IF;

  SELECT role, org_id INTO v_caller_role, v_caller_org
  FROM public.profiles WHERE id = auth.uid();

  SELECT org_id INTO v_target_org
  FROM public.profiles WHERE id = p_doctor_id;

  IF v_target_org IS NULL THEN
    RAISE EXCEPTION 'set_prescription_template_url: target doctor profile not found';
  END IF;

  -- Authorization: operator, OR same-org owner (any doctor), OR the doctor self.
  IF public.is_operator()
     OR (
       v_caller_org IS NOT NULL
       AND v_caller_org = v_target_org
       AND (v_caller_role = 'owner' OR auth.uid() = p_doctor_id)
     ) THEN
    UPDATE public.profiles
      SET prescription_template_url = p_path
      WHERE id = p_doctor_id;
  ELSE
    RAISE EXCEPTION 'set_prescription_template_url: not authorized to set the prescription template for this doctor';
  END IF;
END;
$$;

REVOKE ALL    ON FUNCTION public.set_prescription_template_url(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_prescription_template_url(uuid, text) TO authenticated;

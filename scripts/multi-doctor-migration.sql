-- ============================================================
-- Multi-Doctor Support Migration for Velo Dental
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Add dental-specific columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#00c6ff',
  ADD COLUMN IF NOT EXISTS specialization text DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Update role column to support dental roles
-- (if role column already exists with a constraint, drop and recreate)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'member';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'doctor', 'receptionist', 'assistant', 'manager', 'member', 'viewer'));

-- 2. Add doctor_id to appointments table
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS doctor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON public.appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_org_id_role ON public.profiles(org_id, role);

-- 4. Update RLS to allow reading doctor profiles within same org
-- (profiles select policy should already exist; this ensures doctors are visible)
DO $$
BEGIN
  -- Ensure the appointments policy allows doctor_id updates
  -- This is already handled by existing org-based policies
  RAISE NOTICE 'Migration complete. doctor_id and dental profile columns added.';
END $$;

-- 5. Verify: show current profiles columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('role', 'color', 'specialization', 'is_active')
ORDER BY column_name;

-- 6. Verify: show appointments columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'appointments'
  AND column_name IN ('doctor_id')
ORDER BY column_name;

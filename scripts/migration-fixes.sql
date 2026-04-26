-- ═══════════════════════════════════════════════════════════════
-- FIX 2: CASCADE DELETES
-- ═══════════════════════════════════════════════════════════════

-- Ensure deals cascade on contact deletion
ALTER TABLE deals 
  DROP CONSTRAINT IF EXISTS deals_contact_id_fkey,
  ADD CONSTRAINT deals_contact_id_fkey 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) 
  ON DELETE CASCADE;

-- Ensure tickets cascade on contact deletion
ALTER TABLE tickets 
  DROP CONSTRAINT IF EXISTS tickets_contact_id_fkey,
  ADD CONSTRAINT tickets_contact_id_fkey 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) 
  ON DELETE CASCADE;

-- Ensure appointments cascade on contact deletion
ALTER TABLE appointments 
  DROP CONSTRAINT IF EXISTS appointments_contact_id_fkey,
  ADD CONSTRAINT appointments_contact_id_fkey 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) 
  ON DELETE CASCADE;

-- Ensure activities cascade on contact deletion
ALTER TABLE activities 
  DROP CONSTRAINT IF EXISTS activities_contact_id_fkey,
  ADD CONSTRAINT activities_contact_id_fkey 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) 
  ON DELETE CASCADE;

-- Ensure treatment plans cascade on contact deletion
ALTER TABLE treatment_plans 
  DROP CONSTRAINT IF EXISTS treatment_plans_contact_id_fkey,
  ADD CONSTRAINT treatment_plans_contact_id_fkey 
  FOREIGN KEY (contact_id) REFERENCES contacts(id) 
  ON DELETE CASCADE;

-- Ensure invoices cascade on organization deletion
ALTER TABLE invoices 
  DROP CONSTRAINT IF EXISTS invoices_org_id_fkey,
  ADD CONSTRAINT invoices_org_id_fkey 
  FOREIGN KEY (org_id) REFERENCES organizations(id) 
  ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- FIX 3: GHL Data Fixes
-- ═══════════════════════════════════════════════════════════════

-- 1. Show how many contacts have empty email
-- SELECT count(*) FROM contacts WHERE email IS NULL OR email = '';

-- 2. Show how many contacts have empty city
-- SELECT count(*) FROM contacts WHERE city IS NULL OR city = '';

-- 3. Add columns for data_source and import_date
ALTER TABLE contacts 
  ADD COLUMN IF NOT EXISTS data_source text,
  ADD COLUMN IF NOT EXISTS import_date date;

-- Update the imported records
UPDATE contacts 
SET 
  data_source = 'ghl_import', 
  import_date = '2026-04-05' 
WHERE 
  "source" = 'ghl_import' 
  OR 'ghl_import' = ANY(tags);

-- ═══════════════════════════════════════════════════════════════
-- FIX 4: TRIAL PERIOD COLUMNS & SUBSCRIPTION AUTO-SUSPEND LOGGING
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE organizations 
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz;

CREATE TABLE IF NOT EXISTS subscription_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

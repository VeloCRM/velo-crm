-- Velo CRM — Expand profile roles
-- Run once in Supabase SQL editor. Adds Doctor / Receptionist / Assistant.
--
-- The client maps legacy values ('editor' → receptionist, 'member' → assistant)
-- in src/lib/permissions.js, so no data migration is strictly required.
-- Still, we expand the CHECK constraint so new role values can be written.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'admin',
    'doctor',
    'receptionist',
    'assistant',
    'viewer',
    -- Legacy values retained for backward compatibility with rows created
    -- before this migration. Safe to delete once all rows have been migrated.
    'editor',
    'manager',
    'member'
  ));

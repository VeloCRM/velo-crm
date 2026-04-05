-- SupCRM v2.0 Security Migration
-- Run this in your Supabase SQL Editor

-- ═══════════════════════════════════════════════════════════════
-- AUDIT LOG TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,           -- 'create', 'update', 'delete', 'login', 'logout'
  entity text,                    -- 'contact', 'deal', 'ticket', 'payment', 'org'
  entity_id uuid,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id);

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — Complete org_id Isolation
-- ═══════════════════════════════════════════════════════════════

-- Helper function: get current user's org_id from profiles
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── Contacts RLS ──
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_org_isolation" ON contacts;
CREATE POLICY "contacts_org_isolation" ON contacts
  FOR ALL
  USING (
    user_id IN (SELECT id FROM profiles WHERE org_id = get_user_org_id())
  )
  WITH CHECK (
    user_id = auth.uid()
  );

-- ── Deals RLS ──
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deals_org_isolation" ON deals;
CREATE POLICY "deals_org_isolation" ON deals
  FOR ALL
  USING (
    user_id IN (SELECT id FROM profiles WHERE org_id = get_user_org_id())
  )
  WITH CHECK (
    user_id = auth.uid()
  );

-- ── Tickets RLS ──
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tickets_org_isolation" ON tickets;
CREATE POLICY "tickets_org_isolation" ON tickets
  FOR ALL
  USING (
    user_id IN (SELECT id FROM profiles WHERE org_id = get_user_org_id())
  )
  WITH CHECK (
    user_id = auth.uid()
  );

-- ── Payments RLS ──
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_org_isolation" ON payments;
CREATE POLICY "payments_org_isolation" ON payments
  FOR ALL
  USING (
    user_id IN (SELECT id FROM profiles WHERE org_id = get_user_org_id())
  )
  WITH CHECK (
    user_id = auth.uid()
  );

-- ── Ticket Comments RLS ──
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_comments_org_isolation" ON ticket_comments;
CREATE POLICY "ticket_comments_org_isolation" ON ticket_comments
  FOR ALL
  USING (
    ticket_id IN (
      SELECT id FROM tickets
      WHERE user_id IN (SELECT id FROM profiles WHERE org_id = get_user_org_id())
    )
  )
  WITH CHECK (
    user_id = auth.uid()
  );

-- ── Audit Log RLS ──
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_org_isolation" ON audit_log;
CREATE POLICY "audit_log_org_isolation" ON audit_log
  FOR ALL
  USING (
    user_id IN (SELECT id FROM profiles WHERE org_id = get_user_org_id())
  )
  WITH CHECK (
    user_id = auth.uid()
  );

-- ── Profiles RLS ──
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_org_isolation" ON profiles;
CREATE POLICY "profiles_org_isolation" ON profiles
  FOR ALL
  USING (
    org_id = get_user_org_id() OR id = auth.uid()
  )
  WITH CHECK (
    id = auth.uid()
  );

-- ── Organizations RLS ──
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_own_org" ON organizations;
CREATE POLICY "organizations_own_org" ON organizations
  FOR ALL
  USING (
    id = get_user_org_id()
  )
  WITH CHECK (
    id = get_user_org_id()
  );

-- ═══════════════════════════════════════════════════════════════
-- SUPER ADMIN BYPASS
-- Allow alialjobory89@gmail.com to access all orgs
-- ═══════════════════════════════════════════════════════════════

-- Add is_super_admin column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;

-- Mark the super admin
UPDATE profiles SET is_super_admin = true
WHERE id = (SELECT id FROM auth.users WHERE email = 'alialjobory89@gmail.com');

-- Update all policies to allow super admin bypass
-- Organizations: super admin can see all
DROP POLICY IF EXISTS "organizations_own_org" ON organizations;
CREATE POLICY "organizations_own_org" ON organizations
  FOR ALL
  USING (
    id = get_user_org_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

-- Contacts: super admin can see all
DROP POLICY IF EXISTS "contacts_org_isolation" ON contacts;
CREATE POLICY "contacts_org_isolation" ON contacts
  FOR ALL
  USING (
    user_id IN (SELECT id FROM profiles WHERE org_id = get_user_org_id())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  )
  WITH CHECK (user_id = auth.uid());

-- Add plan and status columns to organizations if not present
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS last_login timestamptz;

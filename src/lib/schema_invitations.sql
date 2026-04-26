-- Velo CRM — Team Invitations
-- Run this migration once in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired')),
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '48 hours'
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(org_id);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Admins of an org can see & manage invitations for their own org.
DROP POLICY IF EXISTS "invitations_org" ON invitations;
CREATE POLICY "invitations_org" ON invitations FOR ALL TO authenticated
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ─── Preview RPC (anon-callable) ──────────────────────────────────────────
-- The /join page needs to show "You've been invited to join [Org]" BEFORE
-- the invitee signs up. This function returns only safe public fields and
-- only for valid pending invitations. Anyone holding a token can see the
-- org name — that's accepted since tokens are already "capability URLs."
CREATE OR REPLACE FUNCTION public.get_invitation_preview(invite_token UUID)
RETURNS TABLE (org_name TEXT, invite_email TEXT, invite_role TEXT) AS $$
  SELECT o.name, i.email, i.role
  FROM invitations i
  JOIN organizations o ON o.id = i.org_id
  WHERE i.token = invite_token
    AND i.status = 'pending'
    AND i.expires_at > now()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION public.get_invitation_preview(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_preview(UUID) TO anon, authenticated;

-- ─── Accept RPC (authenticated) ───────────────────────────────────────────
-- Validates the invitation, assigns the caller to the target org, and
-- deletes the token (per spec "Delete token after use").
-- Email match is enforced so a leaked token can't be redeemed by anyone
-- other than the intended invitee.
CREATE OR REPLACE FUNCTION public.accept_invitation(invite_token UUID)
RETURNS TABLE (assigned_org_id UUID, org_name TEXT, assigned_role TEXT) AS $$
DECLARE
  inv invitations%ROWTYPE;
  caller_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  caller_email := (SELECT email FROM auth.users WHERE id = auth.uid());

  SELECT * INTO inv FROM invitations WHERE token = invite_token FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;
  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is %', inv.status;
  END IF;
  IF inv.expires_at < now() THEN
    UPDATE invitations SET status = 'expired' WHERE id = inv.id;
    RAISE EXCEPTION 'Invitation expired';
  END IF;
  IF lower(inv.email) <> lower(caller_email) THEN
    RAISE EXCEPTION 'Invitation email does not match signed-in user';
  END IF;

  UPDATE profiles
     SET org_id = inv.org_id,
         role   = inv.role,
         updated_at = now()
   WHERE id = auth.uid();

  -- "Delete token after use" per product spec.
  DELETE FROM invitations WHERE id = inv.id;

  RETURN QUERY
    SELECT inv.org_id, o.name, inv.role
    FROM organizations o
    WHERE o.id = inv.org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.accept_invitation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invitation(UUID) TO authenticated;

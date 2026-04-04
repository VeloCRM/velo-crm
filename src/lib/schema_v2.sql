CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT DEFAULT '',
  primary_color TEXT DEFAULT '#0969DA',
  industry TEXT DEFAULT 'general' CHECK (industry IN ('dental', 'real_estate', 'beauty', 'legal', 'general')),
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  custom_features JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#0969DA',
  permissions JSONB DEFAULT '{"contacts":true,"deals":true,"tickets":true,"inbox":true,"reports":false}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_departments_org ON departments(org_id);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_deals_org ON deals(org_id);
CREATE INDEX IF NOT EXISTS idx_tickets_org ON tickets(org_id);
CREATE INDEX IF NOT EXISTS idx_conversations_org ON conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org ON profiles(org_id);

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can manage own contacts" ON contacts;
DROP POLICY IF EXISTS "Users can manage own deals" ON deals;
DROP POLICY IF EXISTS "Users can manage own tickets" ON tickets;
DROP POLICY IF EXISTS "Users can manage own ticket comments" ON ticket_comments;
DROP POLICY IF EXISTS "Users can manage own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can manage own messages" ON messages;

CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (
  auth.uid() = id OR
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()) OR
  (SELECT is_super_admin FROM profiles WHERE id = auth.uid()) = TRUE
);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "contacts_all" ON contacts FOR ALL USING (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()) OR
  user_id = auth.uid() OR
  (SELECT is_super_admin FROM profiles WHERE id = auth.uid()) = TRUE
);

CREATE POLICY "deals_all" ON deals FOR ALL USING (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()) OR
  user_id = auth.uid() OR
  (SELECT is_super_admin FROM profiles WHERE id = auth.uid()) = TRUE
);

CREATE POLICY "tickets_all" ON tickets FOR ALL USING (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()) OR
  user_id = auth.uid() OR
  (SELECT is_super_admin FROM profiles WHERE id = auth.uid()) = TRUE
);

CREATE POLICY "ticket_comments_all" ON ticket_comments FOR ALL USING (
  user_id = auth.uid() OR
  ticket_id IN (SELECT id FROM tickets WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
);

CREATE POLICY "conversations_all" ON conversations FOR ALL USING (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()) OR
  user_id = auth.uid() OR
  (SELECT is_super_admin FROM profiles WHERE id = auth.uid()) = TRUE
);

CREATE POLICY "messages_all" ON messages FOR ALL USING (
  conversation_id IN (
    SELECT id FROM conversations WHERE
      org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()) OR
      user_id = auth.uid()
  )
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_select" ON organizations FOR SELECT USING (
  id IN (SELECT org_id FROM profiles WHERE id = auth.uid()) OR
  (SELECT is_super_admin FROM profiles WHERE id = auth.uid()) = TRUE
);
CREATE POLICY "org_update" ON organizations FOR UPDATE USING (
  id IN (SELECT org_id FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "org_insert" ON organizations FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "dept_select" ON departments FOR SELECT USING (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "dept_manage" ON departments FOR ALL USING (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

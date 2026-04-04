ALTER TABLE organizations ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_personality TEXT DEFAULT 'professional' CHECK (ai_personality IN ('professional', 'friendly', 'formal'));
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_knowledge_base TEXT DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_working_hours JSONB DEFAULT '{"start":"09:00","end":"17:00","timezone":"UTC","always_on":false}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_enabled_channels JSONB DEFAULT '{"whatsapp":false,"instagram":false,"email":false}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_phone_id TEXT DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_access_token TEXT DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_webhook_secret TEXT DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS gmail_email TEXT DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS meta_access_token TEXT DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS webhooks JSONB DEFAULT '[]';

CREATE TABLE IF NOT EXISTS saved_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  schedule JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_org ON saved_reports(org_id);
ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_reports_all" ON saved_reports FOR ALL USING (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]',
  context_type TEXT DEFAULT 'general',
  context_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_conv_all" ON ai_conversations FOR ALL USING (user_id = auth.uid());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON saved_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

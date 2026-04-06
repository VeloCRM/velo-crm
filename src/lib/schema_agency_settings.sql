-- Agency Settings table for super admin configuration
-- Stores agency-level settings like shared Anthropic API key

CREATE TABLE IF NOT EXISTS agency_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only super admin can read/write
ALTER TABLE agency_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_only" ON agency_settings
  USING (auth.jwt() ->> 'email' = 'alialjobory89@gmail.com');

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_agency_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agency_settings_updated
  BEFORE UPDATE ON agency_settings
  FOR EACH ROW EXECUTE FUNCTION update_agency_settings_timestamp();

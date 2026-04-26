-- Create Appointments Table
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  type TEXT DEFAULT 'checkup' CHECK (type IN ('checkup', 'cleaning', 'filling', 'extraction', 'root_canal', 'whitening', 'other')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_appointments_org ON appointments(org_id);
CREATE INDEX IF NOT EXISTS idx_appointments_contact ON appointments(contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);

-- Enable RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see/modify appointments within their organization
CREATE POLICY "appointments_all" ON appointments FOR ALL USING (
  org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
);

-- Trigger for updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

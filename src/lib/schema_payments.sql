-- Payments table — stores extracted note payments + manually added payments
-- Run this in Supabase SQL Editor before running extract-payments.mjs

CREATE TABLE IF NOT EXISTS payments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id   UUID REFERENCES contacts(id) ON DELETE SET NULL,
  amount       NUMERIC(12, 2) NOT NULL,
  currency     TEXT DEFAULT 'IQD' CHECK (currency IN ('IQD','USD','EUR','GBP','AED','SAR')),
  method       TEXT DEFAULT 'cash' CHECK (method IN ('cash','check','card','bank_transfer','crypto')),
  status       TEXT DEFAULT 'paid' CHECK (status IN ('pending','paid','overdue','cancelled')),
  due_date     DATE,
  payment_date DATE,
  description  TEXT DEFAULT '',
  deal_id      UUID REFERENCES deals(id) ON DELETE SET NULL,
  source       TEXT DEFAULT 'manual',
  note_id      TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_contact ON payments(contact_id);
CREATE INDEX idx_payments_status ON payments(status);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own payments"
  ON payments FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

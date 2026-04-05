-- ═══════════════════════════════════════════════════════════════════════════
-- Velo CRM — Documents Table
-- Run this in Supabase SQL Editor before running fetch-documents.mjs
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  size        BIGINT DEFAULT 0,
  url         TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_contact ON documents(contact_id);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view documents for own contacts"
  ON documents FOR SELECT USING (
    contact_id IN (SELECT id FROM contacts WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role full access to documents"
  ON documents FOR ALL USING (true)
  WITH CHECK (true);

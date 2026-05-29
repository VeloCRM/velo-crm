- ============================================================================
-- Velo CRM v2.0 — Dental Schema (Sprint 0, Phase 2)
-- ============================================================================
-- Single source of truth. Run on a fresh Supabase project.
--
-- Tenancy:
--   - One operator role (the agency). Membership = row in `operators`.
--   - One org per clinic. Every business row has org_id NOT NULL.
--   - Profile roles: owner | doctor | receptionist | assistant.
--
-- Money:
--   - All monetary columns are <name>_minor BIGINT.
--   - All monetary rows have a sibling currency column (IQD or USD).
--
-- RLS:
--   - Enabled on every table.
--   - Separate policies for SELECT / INSERT / UPDATE / DELETE (no FOR ALL).
--   - INSERT and UPDATE WITH CHECK pin org_id = current_org_id().
--   - Operator bypass via is_operator(), expressed as 4 per-operation policies.
-- ============================================================================


-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================================
-- 2. ENUMS
-- ============================================================================
CREATE TYPE locale_code AS ENUM ('en', 'ar');

CREATE TYPE currency_code AS ENUM ('IQD', 'USD');

CREATE TYPE org_status AS ENUM ('test', 'active', 'suspended');

CREATE TYPE profile_role AS ENUM ('owner', 'doctor', 'receptionist', 'assistant');

CREATE TYPE patient_gender AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');

CREATE TYPE appointment_type AS ENUM (
  'checkup',
  'cleaning',
  'filling',
  'extraction',
  'root_canal',
  'crown',
  'whitening',
  'consultation',
  'emergency'
);

CREATE TYPE appointment_status AS ENUM (
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'no_show',
  'cancelled'
);

CREATE TYPE treatment_plan_status AS ENUM (
  'proposed',
  'accepted',
  'in_progress',
  'completed',
  'declined'
);

CREATE TYPE treatment_plan_item_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'skipped'
);

CREATE TYPE dental_finding AS ENUM (
  'cavity',
  'restoration',
  'missing',
  'crown',
  'bridge',
  'implant',
  'root_canal_done',
  'healthy'
);

CREATE TYPE payment_method AS ENUM (
  'cash',
  'fib',
  'zaincash',
  'asia_hawala',
  'card',
  'other'
);

CREATE TYPE expense_category AS ENUM (
  'rent',
  'salaries',
  'equipment',
  'supplies',
  'software',
  'utilities',
  'other'
);

CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'in_review', 'done');

CREATE TYPE inventory_category AS ENUM (
  'consumables',
  'equipment',
  'medications',
  'lab_materials',
  'sterilization',
  'other'
);

CREATE TYPE form_type AS ENUM (
  'intake',
  'consent_extraction',
  'consent_rct',
  'consent_implant',
  'post_op',
  'photo_release',
  'recall'
);

CREATE TYPE secret_kind AS ENUM (
  'whatsapp_token',
  'whatsapp_phone_id',
  'whatsapp_app_secret',
  'whatsapp_webhook_secret',
  'gmail_refresh_token',
  'anthropic_key'
);

CREATE TYPE automation_trigger AS ENUM (
  'appointment_booked',
  'appointment_24h_before',
  'appointment_2h_before',
  'treatment_completed',
  'treatment_plan_unaccepted_7d',
  'recall_due'
);

CREATE TYPE conversation_channel AS ENUM ('whatsapp');

CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');


-- ============================================================================
-- 3. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- operators: cross-tenant agency users. Manually populated. No self-promotion.
-- ----------------------------------------------------------------------------
CREATE TABLE operators (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- orgs: one per clinic.
-- ----------------------------------------------------------------------------
CREATE TABLE orgs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL,
  slug                     text NOT NULL UNIQUE,
  locale                   locale_code NOT NULL DEFAULT 'en',
  currency                 currency_code NOT NULL DEFAULT 'IQD',
  timezone                 text NOT NULL DEFAULT 'Asia/Baghdad',
  status                   org_status NOT NULL DEFAULT 'test',
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by_operator_id   uuid REFERENCES operators(user_id) ON DELETE SET NULL,
  operator_notes           text
);

-- ----------------------------------------------------------------------------
-- profiles: one row per authenticated clinic user.
-- ----------------------------------------------------------------------------
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role        profile_role NOT NULL DEFAULT 'assistant',
  full_name   text,
  avatar_url  text,
  locale      locale_code NOT NULL DEFAULT 'en',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- patients
-- ----------------------------------------------------------------------------
CREATE TABLE patients (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  full_name         text NOT NULL,
  phone             text NOT NULL,
  email             text,
  dob               date,
  gender            patient_gender,
  medical_history   jsonb NOT NULL DEFAULT '{}'::jsonb,
  allergies         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, phone)
);

-- ----------------------------------------------------------------------------
-- appointments
-- ----------------------------------------------------------------------------
CREATE TABLE appointments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  patient_id        uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  type              appointment_type NOT NULL,
  status            appointment_status NOT NULL DEFAULT 'scheduled',
  scheduled_at      timestamptz NOT NULL,
  duration_minutes  int NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- treatment_plans
-- ----------------------------------------------------------------------------
CREATE TABLE treatment_plans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  patient_id          uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status              treatment_plan_status NOT NULL DEFAULT 'proposed',
  total_amount_minor  bigint NOT NULL DEFAULT 0 CHECK (total_amount_minor >= 0),
  currency            currency_code NOT NULL,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- treatment_plan_items
-- ----------------------------------------------------------------------------
CREATE TABLE treatment_plan_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  treatment_plan_id  uuid NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  -- FDI two-digit notation: quadrant (1-4) + position (1-8). Codes ending in
  -- 0 or 9 are invalid, but a tighter CHECK with explicit OR per quadrant
  -- works the same as the simple range, so we keep the range check and let
  -- the client-side validator reject 19/20/29/30/39/40.
  tooth_number       int CHECK (tooth_number BETWEEN 11 AND 48),
  surface            text,
  procedure_code     text NOT NULL,
  procedure_label    text NOT NULL,
  amount_minor       bigint NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  currency           currency_code NOT NULL,
  status             treatment_plan_item_status NOT NULL DEFAULT 'pending',
  sequence           int NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- dental_chart_entries
-- ----------------------------------------------------------------------------
CREATE TABLE dental_chart_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  patient_id    uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  -- FDI two-digit notation: see treatment_plan_items.tooth_number.
  tooth_number  int NOT NULL CHECK (tooth_number BETWEEN 11 AND 48),
  surface       text,
  finding       dental_finding NOT NULL,
  notes         text,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  recorded_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- payments
-- ----------------------------------------------------------------------------
CREATE TABLE payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  patient_id          uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  treatment_plan_id   uuid REFERENCES treatment_plans(id) ON DELETE SET NULL,
  amount_minor        bigint NOT NULL CHECK (amount_minor > 0),
  currency            currency_code NOT NULL,
  method              payment_method NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  recorded_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- expenses
-- ----------------------------------------------------------------------------
CREATE TABLE expenses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  category      expense_category NOT NULL,
  amount_minor  bigint NOT NULL CHECK (amount_minor > 0),
  currency      currency_code NOT NULL,
  occurred_at   timestamptz NOT NULL,
  notes         text,
  recorded_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- tasks
-- ----------------------------------------------------------------------------
CREATE TABLE tasks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  title               text NOT NULL,
  description         text,
  status              task_status NOT NULL DEFAULT 'todo',
  assignee_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  due_at              timestamptz,
  related_patient_id  uuid REFERENCES patients(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- inventory_items
-- ----------------------------------------------------------------------------
CREATE TABLE inventory_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  category              inventory_category NOT NULL,
  quantity              int NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit                  text NOT NULL DEFAULT 'unit',
  low_stock_threshold   int NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  last_restocked_at     timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- forms
-- ----------------------------------------------------------------------------
CREATE TABLE forms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  title       text NOT NULL,
  type        form_type NOT NULL,
  schema      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- form_submissions
-- ----------------------------------------------------------------------------
CREATE TABLE form_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  form_id         uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_url   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- audit_log
-- ----------------------------------------------------------------------------
CREATE TABLE audit_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  acting_user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  effective_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action              text NOT NULL,
  entity_type         text NOT NULL,
  entity_id           uuid,
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- org_secrets — operator-only. Clinic users never read or write directly.
-- ----------------------------------------------------------------------------
CREATE TABLE org_secrets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kind        secret_kind NOT NULL,
  value       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind)
);

-- ----------------------------------------------------------------------------
-- automations
-- ----------------------------------------------------------------------------
CREATE TABLE automations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  trigger     automation_trigger NOT NULL,
  actions     jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- conversations
-- ----------------------------------------------------------------------------
CREATE TABLE conversations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  patient_id        uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  channel           conversation_channel NOT NULL DEFAULT 'whatsapp',
  last_message_at   timestamptz,
  unread_count      int NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- messages
-- ----------------------------------------------------------------------------
CREATE TABLE messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  conversation_id       uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction             message_direction NOT NULL,
  body                  text NOT NULL,
  sent_at               timestamptz NOT NULL DEFAULT now(),
  whatsapp_message_id   text,
  created_at            timestamptz NOT NULL DEFAULT now()
);


-- ============================================================================
-- 4. INDEXES
-- ============================================================================

-- created_at DESC on every table
CREATE INDEX idx_operators_created_at              ON operators              (created_at DESC);
CREATE INDEX idx_orgs_created_at                   ON orgs                   (created_at DESC);
CREATE INDEX idx_profiles_created_at               ON profiles               (created_at DESC);
CREATE INDEX idx_patients_created_at               ON patients               (created_at DESC);
CREATE INDEX idx_appointments_created_at           ON appointments           (created_at DESC);
CREATE INDEX idx_treatment_plans_created_at        ON treatment_plans        (created_at DESC);
CREATE INDEX idx_treatment_plan_items_created_at   ON treatment_plan_items   (created_at DESC);
CREATE INDEX idx_dental_chart_entries_created_at   ON dental_chart_entries   (created_at DESC);
CREATE INDEX idx_payments_created_at               ON payments               (created_at DESC);
CREATE INDEX idx_expenses_created_at               ON expenses               (created_at DESC);
CREATE INDEX idx_tasks_created_at                  ON tasks                  (created_at DESC);
CREATE INDEX idx_inventory_items_created_at        ON inventory_items        (created_at DESC);
CREATE INDEX idx_forms_created_at                  ON forms                  (created_at DESC);
CREATE INDEX idx_form_submissions_created_at       ON form_submissions       (created_at DESC);
CREATE INDEX idx_audit_log_created_at              ON audit_log              (created_at DESC);
CREATE INDEX idx_org_secrets_created_at            ON org_secrets            (created_at DESC);
CREATE INDEX idx_automations_created_at            ON automations            (created_at DESC);
CREATE INDEX idx_conversations_created_at          ON conversations          (created_at DESC);
CREATE INDEX idx_messages_created_at               ON messages               (created_at DESC);

-- (org_id, created_at DESC) on the high-traffic tables
CREATE INDEX idx_patients_org_created      ON patients     (org_id, created_at DESC);
CREATE INDEX idx_appointments_org_created  ON appointments (org_id, created_at DESC);
CREATE INDEX idx_payments_org_created      ON payments     (org_id, created_at DESC);
CREATE INDEX idx_expenses_org_created      ON expenses     (org_id, created_at DESC);
CREATE INDEX idx_tasks_org_created         ON tasks        (org_id, created_at DESC);

-- messages chronological per conversation
CREATE INDEX idx_messages_conv_sent ON messages (conversation_id, sent_at);


-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- is_operator(): true when caller is a row in `operators`.
CREATE OR REPLACE FUNCTION public.is_operator()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.operators WHERE user_id = auth.uid()
  );
$$;

-- current_org_id(): caller's org_id from `profiles`. NULL when no profile.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.is_operator()      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_org_id()   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_operator()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_org_id()   TO authenticated;


-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- enforce_profile_immutable_fields:
--   Non-operators cannot change their own role, org_id, or id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profile_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable';
  END IF;
  IF NOT public.is_operator() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'profiles.role can only be changed by an operator';
    END IF;
    IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION 'profiles.org_id can only be changed by an operator';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_enforce_immutable
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_immutable_fields();

-- ----------------------------------------------------------------------------
-- set_updated_at: convenience trigger function.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER patients_set_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER appointments_set_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER treatment_plans_set_updated_at
  BEFORE UPDATE ON treatment_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER inventory_items_set_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER forms_set_updated_at
  BEFORE UPDATE ON forms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER automations_set_updated_at
  BEFORE UPDATE ON automations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER conversations_set_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================================
-- 7. ROW LEVEL SECURITY — ENABLE
-- ============================================================================
ALTER TABLE operators              ENABLE ROW LEVEL SECURITY;
ALTER TABLE orgs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients               ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_plans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_plan_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_chart_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE forms                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_secrets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages               ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 8. POLICIES — OPERATORS TABLE
--    Operators can read / write the whole table. Authenticated users may
--    read their OWN row only (so the client can answer "am I an operator?"
--    via a direct supabase.from('operators') query without going through
--    a Vercel Function).
--    Postgres OR's overlapping permissive SELECT policies together, so the
--    effective rule for SELECT is:
--       is_operator()  OR  user_id = auth.uid()
-- ============================================================================
CREATE POLICY operators_select_operator ON operators
  FOR SELECT TO authenticated
  USING (public.is_operator());

-- Self-read: any authenticated user can see whether their OWN user_id has
-- a row in operators. The row carries no secrets — only (user_id, notes,
-- created_at) — so exposing self-membership is safe.
CREATE POLICY operators_self_select ON operators
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY operators_insert_operator ON operators
  FOR INSERT TO authenticated
  WITH CHECK (public.is_operator());

CREATE POLICY operators_update_operator ON operators
  FOR UPDATE TO authenticated
  USING (public.is_operator())
  WITH CHECK (public.is_operator());

CREATE POLICY operators_delete_operator ON operators
  FOR DELETE TO authenticated
  USING (public.is_operator());


-- ============================================================================
-- 9. POLICIES — ORGS
--    Members read their own org. Insert / update / delete is operator-only.
-- ============================================================================
CREATE POLICY orgs_select_member ON orgs
  FOR SELECT TO authenticated
  USING (id = public.current_org_id());

-- Operator bypass (4 separate policies)
CREATE POLICY orgs_select_operator ON orgs
  FOR SELECT TO authenticated
  USING (public.is_operator());

CREATE POLICY orgs_insert_operator ON orgs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_operator());

CREATE POLICY orgs_update_operator ON orgs
  FOR UPDATE TO authenticated
  USING (public.is_operator())
  WITH CHECK (public.is_operator());

CREATE POLICY orgs_delete_operator ON orgs
  FOR DELETE TO authenticated
  USING (public.is_operator());


-- ============================================================================
-- 10. POLICIES — PROFILES
--     Members read same-org profiles. Self-update allowed; trigger blocks
--     role / org_id / id changes. Insert / delete via operator (or via a
--     SECURITY DEFINER onboarding RPC, which bypasses RLS).
-- ============================================================================
CREATE POLICY profiles_select_own_org ON profiles
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY profiles_update_self ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND org_id = public.current_org_id());

-- Operator bypass (4 separate policies)
CREATE POLICY profiles_select_operator ON profiles
  FOR SELECT TO authenticated
  USING (public.is_operator());

CREATE POLICY profiles_insert_operator ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_operator());

CREATE POLICY profiles_update_operator ON profiles
  FOR UPDATE TO authenticated
  USING (public.is_operator())
  WITH CHECK (public.is_operator());

CREATE POLICY profiles_delete_operator ON profiles
  FOR DELETE TO authenticated
  USING (public.is_operator());


-- ============================================================================
-- 11. POLICIES — PATIENTS
-- ============================================================================
CREATE POLICY patients_select_own_org ON patients
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY patients_insert_own_org ON patients
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY patients_update_own_org ON patients
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY patients_delete_own_org ON patients
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY patients_select_operator ON patients
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY patients_insert_operator ON patients
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY patients_update_operator ON patients
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY patients_delete_operator ON patients
  FOR DELETE TO authenticated USING (public.is_operator());


-- ============================================================================
-- 12. POLICIES — APPOINTMENTS
-- ============================================================================
CREATE POLICY appointments_select_own_org ON appointments
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY appointments_insert_own_org ON appointments
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY appointments_update_own_org ON appointments
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY appointments_delete_own_org ON appointments
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY appointments_select_operator ON appointments
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY appointments_insert_operator ON appointments
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY appointments_update_operator ON appointments
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY appointments_delete_operator ON appointments
  FOR DELETE TO authenticated USING (public.is_operator());


-- ============================================================================
-- 13. POLICIES — TREATMENT_PLANS
-- ============================================================================
CREATE POLICY treatment_plans_select_own_org ON treatment_plans
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY treatment_plans_insert_own_org ON treatment_plans
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY treatment_plans_update_own_org ON treatment_plans
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY treatment_plans_delete_own_org ON treatment_plans
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY treatment_plans_select_operator ON treatment_plans
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY treatment_plans_insert_operator ON treatment_plans
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY treatment_plans_update_operator ON treatment_plans
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY treatment_plans_delete_operator ON treatment_plans
  FOR DELETE TO authenticated USING (public.is_operator());


-- ============================================================================
-- 14. POLICIES — TREATMENT_PLAN_ITEMS
-- ============================================================================
CREATE POLICY treatment_plan_items_select_own_org ON treatment_plan_items
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY treatment_plan_items_insert_own_org ON treatment_plan_items
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY treatment_plan_items_update_own_org ON treatment_plan_items
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY treatment_plan_items_delete_own_org ON treatment_plan_items
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY treatment_plan_items_select_operator ON treatment_plan_items
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY treatment_plan_items_insert_operator ON treatment_plan_items
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY treatment_plan_items_update_operator ON treatment_plan_items
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY treatment_plan_items_delete_operator ON treatment_plan_items
  FOR DELETE TO authenticated USING (public.is_operator());


-- ============================================================================
-- 15. POLICIES — DENTAL_CHART_ENTRIES
-- ============================================================================
CREATE POLICY dental_chart_entries_select_own_org ON dental_chart_entries
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY dental_chart_entries_insert_own_org ON dental_chart_entries
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY dental_chart_entries_update_own_org ON dental_chart_entries
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY dental_chart_entries_delete_own_org ON dental_chart_entries
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY dental_chart_entries_select_operator ON dental_chart_entries
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY dental_chart_entries_insert_operator ON dental_chart_entries
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY dental_chart_entries_update_operator ON dental_chart_entries
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY dental_chart_entries_delete_operator ON dental_chart_entries
  FOR DELETE TO authenticated USING (public.is_operator());


-- ============================================================================
-- 16. POLICIES — PAYMENTS
-- ============================================================================
CREATE POLICY payments_select_own_org ON payments
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY payments_insert_own_org ON payments
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY payments_update_own_org ON payments
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY payments_delete_own_org ON payments
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY payments_select_operator ON payments
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY payments_insert_operator ON payments
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY payments_update_operator ON payments
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY payments_delete_operator ON payments
  FOR DELETE TO authenticated USING (public.is_operator());


-- ============================================================================
-- 17. POLICIES — EXPENSES
-- ============================================================================
CREATE POLICY expenses_select_own_org ON expenses
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY expenses_insert_own_org ON expenses
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY expenses_update_own_org ON expenses
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY expenses_delete_own_org ON expenses
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY expenses_select_operator ON expenses
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY expenses_insert_operator ON expenses
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY expenses_update_operator ON expenses
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY expenses_delete_operator ON expenses
  FOR DELETE TO authenticated USING (public.is_operator());


-- ============================================================================
-- 18. POLICIES — TASKS
-- ============================================================================
CREATE POLICY tasks_select_own_org ON tasks
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY tasks_insert_own_org ON tasks
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY tasks_update_own_org ON tasks
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY tasks_delete_own_org ON tasks
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY tasks_select_operator ON tasks
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY tasks_insert_operator ON tasks
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY tasks_update_operator ON tasks
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY tasks_delete_operator ON tasks
  FOR DELETE TO authenticated USING (public.is_operator());


-- ============================================================================
-- 19. POLICIES — INVENTORY_ITEMS
-- ============================================================================
CREATE POLICY inventory_items_select_own_org ON inventory_items
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY inventory_items_insert_own_org ON inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY inventory_items_update_own_org ON inventory_items
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY inventory_items_delete_own_org ON inventory_items
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY inventory_items_select_operator ON inventory_items
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY inventory_items_insert_operator ON inventory_items
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY inventory_items_update_operator ON inventory_items
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY inventory_items_delete_operator ON inventory_items
  FOR DELETE TO authenticated USING (public.is_operator());


-- ============================================================================
-- 20. POLICIES — FORMS
-- ============================================================================
CREATE POLICY forms_select_own_org ON forms
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY forms_insert_own_org ON forms
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY forms_update_own_org ON forms
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY forms_delete_own_org ON forms
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY forms_select_operator ON forms
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY forms_insert_operator ON forms
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY forms_update_operator ON forms
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY forms_delete_operator ON forms
  FOR DELETE TO authenticated USING (public.is_operator());


-- ============================================================================
-- 21. POLICIES — FORM_SUBMISSIONS
-- ============================================================================
CREATE POLICY form_submissions_select_own_org ON form_submissions
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY form_submissions_insert_own_org ON form_submissions
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY form_submissions_update_own_org ON form_submissions
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY form_submissions_delete_own_org ON form_submissions
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY form_submissions_select_operator ON form_submissions
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY form_submissions_insert_operator ON form_submissions
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY form_submissions_update_operator ON form_submissions
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY form_submissions_delete_operator ON form_submissions
  FOR DELETE TO authenticated USING (public.is_operator());


-- ============================================================================
-- 22. POLICIES — AUDIT_LOG
-- ============================================================================
CREATE POLICY audit_log_select_own_org ON audit_log
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY audit_log_insert_own_org ON audit_log
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY audit_log_update_own_org ON audit_log
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY audit_log_delete_own_org ON audit_log
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY audit_log_select_operator ON audit_log
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY audit_log_insert_operator ON audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY audit_log_update_operator ON audit_log
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY audit_log_delete_operator ON audit_log
  FOR DELETE TO authenticated USING (public.is_operator());


-- ============================================================================
-- 23. POLICIES — ORG_SECRETS
--     Operator-only. No clinic-user policies.
-- ============================================================================
CREATE POLICY org_secrets_select_operator ON org_secrets
  FOR SELECT TO authenticated
  USING (public.is_operator());

CREATE POLICY org_secrets_insert_operator ON org_secrets
  FOR INSERT TO authenticated
  WITH CHECK (public.is_operator());

CREATE POLICY org_secrets_update_operator ON org_secrets
  FOR UPDATE TO authenticated
  USING (public.is_operator())
  WITH CHECK (public.is_operator());

CREATE POLICY org_secrets_delete_operator ON org_secrets
  FOR DELETE TO authenticated
  USING (public.is_operator());


-- ============================================================================
-- 24. POLICIES — AUTOMATIONS
-- ============================================================================
CREATE POLICY automations_select_own_org ON automations
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY automations_insert_own_org ON automations
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY automations_update_own_org ON automations
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY automations_delete_own_org ON automations
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY automations_select_operator ON automations
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY automations_insert_operator ON automations
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY automations_update_operator ON automations
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY automations_delete_operator ON automations
  FOR DELETE TO authenticated USING (public.is_operator());


-- ============================================================================
-- 25. POLICIES — CONVERSATIONS
-- ============================================================================
CREATE POLICY conversations_select_own_org ON conversations
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY conversations_insert_own_org ON conversations
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY conversations_update_own_org ON conversations
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY conversations_delete_own_org ON conversations
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY conversations_select_operator ON conversations
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY conversations_insert_operator ON conversations
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY conversations_update_operator ON conversations
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY conversations_delete_operator ON conversations
  FOR DELETE TO authenticated USING (public.is_operator());


-- ============================================================================
-- 26. POLICIES — MESSAGES
-- ============================================================================
CREATE POLICY messages_select_own_org ON messages
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY messages_insert_own_org ON messages
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY messages_update_own_org ON messages
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY messages_delete_own_org ON messages
  FOR DELETE TO authenticated
  USING (org_id = public.current_org_id());

CREATE POLICY messages_select_operator ON messages
  FOR SELECT TO authenticated USING (public.is_operator());
CREATE POLICY messages_insert_operator ON messages
  FOR INSERT TO authenticated WITH CHECK (public.is_operator());
CREATE POLICY messages_update_operator ON messages
  FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE POLICY messages_delete_operator ON messages
  FOR DELETE TO authenticated USING (public.is_operator());


-- ============================================================================
-- END OF SCHEMA
-- ============================================================================


-- ============================================================================
-- MIGRATION — Phase 4 (Sprint 0): ai_usage rate-limit table
-- ----------------------------------------------------------------------------
-- Append-only migration. Run separately from the main schema. Tracks per-org
-- AI proxy requests for the 100/hour rate limit enforced by /api/ai/chat.
-- ============================================================================
CREATE TABLE ai_usage (id uuid primary key default gen_random_uuid(), org_id uuid not null references orgs(id) on delete cascade, requested_at timestamptz not null default now());
CREATE INDEX idx_ai_usage_org_time ON ai_usage(org_id, requested_at DESC);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- Per-operation policies (Phase 2 invariant — no FOR ALL).
-- Writes go through the service-role key in /api/ai/chat.js, which bypasses
-- RLS entirely; the policies here only govern client-side reads + operator
-- maintenance.
CREATE POLICY ai_usage_org_select ON ai_usage FOR SELECT USING (org_id = current_org_id());
CREATE POLICY ai_usage_op_select  ON ai_usage FOR SELECT USING (is_operator());
CREATE POLICY ai_usage_op_insert  ON ai_usage FOR INSERT WITH CHECK (is_operator());
CREATE POLICY ai_usage_op_update  ON ai_usage FOR UPDATE USING (is_operator()) WITH CHECK (is_operator());
CREATE POLICY ai_usage_op_delete  ON ai_usage FOR DELETE USING (is_operator());


-- ============================================================================
-- MIGRATION — Phase 5 (Sprint 0): whatsapp_usage rate-limit table
-- ----------------------------------------------------------------------------
-- Append-only migration. Same shape as ai_usage (timestamped row per send).
-- Powers the 1000 messages / day cap enforced by /api/whatsapp/send.
-- ============================================================================
CREATE TABLE whatsapp_usage (id uuid primary key default gen_random_uuid(), org_id uuid not null references orgs(id) on delete cascade, sent_at timestamptz not null default now());
CREATE INDEX idx_whatsapp_usage_org_time ON whatsapp_usage(org_id, sent_at DESC);
ALTER TABLE whatsapp_usage ENABLE ROW LEVEL SECURITY;

-- Per-operation policies (Phase 2 invariant — no FOR ALL).
-- Writes go through the service-role key in /api/whatsapp/send.js, which
-- bypasses RLS entirely; the policies here only govern client-side reads
-- + operator maintenance.
CREATE POLICY whatsapp_usage_org_select ON whatsapp_usage FOR SELECT USING (org_id = current_org_id());
CREATE POLICY whatsapp_usage_op_select  ON whatsapp_usage FOR SELECT USING (is_operator());
CREATE POLICY whatsapp_usage_op_insert  ON whatsapp_usage FOR INSERT WITH CHECK (is_operator());
CREATE POLICY whatsapp_usage_op_update  ON whatsapp_usage FOR UPDATE USING (is_operator()) WITH CHECK (is_operator());
CREATE POLICY whatsapp_usage_op_delete  ON whatsapp_usage FOR DELETE USING (is_operator());


-- ============================================================================
-- MIGRATION — Sprint 0 Wave A: social_connections (Social Monitor)
-- ----------------------------------------------------------------------------
-- One row per (org, platform). Numbers are entered manually by the operator
-- in the SocialMonitor page; automated sync is deferred. Per-operation
-- policies for clinic users + per-operation operator-bypass policies.
-- ============================================================================
CREATE TYPE social_platform AS ENUM ('instagram', 'facebook', 'tiktok', 'google_maps', 'youtube', 'twitter');

CREATE TABLE social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  page_name text,
  profile_url text,
  profile_pic_url text,
  followers_count bigint NOT NULL DEFAULT 0,
  following_count bigint NOT NULL DEFAULT 0,
  posts_count bigint NOT NULL DEFAULT 0,
  engagement_rate numeric(5,2),
  bio text,
  notes text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, platform)
);

CREATE INDEX idx_social_connections_org ON social_connections(org_id);
ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY social_connections_org_select ON social_connections FOR SELECT USING (org_id = current_org_id());
CREATE POLICY social_connections_org_insert ON social_connections FOR INSERT WITH CHECK (org_id = current_org_id());
CREATE POLICY social_connections_org_update ON social_connections FOR UPDATE USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());
CREATE POLICY social_connections_org_delete ON social_connections FOR DELETE USING (org_id = current_org_id());

CREATE POLICY social_connections_op_select ON social_connections FOR SELECT USING (is_operator());
CREATE POLICY social_connections_op_insert ON social_connections FOR INSERT WITH CHECK (is_operator());
CREATE POLICY social_connections_op_update ON social_connections FOR UPDATE USING (is_operator()) WITH CHECK (is_operator());
CREATE POLICY social_connections_op_delete ON social_connections FOR DELETE USING (is_operator());


-- ============================================================================
-- MIGRATION — Sprint 0 Wave A Part 2: invitations
-- ----------------------------------------------------------------------------
-- Link-only invitation flow. Owner generates a /join?token=... URL and
-- shares it via their own channel (WhatsApp, email, etc.). No mail
-- infrastructure. Only owners can create/revoke. Operators have full
-- bypass.
-- ============================================================================

CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email text NOT NULL,
  role profile_role NOT NULL,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  status invitation_status NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  invited_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id),
  CONSTRAINT email_lowercase CHECK (email = lower(email))
);

CREATE INDEX idx_invitations_org_status ON invitations(org_id, status);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Owners can read pending invitations for their own org
CREATE POLICY invitations_owner_select ON invitations FOR SELECT USING (
  org_id = current_org_id()
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
);

-- Owners can create invitations for their own org. WITH CHECK enforces this on INSERT.
CREATE POLICY invitations_owner_insert ON invitations FOR INSERT WITH CHECK (
  org_id = current_org_id()
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  AND invited_by = auth.uid()
);

-- Owners can revoke (soft-delete via status update) their own org's invitations
CREATE POLICY invitations_owner_update ON invitations FOR UPDATE USING (
  org_id = current_org_id()
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
) WITH CHECK (
  org_id = current_org_id()
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
);

-- Operator bypass — full CRUD on any org's invitations
CREATE POLICY invitations_op_select ON invitations FOR SELECT USING (is_operator());
CREATE POLICY invitations_op_insert ON invitations FOR INSERT WITH CHECK (is_operator());
CREATE POLICY invitations_op_update ON invitations FOR UPDATE USING (is_operator()) WITH CHECK (is_operator());
CREATE POLICY invitations_op_delete ON invitations FOR DELETE USING (is_operator());

-- get_invitation_preview: unauthenticated SECURITY DEFINER. Returns minimal
-- info so the /join page can render the welcome screen without exposing the
-- org's other invitations.
CREATE OR REPLACE FUNCTION get_invitation_preview(invite_token text)
RETURNS TABLE (org_name text, invite_email text, invite_role profile_role, expires_at timestamptz, status invitation_status)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.name, i.email, i.role, i.expires_at, i.status
  FROM invitations i
  JOIN orgs o ON o.id = i.org_id
  WHERE i.token = invite_token
    AND i.status = 'pending'
    AND i.expires_at > now()
  LIMIT 1;
$$;

-- accept_invitation: SECURITY DEFINER. Called by an authenticated user from
-- /join. Validates the token, confirms the caller's email matches, creates
-- a profile, marks the invitation accepted. Atomic.
CREATE OR REPLACE FUNCTION accept_invitation(invite_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv invitations%ROWTYPE;
  caller_email text;
  new_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Caller email not found';
  END IF;

  -- Lock the invitation row to prevent double-accept races
  SELECT * INTO inv FROM invitations WHERE token = invite_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;
  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is %', inv.status;
  END IF;
  IF inv.expires_at <= now() THEN
    UPDATE invitations SET status = 'expired' WHERE id = inv.id;
    RAISE EXCEPTION 'Invitation expired';
  END IF;
  IF lower(inv.email) <> lower(caller_email) THEN
    RAISE EXCEPTION 'Invitation email does not match signed-in user';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'User already belongs to an organization';
  END IF;

  IF EXISTS (SELECT 1 FROM orgs WHERE id = inv.org_id AND status = 'test') THEN
    RAISE EXCEPTION 'Cannot accept invitations for test accounts';
  END IF;

  INSERT INTO profiles (id, org_id, role, full_name, locale)
  VALUES (auth.uid(), inv.org_id, inv.role, '', 'en')
  RETURNING id INTO new_profile_id;

  UPDATE invitations
  SET status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  WHERE id = inv.id;

  INSERT INTO audit_log (org_id, acting_user_id, action, entity_type, entity_id, payload)
  VALUES (inv.org_id, auth.uid(), 'invitation.accept', 'invitation', inv.id, jsonb_build_object('role', inv.role));

  RETURN inv.org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_invitation_preview(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION accept_invitation(text) TO authenticated;

-- ============================================================================
-- Prescription Template Storage (PR 1 — feat/prescription-template-upload)
-- ============================================================================
-- Per-doctor prescription pad templates stored in Supabase Storage.
--
-- Path: prescription-templates/{org_id}/{doctor_id}/template.{ext}
--   - segment 1 (storage.foldername(name)[1]): org UUID
--   - segment 2 (storage.foldername(name)[2]): doctor UUID
--   - basename: 'template.{ext}' (placeholder; not used by RLS)
--
-- NOTE: storage.foldername returns FOLDER segments only, excluding the basename.
-- The doctor_id therefore lives as a folder segment, not a basename prefix.
-- A 2-segment scheme {org_id}/{doctor_id}.{ext} would NOT work — foldername[2]
-- would be NULL. The 3-segment scheme also mirrors the dental_xrays convention.
--
-- Bucket creation is manual via Supabase dashboard (size/MIME constraints aren't
-- cleanly settable via SQL). Bucket settings:
--   - Name: prescription-templates
--   - Public: OFF (private)
--   - File size limit: 5242880 (5 MB)
--   - Allowed MIME types: image/png, image/jpeg
--
-- Standalone RLS-only script for re-pasting: scripts/prescription-templates-bucket.sql

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS prescription_template_url text;

-- READ: any authenticated member of the org can preview templates.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_templates_select' AND schemaname = 'storage') THEN
    CREATE POLICY "prescription_templates_select" ON storage.objects FOR SELECT
      USING (
        bucket_id = 'prescription-templates'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

-- Hybrid write model (updated by fix/prescription-template-upload — see
-- scripts/prescription-templates-rls-fix.sql): same-org owner can manage ANY
-- doctor's template; a doctor can manage ONLY their own (segment 2 = auth.uid);
-- receptionists/assistants are blocked. Consolidated into a single EXISTS.

-- INSERT: same-org owner, OR same-org doctor uploading their OWN folder.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_templates_insert' AND schemaname = 'storage') THEN
    CREATE POLICY "prescription_templates_insert" ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'prescription-templates'
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND org_id = (storage.foldername(name))[1]::uuid
            AND (
              role = 'owner'
              OR (role = 'doctor' AND (storage.foldername(name))[2]::uuid = auth.uid())
            )
        )
      );
  END IF;
END $$;

-- UPDATE: same predicate as INSERT.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_templates_update' AND schemaname = 'storage') THEN
    CREATE POLICY "prescription_templates_update" ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'prescription-templates'
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND org_id = (storage.foldername(name))[1]::uuid
            AND (
              role = 'owner'
              OR (role = 'doctor' AND (storage.foldername(name))[2]::uuid = auth.uid())
            )
        )
      );
  END IF;
END $$;

-- DELETE: same predicate as INSERT/UPDATE.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_templates_delete' AND schemaname = 'storage') THEN
    CREATE POLICY "prescription_templates_delete" ON storage.objects FOR DELETE
      USING (
        bucket_id = 'prescription-templates'
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND org_id = (storage.foldername(name))[1]::uuid
            AND (
              role = 'owner'
              OR (role = 'doctor' AND (storage.foldername(name))[2]::uuid = auth.uid())
            )
        )
      );
  END IF;
END $$;


-- ============================================================================
-- prescriptions / prescription_items — PR #2 (Path A)
-- ============================================================================
-- Per-patient prescriptions issued by a doctor. Parent (header) + child (line
-- items). Reuses the per-doctor prescription-pad template uploaded via PR #17
-- for printing (handled at the UI layer in commit 3).
--
-- ─── Design notes ──────────────────────────────────────────────────────────
-- * prescription_items denormalizes org_id (matches treatment_plan_items
--   precedent at line 250).
-- * RLS uses the codebase's helper functions public.current_org_id() and
--   public.is_operator(). Two policy sets per table — _own_org + _operator.
--   No role-tightening on writes; clinic UI gates roles via EDIT_ROLES in
--   DentalTabs.jsx (matches the treatment_plans precedent).
-- * Audit columns updated_at/updated_by are nullable so NULL clearly signals
--   "never modified since creation." A BEFORE UPDATE trigger maintains
--   updated_at; updated_by must be set by the data layer (no auth context in
--   a generic trigger function).
-- * external_id + external_source enable GHL / external-system import
--   idempotency via a partial unique index on the non-null pair.
-- * doctor_id ON DELETE RESTRICT — prescriptions are permanent clinical
--   records and must not be orphaned by an accidental doctor deletion
--   (differs from treatment_plans.doctor_id which uses ON DELETE SET NULL).
--
-- All policies wrapped in idempotent DO blocks; this section is safe to
-- re-run via scripts/prescriptions-migration.sql.
-- ============================================================================

-- ─── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.prescriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES public.orgs(id)     ON DELETE CASCADE,
  patient_id            uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  issued_at             timestamptz NOT NULL DEFAULT now(),
  general_instructions  text,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  -- Partial audit trail: NULL = never updated since creation.
  updated_at            timestamptz,
  updated_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- External-system import idempotency (e.g. GHL). Both NULL for native creates.
  external_id           text,
  external_source       text
);

CREATE TABLE IF NOT EXISTS public.prescription_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  drug_name       text NOT NULL,
  dosage          text,
  frequency       text,
  duration        text,
  instructions    text,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);


-- ─── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_prescriptions_created_at
  ON public.prescriptions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescriptions_org_patient_issued
  ON public.prescriptions (org_id, patient_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor
  ON public.prescriptions (doctor_id);

-- Partial unique: enforces (external_source, external_id) uniqueness only
-- when external_id IS NOT NULL. Native creates (NULL pair) coexist freely.
CREATE UNIQUE INDEX IF NOT EXISTS idx_prescriptions_external_uniq
  ON public.prescriptions (external_source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prescription_items_created_at
  ON public.prescription_items (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescription_items_prescription
  ON public.prescription_items (prescription_id, sort_order);


-- ─── Trigger — auto-update updated_at on UPDATE ────────────────────────────

DROP TRIGGER IF EXISTS prescriptions_set_updated_at ON public.prescriptions;
CREATE TRIGGER prescriptions_set_updated_at
  BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── Enable RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.prescriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;


-- ─── Policies — prescriptions ──────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_select_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_select_own_org ON public.prescriptions
      FOR SELECT TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_insert_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_insert_own_org ON public.prescriptions
      FOR INSERT TO authenticated
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_update_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_update_own_org ON public.prescriptions
      FOR UPDATE TO authenticated
      USING (org_id = public.current_org_id())
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_delete_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_delete_own_org ON public.prescriptions
      FOR DELETE TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_select_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_select_operator ON public.prescriptions
      FOR SELECT TO authenticated USING (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_insert_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_insert_operator ON public.prescriptions
      FOR INSERT TO authenticated WITH CHECK (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_update_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_update_operator ON public.prescriptions
      FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescriptions_delete_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescriptions_delete_operator ON public.prescriptions
      FOR DELETE TO authenticated USING (public.is_operator());
  END IF;
END $$;


-- ─── Policies — prescription_items ─────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_select_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_select_own_org ON public.prescription_items
      FOR SELECT TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_insert_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_insert_own_org ON public.prescription_items
      FOR INSERT TO authenticated
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_update_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_update_own_org ON public.prescription_items
      FOR UPDATE TO authenticated
      USING (org_id = public.current_org_id())
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_delete_own_org' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_delete_own_org ON public.prescription_items
      FOR DELETE TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_select_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_select_operator ON public.prescription_items
      FOR SELECT TO authenticated USING (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_insert_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_insert_operator ON public.prescription_items
      FOR INSERT TO authenticated WITH CHECK (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_update_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_update_operator ON public.prescription_items
      FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'prescription_items_delete_operator' AND schemaname = 'public') THEN
    CREATE POLICY prescription_items_delete_operator ON public.prescription_items
      FOR DELETE TO authenticated USING (public.is_operator());
  END IF;
END $$;


-- ─── Trigger — doctor_id semantic integrity ────────────────────────────────
-- RLS only enforces tenancy (org_id match). The doctor_id must additionally
-- reference a profile with role='doctor' in the SAME org. RLS can't express
-- a cross-row predicate on referenced data without an EXISTS subquery, and
-- adding that to every write policy would diverge from the codebase's
-- helper-function-only convention. A trigger keeps the check co-located with
-- the table and fires only when doctor_id or org_id changes (skipping
-- general_instructions/issued_at-only UPDATEs).

CREATE OR REPLACE FUNCTION public.enforce_prescription_doctor_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = NEW.doctor_id
      AND role = 'doctor'
      AND org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'doctor_id must reference a profile with role=''doctor'' in the same org (got doctor_id=%, org_id=%)', NEW.doctor_id, NEW.org_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'prescriptions_enforce_doctor_role'
      AND tgrelid = 'public.prescriptions'::regclass
  ) THEN
    CREATE TRIGGER prescriptions_enforce_doctor_role
      BEFORE INSERT OR UPDATE OF doctor_id, org_id ON public.prescriptions
      FOR EACH ROW EXECUTE FUNCTION public.enforce_prescription_doctor_role();
  END IF;
END $$;


-- ============================================================================
-- documents — PR #4 (Path A)
-- ============================================================================
-- Per-patient file attachments (PDFs, images, Office docs, plain text) stored
-- in the private `patient-documents` Storage bucket. Flat table — one row per
-- uploaded file; no parent/child shape (unlike prescriptions).
--
-- ─── Design notes ──────────────────────────────────────────────────────────
-- * RLS uses the codebase's helper functions public.current_org_id() and
--   public.is_operator(). Two policy sets — _own_org + _operator (8 total).
--   No role-tightening on table writes; the clinic UI gates roles via a
--   DocumentsTab-local EDIT_ROLES set (owner/doctor/receptionist) and the
--   Storage-bucket RLS additionally role-gates writes (see
--   scripts/patient-documents-bucket.sql).
-- * No trigger — documents carry no cross-table semantic invariant (unlike
--   prescriptions' doctor-role check). FK + RLS + cascade are sufficient.
-- * storage_path holds {org_id}/{patient_id}/{document_id}.{ext}; the actual
--   blob lives in Storage. uploaded_by is nullable (ON DELETE SET NULL) so a
--   removed uploader account doesn't cascade-delete clinical records.
-- * external_id + external_source enable GHL / external-system import
--   idempotency via a partial unique index on the non-null pair.
-- * Uploads are immutable (replace = delete + re-upload). UPDATE policies are
--   still defined — cheap, idempotent, forward-compatible if metadata edits
--   are added later.
--
-- All policies wrapped in idempotent DO blocks; safe to re-run via
-- scripts/documents-migration.sql. The Storage-bucket RLS is a SEPARATE script
-- (scripts/patient-documents-bucket.sql) run after the bucket is created.
-- ============================================================================

-- ─── Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id)     ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  file_name       text NOT NULL,
  storage_path    text NOT NULL,
  mime_type       text,
  file_size       bigint,
  uploaded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- External-system import idempotency (e.g. GHL). Both NULL for native uploads.
  external_id     text,
  external_source text
);


-- ─── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS documents_patient_idx ON public.documents (patient_id);
CREATE INDEX IF NOT EXISTS documents_org_idx     ON public.documents (org_id);

-- Partial unique: enforces (external_source, external_id) uniqueness only when
-- external_id IS NOT NULL. Native uploads (NULL pair) coexist freely.
CREATE UNIQUE INDEX IF NOT EXISTS documents_external_uidx
  ON public.documents (external_source, external_id)
  WHERE external_id IS NOT NULL;


-- ─── Enable RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;


-- ─── Policies — documents ──────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_select_own_org' AND schemaname = 'public') THEN
    CREATE POLICY documents_select_own_org ON public.documents
      FOR SELECT TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_insert_own_org' AND schemaname = 'public') THEN
    CREATE POLICY documents_insert_own_org ON public.documents
      FOR INSERT TO authenticated
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_update_own_org' AND schemaname = 'public') THEN
    CREATE POLICY documents_update_own_org ON public.documents
      FOR UPDATE TO authenticated
      USING (org_id = public.current_org_id())
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_delete_own_org' AND schemaname = 'public') THEN
    CREATE POLICY documents_delete_own_org ON public.documents
      FOR DELETE TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_select_operator' AND schemaname = 'public') THEN
    CREATE POLICY documents_select_operator ON public.documents
      FOR SELECT TO authenticated USING (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_insert_operator' AND schemaname = 'public') THEN
    CREATE POLICY documents_insert_operator ON public.documents
      FOR INSERT TO authenticated WITH CHECK (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_update_operator' AND schemaname = 'public') THEN
    CREATE POLICY documents_update_operator ON public.documents
      FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'documents_delete_operator' AND schemaname = 'public') THEN
    CREATE POLICY documents_delete_operator ON public.documents
      FOR DELETE TO authenticated USING (public.is_operator());
  END IF;
END $$;


-- ─── Storage bucket RLS ────────────────────────────────────────────────────
-- The `patient-documents` bucket policies on storage.objects live in
-- scripts/patient-documents-bucket.sql (run after the bucket is created via
-- the Supabase dashboard). They are kept out of this file because bucket
-- creation itself (size/MIME limits) is a manual dashboard step, mirroring the
-- prescription-templates convention above.


-- ============================================================================
-- notes — PR #5 (Path A)
-- ============================================================================
-- Per-patient clinical notes — short free-text entries (optional title,
-- pinnable). Flat table — one row per note; no parent/child, no Storage.
--
-- ─── Design notes ──────────────────────────────────────────────────────────
-- * RLS uses the codebase's helper functions public.current_org_id() and
--   public.is_operator(). Two policy sets — _own_org + _operator (8 total).
--   No role-tightening on writes; the clinic UI gates roles (owner/doctor)
--   via EDIT_ROLES in DentalTabs.jsx.
-- * No trigger — notes carry no cross-table semantic invariant. updated_at is
--   set explicitly by the data layer, so a NULL value cleanly signals "never
--   edited since creation" (matches the prescriptions partial-audit pattern).
-- * pinned is a plain boolean column; the list query sorts pinned DESC,
--   created_at DESC, backed by notes_pinned_idx.
-- * external_id + external_source enable GHL / external-system import
--   idempotency via a partial unique index on the non-null pair.
-- * external_user_id preserves the GHL note author. GHL users don't exist in
--   our auth.users, so it's a bare text column (no FK), for traceability only.
--
-- All policies wrapped in idempotent DO blocks; safe to re-run via
-- scripts/notes-migration.sql.
-- ============================================================================

-- ─── Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.orgs(id)     ON DELETE CASCADE,
  patient_id       uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  body             text NOT NULL,
  title            text,
  pinned           boolean NOT NULL DEFAULT false,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Partial audit trail: NULL = never edited since creation.
  updated_at       timestamptz,
  updated_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- External-system import idempotency (e.g. GHL). Both NULL for native notes.
  external_id      text,
  external_source  text,
  -- Preserves the GHL note author (no FK — GHL users aren't in our auth.users).
  external_user_id text
);


-- ─── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS notes_patient_idx ON public.notes (patient_id);
CREATE INDEX IF NOT EXISTS notes_org_idx     ON public.notes (org_id);

-- Backs the list query: pinned notes first, newest-first within each group.
CREATE INDEX IF NOT EXISTS notes_pinned_idx
  ON public.notes (patient_id, pinned DESC, created_at DESC);

-- Partial unique: enforces (external_source, external_id) uniqueness only when
-- external_id IS NOT NULL. Native notes (NULL pair) coexist freely.
CREATE UNIQUE INDEX IF NOT EXISTS notes_external_uidx
  ON public.notes (external_source, external_id)
  WHERE external_id IS NOT NULL;


-- ─── Enable RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;


-- ─── Policies — notes ──────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'notes_select_own_org' AND schemaname = 'public') THEN
    CREATE POLICY notes_select_own_org ON public.notes
      FOR SELECT TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'notes_insert_own_org' AND schemaname = 'public') THEN
    CREATE POLICY notes_insert_own_org ON public.notes
      FOR INSERT TO authenticated
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'notes_update_own_org' AND schemaname = 'public') THEN
    CREATE POLICY notes_update_own_org ON public.notes
      FOR UPDATE TO authenticated
      USING (org_id = public.current_org_id())
      WITH CHECK (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'notes_delete_own_org' AND schemaname = 'public') THEN
    CREATE POLICY notes_delete_own_org ON public.notes
      FOR DELETE TO authenticated
      USING (org_id = public.current_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'notes_select_operator' AND schemaname = 'public') THEN
    CREATE POLICY notes_select_operator ON public.notes
      FOR SELECT TO authenticated USING (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'notes_insert_operator' AND schemaname = 'public') THEN
    CREATE POLICY notes_insert_operator ON public.notes
      FOR INSERT TO authenticated WITH CHECK (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'notes_update_operator' AND schemaname = 'public') THEN
    CREATE POLICY notes_update_operator ON public.notes
      FOR UPDATE TO authenticated USING (public.is_operator()) WITH CHECK (public.is_operator());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'notes_delete_operator' AND schemaname = 'public') THEN
    CREATE POLICY notes_delete_operator ON public.notes
      FOR DELETE TO authenticated USING (public.is_operator());
  END IF;
END $$;


-- ============================================================================
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
  chair_id          text,
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
  tooth_number       int CHECK (tooth_number BETWEEN 1 AND 32),
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
  tooth_number  int NOT NULL CHECK (tooth_number BETWEEN 1 AND 32),
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
--    Only operators can read / write. No clinic-user policies.
-- ============================================================================
CREATE POLICY operators_select_operator ON operators
  FOR SELECT TO authenticated
  USING (public.is_operator());

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
CREATE POLICY ai_usage_operator ON ai_usage FOR ALL USING (is_operator()) WITH CHECK (is_operator());


-- ============================================================================
-- MIGRATION — Phase 5 (Sprint 0): whatsapp_usage rate-limit table
-- ----------------------------------------------------------------------------
-- Append-only migration. Same shape as ai_usage (timestamped row per send).
-- Powers the 1000 messages / day cap enforced by /api/whatsapp/send.
-- ============================================================================
CREATE TABLE whatsapp_usage (id uuid primary key default gen_random_uuid(), org_id uuid not null references orgs(id) on delete cascade, sent_at timestamptz not null default now());
CREATE INDEX idx_whatsapp_usage_org_time ON whatsapp_usage(org_id, sent_at DESC);
ALTER TABLE whatsapp_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_usage_operator ON whatsapp_usage FOR ALL USING (is_operator()) WITH CHECK (is_operator());


-- ============================================================================
-- MIGRATION — Phase 6 (Sprint 0): atomic contact JSON helpers
-- ----------------------------------------------------------------------------
-- The legacy `contacts.notes` column stores a JSON string (TEXT) with shape
--    { "bio": "...", "timeline": [...], "documents": [...] }
-- The previous client-side flow was read → parse → mutate → stringify →
-- write, which is a last-write-wins race. These functions take a row lock,
-- mutate in-memory, and write back atomically. SECURITY INVOKER so RLS
-- still applies — operators bypass via the contacts operator policy.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.contact_append_timeline(
  p_contact_id uuid,
  p_entry jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  current_text text;
  parsed jsonb;
  new_notes text;
BEGIN
  SELECT notes INTO current_text FROM public.contacts WHERE id = p_contact_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact not found: %', p_contact_id;
  END IF;
  IF current_text IS NULL OR current_text = '' THEN
    parsed := '{"bio":"", "timeline":[], "documents":[]}'::jsonb;
  ELSE
    BEGIN
      parsed := current_text::jsonb;
    EXCEPTION WHEN OTHERS THEN
      parsed := jsonb_build_object('bio', current_text, 'timeline', '[]'::jsonb, 'documents', '[]'::jsonb);
    END;
    IF jsonb_typeof(parsed) <> 'object' THEN
      parsed := jsonb_build_object('bio', current_text, 'timeline', '[]'::jsonb, 'documents', '[]'::jsonb);
    END IF;
  END IF;
  parsed := jsonb_set(parsed, '{timeline}', COALESCE(parsed->'timeline', '[]'::jsonb) || p_entry);
  new_notes := parsed::text;
  UPDATE public.contacts SET notes = new_notes WHERE id = p_contact_id;
  RETURN new_notes;
END;
$$;

CREATE OR REPLACE FUNCTION public.contact_add_document(
  p_contact_id uuid,
  p_doc jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  current_text text;
  parsed jsonb;
  new_notes text;
BEGIN
  SELECT notes INTO current_text FROM public.contacts WHERE id = p_contact_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact not found: %', p_contact_id;
  END IF;
  IF current_text IS NULL OR current_text = '' THEN
    parsed := '{"bio":"", "timeline":[], "documents":[]}'::jsonb;
  ELSE
    BEGIN
      parsed := current_text::jsonb;
    EXCEPTION WHEN OTHERS THEN
      parsed := jsonb_build_object('bio', current_text, 'timeline', '[]'::jsonb, 'documents', '[]'::jsonb);
    END;
    IF jsonb_typeof(parsed) <> 'object' THEN
      parsed := jsonb_build_object('bio', current_text, 'timeline', '[]'::jsonb, 'documents', '[]'::jsonb);
    END IF;
  END IF;
  parsed := jsonb_set(parsed, '{documents}', COALESCE(parsed->'documents', '[]'::jsonb) || p_doc);
  new_notes := parsed::text;
  UPDATE public.contacts SET notes = new_notes WHERE id = p_contact_id;
  RETURN new_notes;
END;
$$;

CREATE OR REPLACE FUNCTION public.contact_remove_document(
  p_contact_id uuid,
  p_doc_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  current_text text;
  parsed jsonb;
  filtered_docs jsonb;
  new_notes text;
BEGIN
  SELECT notes INTO current_text FROM public.contacts WHERE id = p_contact_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact not found: %', p_contact_id;
  END IF;
  IF current_text IS NULL OR current_text = '' THEN
    RETURN current_text;
  END IF;
  BEGIN
    parsed := current_text::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN current_text;
  END;
  IF jsonb_typeof(parsed) <> 'object' THEN
    RETURN current_text;
  END IF;
  -- Filter the documents array, dropping the row whose .id matches p_doc_id.
  SELECT COALESCE(jsonb_agg(d), '[]'::jsonb)
    INTO filtered_docs
    FROM jsonb_array_elements(COALESCE(parsed->'documents', '[]'::jsonb)) AS d
    WHERE d->>'id' IS DISTINCT FROM p_doc_id;
  parsed := jsonb_set(parsed, '{documents}', filtered_docs);
  new_notes := parsed::text;
  UPDATE public.contacts SET notes = new_notes WHERE id = p_contact_id;
  RETURN new_notes;
END;
$$;

REVOKE ALL ON FUNCTION public.contact_append_timeline(uuid, jsonb)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contact_add_document(uuid, jsonb)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contact_remove_document(uuid, text)   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contact_append_timeline(uuid, jsonb)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.contact_add_document(uuid, jsonb)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.contact_remove_document(uuid, text)   TO authenticated;

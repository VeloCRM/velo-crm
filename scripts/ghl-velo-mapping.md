# GHL → Velo Field Mapping

**Stage:** V1.5 Stage 1 (diagnostic)
**Created:** 2026-06-26
**Velo schema source of truth:** `src/lib/schema.sql` (tables `patients`, `notes`, `documents`, `payments`, `conversations`, `messages`).
**GHL source:** see `ghl-api-reference.md`.

> Mappings marked **(VERIFY)** depend on real values in `scripts/ghl-sample-data.json` once Ali runs the exploration script. Mappings marked **(DECISION)** need Ali's answer before Stage 2.

---

## 0. Idempotency model — read first

The Velo schema only added external-import keys to **some** tables:

| Velo table | External keys present? | Re-import dedupe basis |
|---|---|---|
| `notes` | ✅ `external_id`, `external_source`, `external_user_id` + partial-unique `(external_source, external_id)` | GHL note id |
| `documents` | ✅ `external_id`, `external_source` + partial-unique `(external_source, external_id)` | GHL document id |
| `patients` | ❌ **none** — only `UNIQUE (org_id, phone)` | **phone number only** |
| `payments` | ❌ none (no `source`, no `external_id`) | — |

**Consequence (FLAG → Stage 2):** patient re-import idempotency currently hinges entirely on phone uniqueness. Contacts with a missing or duplicate phone cannot be safely re-imported. **Recommendation:** add `external_id` + `external_source` (+ partial-unique index) to `patients` as the first Stage-2 migration, mirroring `notes`/`documents`. This makes the Stage-7 "import → Saif reviews → re-import" loop safe and idempotent. Until then, the import must handle phone collisions explicitly.

---

## 1. GHL Contact → Velo `patients`

| GHL field | Velo `patients` column | Transform | Notes |
|---|---|---|---|
| `id` | _(no column yet)_ → propose `external_id` | preserve verbatim | Needed for idempotent re-import. See §0. `external_source = 'ghl'`. |
| `firstName` + `lastName` | `full_name` (NOT NULL) | `` `${firstName} ${lastName}`.trim() ``; fall back to `name`/`contactName`; if all empty → **(DECISION)** skip or `'Unknown Patient'` | Iraqi names often have 3–4 parts; GHL may put them all in `firstName`. Preserve exactly, do not reorder. |
| `phone` | `phone` (NOT NULL, part of `UNIQUE(org_id,phone)`) | normalize to a single canonical format | **(DECISION)** canonical form: store E.164 `+964…`? The prior scripts normalized the *other* way (`+964`→`0`). Pick ONE and apply consistently or the unique constraint splits duplicates. See edge cases. |
| `email` | `email` (nullable) | trim; lowercase | optional |
| `dateOfBirth` | `dob` (`date`) | parse → `YYYY-MM-DD`; invalid/empty → `NULL` | GHL formats vary (VERIFY). |
| gender _(custom field?)_ | `gender` (`patient_gender` enum: `male`/`female`/`other`/`prefer_not_to_say`) | map free text → enum; unknown → `NULL` | GHL has no native gender; likely a custom field (VERIFY). |
| `tags[]` (doctor tag) | `primary_doctor_id` (FK `profiles.id`, nullable) | match tag → the doctor's Velo profile UUID | Requires the 6 staff profiles to exist FIRST (Stage 8). Untagged → `NULL` (= unassigned). Multi-doctor-tagged → **(DECISION)**, see edge cases. |
| allergies _(custom field / notes?)_ | `allergies` (`jsonb`, default `[]`) | array of strings | (VERIFY) likely lives in note prose, not a field → may stay in `notes`. |
| medical history _(custom field / notes?)_ | `medical_history` (`jsonb`, default `{}`) | object | (VERIFY) same caveat. |
| `dateAdded` / `createdAt` | `created_at` | parse → timestamptz | **(DECISION)** preserve original GHL creation date (recommended for history) vs let it default to import time. |
| `country`, `additionalPhones[]`, `additionalEmails[]`, `source` | _(no column)_ | append into a single migration note OR drop | No home for these; preserve the useful ones as an imported note. |
| `customFields[]` (other) | case-by-case | — | **(VERIFY)** — must enumerate every custom field key from the sample before deciding. A clinical custom field (e.g. chart data) would change scope. |

**Not importable into `patients` (no source data in GHL):** `org_id` (set to Saif's org), dental chart, treatment plans — these are net-new in Velo.

---

## 2. GHL Note → Velo `notes`

| GHL field | Velo `notes` column | Transform | Notes |
|---|---|---|---|
| `id` | `external_id` | verbatim | dedupe key |
| _(constant)_ | `external_source` | `'ghl'` | |
| `body` | `body` (NOT NULL) | **(DECISION)** keep HTML vs strip to text | GHL note bodies are HTML. Velo renders `body` as text. Recommend storing a sanitized plain-text conversion, preserving line breaks. If `body` is empty → skip (NOT NULL). |
| `userId` | `external_user_id` | verbatim | preserves GHL author (no FK; GHL users aren't in our `auth.users`). |
| `dateAdded` / `createdAt` | `created_at` | parse → timestamptz | preserve original timestamp (notes are history). |
| — | `created_by` | `NULL` | imported notes have no Velo author. |
| — | `title`, `pinned`, `updated_at`, `updated_by` | defaults (`NULL`/`false`) | |

**Tasks → notes (DECISION):** the prior export folded GHL **tasks** into the same note stream (`[Task] title: description`). Decide whether Saif's GHL tasks should become Velo `notes`, Velo `tasks`, or be dropped. (VERIFY whether tasks carry real clinical content.)

---

## 3. GHL Document → Velo `documents` (+ Storage)

| GHL field | Velo `documents` column | Transform | Notes |
|---|---|---|---|
| document `id` | `external_id` | verbatim | dedupe key; `external_source = 'ghl'` |
| `name`/`fileName`/`title` | `file_name` (NOT NULL) | sanitize | |
| (downloaded bytes) | `storage_path` (NOT NULL) | upload to Storage, store the path | **Bucket = `patient-documents`** (per current schema/PR #4) — NOT the old `documents` bucket the legacy `fetch-documents.mjs` used. Path convention: `{org_id}/{patient_id}/{doc_id}.{ext}`. |
| content-type | `mime_type` | from download response | |
| size | `file_size` (`bigint`) | from downloaded buffer length | |
| `url`/`fileUrl`/`signedUrl` | _(not stored)_ | **download during import** | Signed URLs expire — never persist them. Download → upload → store the Storage path only. |
| — | `uploaded_by` | `NULL` | imported docs have no Velo uploader. |

**Document discovery (VERIFY):** documents may appear via the `/documents` endpoint AND inside `customFields` (URL values) AND `attachments[]`. The import must union all three. (VERIFY which Saif actually uses.)

---

## 4. GHL Payments → Velo `payments` ⚠️ (DECISION — blocking)

**Velo `payments` columns:** `patient_id` (NOT NULL), `treatment_plan_id` (nullable), `amount_minor` (`bigint`, **CHECK > 0**), `currency` (`IQD`/`USD`), `method` (`cash`/`fib`/`zaincash`/`asia_hawala`/`card`/`other`), `recorded_at`, `recorded_by` (nullable), `notes`. **No `external_id`, no `source` column** → no idempotency for payments (FLAG: re-running the import would duplicate payments — Stage 2 must add a dedupe key or a `source`/`external_id` column to `payments`).

Two scenarios, resolved by the exploration probe (`opportunities`/`payments-orders`):

- **A — GHL has structured payments** (opportunities/orders return money): map `amount`→`amount_minor` (after the IQD unit decision, §6), `currency`, payment date→`recorded_at`, contact→`patient_id`, method→`method` (default `other`/`cash` if absent). Clean import.
- **B — payments are prose in notes** (probes empty): options per `ghl-api-reference.md` §6 — (a) regex extraction (lossy; the prior patterns assumed `"X 000id"` = `X×1000 IQD`), (b) Saif provides a spreadsheet export, (c) skip historical payments, import notes verbatim, start fresh in Velo. **Saif must choose.**

**`amount_minor` is positive-only** (`CHECK > 0`) → any zero/negative/"paid nothing" rows are dropped (the prior regex already skipped "paid nothing"/"for free").

---

## 5. Not mapped (no GHL source / out of scope for import)

`appointments` (GHL calendar export is a separate question — VERIFY if Saif wants past appointments), `treatment_plans`, `treatment_plan_items`, `dental_chart_entries`, `xrays`, `conversations`/`messages` (WhatsApp history is in Meta, not GHL), `inventory_items`, `expenses`, `forms`. These start empty in Velo.

> **VERIFY:** does Saif want **appointment history** migrated? If yes, we need the GHL calendar/appointments endpoint shape — add it to the exploration script in a follow-up.

---

## 6. IQD unit — the 1000× risk (DECISION — blocking)

- **Velo schema** names money columns `*_minor` (implying fils, 1 IQD = 1000 fils), **but `src/lib/money.js` stores IQD as whole dinars** (per the product audit, finding D-1). So today a 500,000 IQD payment is stored as `amount_minor = 500000`, not `500000000`.
- **GHL stores amounts as** _(VERIFY against sample)_ — the prior regex produced whole-dinar integers (`"500 000id"` → `500000`), which happens to match Velo's current whole-dinar storage.
- **Action:** in Stage 1, Ali picks 2–3 known payments, tells us the real IQD amount, and we confirm what GHL stored and what Velo would store. **Document the definitive multiplier (×1 or ×1000) before any payment import.** A wrong choice = every historical payment off by 1000×.
- **Also reconcile** the `*_minor`-named-but-dinar-valued inconsistency (D-1) so the import, the ledger (Stage 3), and reports all agree.

---

## 7. Open mapping decisions (consolidated for Ali)

1. Phone canonical format (`+964…` vs `0…`) — pick one.
2. Empty-name contacts — skip or placeholder?
3. Preserve original GHL `created_at` timestamps? (recommend yes)
4. Note bodies — keep HTML or convert to plain text? (recommend plain text)
5. GHL tasks — become Velo notes, tasks, or dropped?
6. Multi-doctor-tagged contacts — primary doctor rule (see edge cases).
7. Payments — scenario A or B/(a,b,c) above.
8. IQD multiplier — ×1 or ×1000 (blocking).
9. Appointment history — migrate or not?
10. Add `external_id` to `patients` (and a dedupe key to `payments`) before import? (recommend yes)

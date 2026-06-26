# GHL Import Pipeline — Status Assessment

**Stage:** V1.5 Stage 1 (read-only audit of existing scripts)
**Created:** 2026-06-26
**Scope:** every GHL-related script in `scripts/`. Read-only; nothing modified or run.
**Schema ground truth:** `src/lib/schema.sql` — current V1 tables are `patients`, `notes`, `documents`, `payments` (all `org_id`-scoped + RLS). (`ARCH-V2-PLATFORM.md` proposes a *future* `org_id→org_id_v1` + `doctor_id` migration — **not applied**; ignore for now.)

## TL;DR

The pipeline splits cleanly in two:
- **EXPORT (GHL → local `export/` folder): WORKS and is reusable.** Including documents — `download-ghl-docs.mjs` already solved the document problem using GHL's *internal* document API via a logged-in browser session.
- **IMPORT (local → Velo Supabase): BROKEN.** Every write-side script targets a **pre-V1 `contacts` schema** (a single `user_id`-owned `contacts` table with a JSON `notes` blob, plus flat `payments`/`documents` keyed by `contact_id`). None of it matches current V1 (`patients`/`notes`/`documents`/`payments` with `org_id`, RLS, and `external_id` idempotency). This is audit finding **SB-1** (`scripts/v1.5-product-audit-systematic.md:34`, pointing at `velo-import.mjs:247`).

---

## Per-script assessment

### EXPORT side (GHL → local) — reusable

#### `scripts/ghl-export.mjs` — PARTIALLY WORKS (export only)
- **What it does:** Paginates all GHL contacts → `export/patients.csv`; for doctor-tagged contacts fetches notes + tasks → `export/notes/{id}.json`; attempts document download from `customFields` URL values and `attachments[]`.
- **GHL endpoints:** `GET /contacts/` (cursor pagination `startAfterId`), `GET /contacts/{id}/notes`, `GET /contacts/{id}/tasks`.
- **Velo/Supabase writes:** none (local files only).
- **Puppeteer:** no.
- **Documents:** via `customFields`/`attachments` URLs only — which the Stage-1 exploration showed are usually empty; the real docs are on the contact "Documents" tab (see `download-ghl-docs.mjs`). So its doc path finds little.
- **State:** GHL API patterns valid; usable as a contacts+notes exporter. Doc handling here is superseded.

#### `scripts/ghl-fetch-notes.mjs` — WORKS (most comprehensive exporter)
- **What it does:** Reads a GHL-UI-exported CSV for the contact list, then per contact fetches full detail + notes + tasks + **appointments** + **conversations/messages** → rich `export/contacts/{id}.json`. Resumable (skips already-exported ids).
- **GHL endpoints:** `GET /contacts/{id}`, `/contacts/{id}/notes`, `/contacts/{id}/tasks`, `/contacts/{id}/appointments`, `/conversations/search?contactId=`, `/conversations/{id}/messages`. Also downloads `customFields` file URLs.
- **Velo/Supabase writes:** none (local files).
- **Puppeteer:** no.
- **Documents:** only `customFields` URLs (same limitation as above).
- **State:** Best export base for Stage 2 — it already captures appointments + message history (which the newer `ghl-api-exploration.mjs` does not). Note it depends on a manually-downloaded CSV for the id list.

#### `scripts/run-export.mjs` — WORKS (resilient runner) ⚠️ secret
- **What it does:** Loops `ghl-fetch-notes.mjs` as a child process with a 3-min timeout, restarting until `_export_meta.json` exists; writes `export/progress.json`.
- **Endpoints/writes/Puppeteer:** delegates to `ghl-fetch-notes.mjs`; no Velo writes; no Puppeteer.
- **State:** Works. **🚩 SECURITY: line 21 hardcodes a real GHL Private Integration Token** `pit-96a0b8e5-…` committed to the repo — must be **rotated** and moved to `.env.local`. Line 22 hardcodes a local Downloads CSV path. Line 29 hardcodes a `3171` fallback total.

#### `scripts/check-progress.mjs` — WORKS (read-only)
- Local-only progress reporter over `export/contacts/` + `patients.csv`. No GHL calls, no Velo writes, no Puppeteer. Fine as-is.

#### `scripts/download-ghl-docs.mjs` — WORKS ⭐ (the document solution)
- **What it does:** The key script. Downloads each contact's "Documents"-tab files via GHL's **internal** document API, authenticated with **session headers sniffed from a logged-in browser**. Saves to `export/documents/{contactName}/`. Resumable.
- **GHL endpoints (internal, not the public API):**
  - List: `GET https://services.leadconnectorhq.com/documents/search?locationId={LOC}&contactId={id}&skip=0&limit=100&type=file`
  - Download: `GET https://services.leadconnectorhq.com/documents/download/{docId}`
  - Doc object shape: `{ id, name, type:'file', status:'completed', extension }`.
- **Auth (critical):** NOT the API key. It uses **UI session headers** — `token-id`, `channel: APP`, `source: WEB_USER`, `version: 2021-07-28` — captured by listening to the GHL web app's own XHR requests (lines 275–301). This is exactly the internal endpoint the prior "document API research" doc predicted we'd need DevTools to find — **it's already implemented here.**
- **Puppeteer:** **YES.** `puppeteer.connect()` to a Chrome the user starts manually with `--remote-debugging-port=9222` (lines 142–165), into which **Ali logs into GHL by hand**. The script opens a tab, navigates to a contact to capture the `token-id` header, then calls the document API directly. It does **not** automate login (that's `debug-ghl-login.mjs`).
- **Velo/Supabase writes:** none (saves files locally; upload is a separate step).
- **State:** This is the working path for documents. **🚩 line 54 hardcodes `LOCATION_ID = 'i7xxTT5qM4l9N3fjZZSU'`** — this is **Saif's** GHL location (confirmed: same id in `ghl-sample-data.json`), so convenient now but should be env-driven before reuse. The captured `token-id` is short-lived (a UI session token) → must run in one session.

#### `scripts/debug-ghl-login.mjs` — WORKS (diagnostic)
- **What it does:** Launches real Chrome via `puppeteer-extra` + stealth plugin to debug the GHL login page (logs network failures, screenshots, input fields).
- **Puppeteer:** YES — `puppeteer-extra-plugin-stealth`, `headless:false`, `executablePath` to local Chrome, `userDataDir: .chrome-profile`.
- **Velo writes:** none. **State:** a login-debug utility, not part of the import path. Documents the login flow if full automation is ever needed.

### IMPORT side (local → Velo) — BROKEN vs current schema

> All of these write to the **pre-V1 `contacts` schema**. Verified against `src/lib/schema.sql`: there is **no `contacts` table** (it's `patients`), no `contacts.notes` JSON blob (notes are a flat `notes` table), `payments` uses `amount_minor`/`patient_id`/`org_id` (not `amount`/`contact_id`/`user_id`), and `documents` uses `patient_id`/`file_name`/`storage_path`/`org_id` (not `contact_id`/`filename`/`url`).

#### `scripts/velo-import.mjs` — BROKEN (SB-1 root)
- **What it does:** Reads `export/` → inserts contacts; flattens notes+tasks+DOB+meta into one text blob; uploads doc folders to a `documents` bucket.
- **Velo writes:** `.from('contacts').insert({ user_id, name, email, phone, company, city, category, status, tags[], source, notes })` (**line 247**); `storage.from('documents')`.
- **DELETED-schema lines:** `velo-import.mjs:247` (`.from('contacts')`), the whole `contactData` object `225–237` (`user_id`, `name`, `company`, `city`, `category`, `status`, `tags[]`, `notes`-as-text — none exist on `patients`), and `288–290` (`documents` bucket, now `patient-documents`).
- **State:** Will fail/no-op against current schema. Lossy by design (no structured payments, notes as one text field). **Replace, don't patch.**

#### `scripts/extract-payments.mjs` — BROKEN + superseded approach
- **What it does:** Regex-scrapes payment amounts from note prose ("paid 500 000id") → inserts into `payments`.
- **Velo writes:** `.from('contacts').select(... source='ghl_import')` (line 233) and `.from('payments').insert({ user_id, contact_id, amount, currency, method, status, payment_date, description, source, note_id })` (line 310).
- **DELETED-schema lines:** `233` (`.from('contacts')`), `266–277` + `310` (payment columns `user_id`/`contact_id`/`amount`/`status`/`payment_date`/`source`/`note_id` — current `payments` has `org_id`/`patient_id`/`amount_minor`/`recorded_at`, none of those).
- **State:** Broken vs schema. The regex approach is also lossy (Stage-1 finding) — but note the Stage-1 probe found GHL **does** expose structured payments via `/payments/transactions`, so Stage 2 should prefer that + decide on prose extraction. Replace.

#### `scripts/fetch-documents.mjs` — BROKEN (wrong endpoint + old schema)
- **What it does:** Tries to fetch docs via `GET /contacts/{id}/documents` (which **404s** — wrong endpoint; the working one is `/documents/search` in `download-ghl-docs.mjs`), then uploads to `documents` bucket + table.
- **Velo writes:** `.from('contacts')` (lines 167) and `.from('documents').insert({ contact_id, filename, size, url, uploaded_at })` (305–313); `storage.from('documents')`.
- **DELETED-schema lines:** `167` (`.from('contacts')`), `305–313` (`documents` columns `contact_id`/`filename`/`url` — current uses `patient_id`/`file_name`/`storage_path`/`org_id`), `documents` bucket vs `patient-documents`.
- **State:** Doubly broken (404 endpoint + old schema). Superseded by `download-ghl-docs.mjs` for fetch. Replace.

#### `scripts/upload-docs-to-supabase.mjs` — BROKEN (old schema)
- **What it does:** Uploads locally-downloaded docs (from `download-ghl-docs.mjs`) to Supabase, matching folders→contacts by phone/name; updates `contacts.notes` JSON `documents[]`.
- **Velo writes:** `.from('contacts').select(... source='ghl_import')` (200), `storage.createBucket('documents')` (187), `.from('documents').insert({ contact_id, filename, size, url, uploaded_at })` (346–354), `.from('contacts').update({ notes })` (381).
- **DELETED-schema lines:** `187` (`documents` bucket), `200`/`381` (`.from('contacts')` + JSON `notes`), `346–354` (old `documents` columns).
- **State:** Broken vs schema. This is the correct *concept* for the upload step (local docs → Storage + table) and pairs with `download-ghl-docs.mjs` — but must be rewritten for `patient-documents` bucket + `documents(org_id, patient_id, file_name, storage_path, mime_type, file_size, external_id, external_source)`.

#### `scripts/migrate-notes-to-timeline.mjs` — BROKEN (old model)
- **What it does:** Restructures `contacts.notes` text → JSON `{bio, timeline[], documents[]}`.
- **Velo writes:** `.from('contacts').update({ notes: json })` (172).
- **DELETED-schema lines:** entire premise — current notes live in a **flat `notes` table** (`org_id, patient_id, body, external_id, external_source, external_user_id`), not a JSON blob on a `contacts` row. Obsolete; do not port.

---

## Puppeteer summary

| Script | Puppeteer? | How |
|---|---|---|
| `download-ghl-docs.mjs` | ✅ | `puppeteer.connect()` to a manually-started Chrome (`--remote-debugging-port=9222`) that **Ali logs into GHL by hand**; sniffs `token-id`/`channel`/`source` UI headers from the app's XHR, then calls the internal `/documents/search` + `/documents/download/{id}` endpoints directly. Saves to `export/documents/`. **This is the document download mechanism.** |
| `debug-ghl-login.mjs` | ✅ | `puppeteer-extra` + stealth, launches real Chrome with a persistent `.chrome-profile` to debug the login page. Diagnostic only. |
| all others | ❌ | API-key fetch or local file ops only. |

**Credentials needed for the document path:** a logged-in GHL **browser session** (manual login), Chrome started with remote debugging on 9222, and the target `LOCATION_ID`. No public API document scope exists (per `ghl-document-api-research.md`) — the session `token-id` is the only auth that reaches these endpoints.

---

## Hardcoded / clinic-specific values to parameterize (flags)

| Where | Value | Action |
|---|---|---|
| `run-export.mjs:21` | **GHL PIT token `pit-96a0b8e5-…`** committed in repo | 🚩 **Rotate the token** + move to `.env.local`. Real secret in git history. |
| `run-export.mjs:22` | hardcoded Downloads CSV path | parameterize via `--csv`/env |
| `run-export.mjs:29` | `3171` fallback total | derive from CSV |
| `download-ghl-docs.mjs:54` | `LOCATION_ID = 'i7xxTT5qM4l9N3fjZZSU'` (**Saif's** location, per `ghl-sample-data.json`) | move to env; not Le Royal — but still hardcode-flagged |
| `debug-ghl-login.mjs:14` | `C:\Program Files\Google\Chrome\...` path | env/config for portability |

> No **Le Royal** org/location IDs were found hardcoded; the only embedded location id is **Saif's** (`i7xxTT5qM4l9N3fjZZSU`). The Supabase target in every import script comes from CLI/env (`--supabase-url`/`--supabase-key`/`--user-id`), so no prod project id is baked in — but `--user-id` (`VELO_USER_ID`) reflects the old single-owner model and has no place in the `org_id`/RLS schema.

---

## What it would take to revive this for Saif's import (Stage 2)

**Keep (export side):**
1. Reuse `ghl-fetch-notes.mjs` (contacts + notes + tasks + appointments + messages) and/or the newer `ghl-api-exploration.mjs` patterns for the export.
2. Reuse `download-ghl-docs.mjs` **as-is conceptually** for documents — it's the only working doc path. Parameterize `LOCATION_ID`; run in one logged-in session (short-lived `token-id`).
3. Prefer structured payments via `/payments/transactions` (Stage-1 finding) over the `extract-payments.mjs` regex; keep regex only as a supplement if Saif confirms prose is the real source.

**Rewrite (import side) — net-new against V1 schema:**
4. New importer writing to **`patients`** (`org_id`, `full_name`, `phone`, `email`, `dob`, `gender`, `medical_history`, `allergies`, `primary_doctor_id`) — resolve doctor tag → `primary_doctor_id`; set `org_id` to Saif's org; **add `external_id`/`external_source` to `patients` first** (Stage-2 migration) so re-import is idempotent (currently only `UNIQUE(org_id, phone)`).
5. Notes → flat **`notes`** table (`body`, `external_id`=GHL note id, `external_source='ghl'`, `external_user_id`=GHL author). Use GHL's `bodyText` (plaintext is provided).
6. Documents → **`patient-documents`** bucket + **`documents`** table (`patient_id`, `file_name`, `storage_path`, `mime_type`, `file_size`, `external_id`, `external_source`). Rewrite `upload-docs-to-supabase.mjs` for these columns; download-during-import (signed URLs expire).
7. Payments → **`payments`** (`org_id`, `patient_id`, `amount_minor`, `currency`, `method`, `recorded_at`) — apply the **IQD ×1 (whole-dinar)** decision; add a dedupe key to `payments` (no `external_id` today).
8. **Drop** `migrate-notes-to-timeline.mjs` entirely (obsolete model).
9. Run everything against **staging first** (per `staging-supabase-setup.md`), idempotently, before production.

**Net:** ~50% of the pipeline (the export half, incl. the hard-won document mechanism) is salvageable; the import half is a clean rewrite against the V1 `org_id`/RLS schema. The single most valuable artifact uncovered is the **internal document endpoint + session-header auth** in `download-ghl-docs.mjs`, which answers the open document-download question from `ghl-document-api-research.md`.

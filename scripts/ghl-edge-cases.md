# GHL Import — Edge Cases & Risks

**Stage:** V1.5 Stage 1 (diagnostic)
**Created:** 2026-06-26
**How to fill the (VERIFY) blanks:** Ali runs `scripts/ghl-api-exploration.mjs`, then we walk `scripts/ghl-sample-data.json` together. The categories below are the known traps from the prior Le Royal import plus schema-driven risks; each gets a concrete handling rule for the Stage-2 pipeline.

---

## 1. Doctor tags

The whole "Saif vs Hawkar" caseload split rides on tags → `primary_doctor_id`. From the prior export, matching was a naive substring check (`tag.toLowerCase().includes('saif')`).

- **Tag variations (VERIFY):** collect EVERY unique tag string (the script dumps `tags.all`). Expect variants: `Saif`, `Dr Saif`, `dr. saif`, `DR SAIF`, `saif`, Arabic spellings. Build an explicit **normalization map** (variant → canonical doctor profile UUID). Do NOT rely on substring matching for a 6-doctor clinic — "saif" could match unintended tags.
- **Untagged contacts:** `primary_doctor_id = NULL` (unassigned/shared). Count them — if a large fraction is untagged, flag to Saif (he may expect everyone assigned).
- **Multi-doctor tags (DECISION):** a contact tagged BOTH `Saif` and `Hawkar`. `primary_doctor_id` holds exactly one. Rule options: first-tag-wins, most-recent-visit-wins, or leave NULL + add both as note context. **Saif decides.**
- **Non-doctor tags:** GHL tags also carry marketing/status labels (`lead`, `cold`, campaign names). These must NOT be interpreted as doctors. The normalization map is an allowlist of doctor tags only.
- **The 4 doctors:** only Saif + Hawkar were tagged in the prior data. The 2 new doctors (names TBD) likely have **no historical tags** → their patients don't exist yet, fine. Confirm.

## 2. Phone numbers (the dedupe key)

Patient idempotency currently = `UNIQUE(org_id, phone)`, so phone hygiene is critical.

- **Format variations (VERIFY):** `+9647…`, `07…`, `7…`, spaces/dashes, leading `00964`. Pick ONE canonical form and normalize every row to it, or the unique constraint treats `+9647xx` and `07xx` as different patients (split duplicates) — or worse, collides two different people if normalization is too aggressive.
- **Missing phone:** `phone` is NOT NULL. Contacts with no phone **cannot be inserted as-is**. Options: synthesize a placeholder (`no-phone-{ghlId}`), or skip + report. Count these — marketing leads often have no phone.
- **Duplicate phones in GHL:** two GHL contacts, same phone → second insert violates the unique constraint. Decide: merge (combine notes/docs onto one patient) vs keep-first + report. Merging is safer for data fidelity.
- **Shared phones:** family members sharing one number is common. Same collision as above — Saif should expect some merges; flag for his review in Stage 7.

## 3. Names

- **Empty names (VERIFY/DECISION):** `full_name` is NOT NULL. Placeholder vs skip.
- **All-in-firstName:** multi-part Iraqi names may sit entirely in `firstName`. Concatenation handles it; don't try to "fix" name order.
- **Encoding:** ensure Arabic UTF-8 round-trips (it did in the prior export, but verify in the sample — no mojibake).

## 4. Notes

- **HTML bodies:** GHL notes are HTML (`<p>…`, `&nbsp;`, etc.). Velo `body` renders as text. Convert to clean plain text (preserve line breaks) — the prior `stripHtml` is a starting point. Empty-after-strip → skip (NOT NULL).
- **Payment prose inside notes:** see §6 — many "notes" are actually payment records typed as text.
- **Very long notes:** the prior import truncated to 5000 chars. Velo `body` is `text` (unbounded) → no need to truncate; preserve full history.
- **Author:** preserved via `external_user_id` (GHL `userId`). No FK — fine.

## 5. Documents

- **Expiring signed URLs:** GHL doc URLs (Google CDN) are time-limited → **download during the import run**, never store the URL (dead-link risk). This is the #1 document risk.
- **Discovery in 3 places:** `/documents` endpoint + `customFields` URL values + `attachments[]`. Union all three (VERIFY which Saif uses).
- **File types (VERIFY):** X-rays, photos (HEIC from iPhones?), PDFs, scans. The `patient-documents` bucket has an 8-MIME allowlist + 25 MB cap (per PR #4). Files outside the allowlist or over 25 MB will be rejected → enumerate types in the sample, widen the allowlist or special-case before import.
- **Unmatched documents:** the prior doc-fetch matched by phone and skipped no-match. Track and report skips so nothing is silently lost.
- **Bucket mismatch:** legacy `fetch-documents.mjs` wrote to a `documents` bucket; current target is **`patient-documents`**. Use the current bucket.

## 6. Payments ⚠️ (biggest single risk)

- **Likely no structured payments** — the prior import regex-scraped them from note prose. The exploration script's opportunities/orders probe confirms (see `ghl-api-reference.md` §6). If empty → **blocking product decision** (regex / spreadsheet / fresh start).
- **IQD 1000× risk:** the prose patterns assumed `"X 000id"` = `X×1000` IQD. Combined with the `*_minor`-named-but-dinar-valued storage (D-1), one wrong assumption = every payment off by 1000×. Resolve the multiplier in Stage 1 (§6 of the mapping doc).
- **No payment idempotency:** `payments` has no `external_id`/`source` → re-import duplicates. Add a dedupe key in Stage 2 before importing.
- **Positive-only:** `amount_minor CHECK > 0` drops zero/negative/"paid nothing".
- **Currency mix:** both IQD and USD appear in the prose ("200$"). Each payment needs the right `currency`; never sum across currencies.

## 7. Custom fields (VERIFY — could change scope)

- Enumerate EVERY `customFields` key in the sample. The risk: a custom field holds **clinical data** (chart notes, treatment history, allergies, medical history) we didn't plan to map. If so, it changes Stage-2 scope (and may need a real home in `medical_history`/`allergies`/`notes`). **FLAG urgently if found.**

## 8. Scale (3,171 contacts)

- **Rate limits:** ~100 req/min. Full extract (contacts + per-contact notes/tasks/docs) ≈ 10k+ calls ⇒ hours. Run paginated, throttled, resumable, overnight. Idempotent design lets a crashed run resume.
- **Marketing leads vs patients:** the prior export found the location holds many non-patient marketing contacts; it filtered to doctor-tagged ones. Decide whether to import only doctor-tagged (≈ the real patients) or all 3,171. Saif said 3,171 contacts — confirm that's patients, not patients+leads.

## 9. Data types Velo can't currently hold (document gaps)

- **Appointment history** — no import path planned (VERIFY if wanted).
- **WhatsApp/SMS conversation history** — lives in Meta/GHL messaging, not in scope; Velo starts conversations fresh.
- **Signatures / e-sign artifacts, videos** — no schema home; if present in documents, handle as files in the bucket (subject to MIME allowlist) or document as a gap.

## 10. Idempotency summary (carry into Stage 2)

| Object | Current dedupe | Action needed |
|---|---|---|
| patients | `UNIQUE(org_id, phone)` only | add `external_id`+`external_source`+partial-unique (recommended) |
| notes | `(external_source, external_id)` partial-unique | ✅ ready |
| documents | `(external_source, external_id)` partial-unique | ✅ ready |
| payments | none | add dedupe key/`source` before import |

---

### Severity tags for the above (for triage)
- **BLOCKING:** payments scenario + IQD multiplier (§6); patient idempotency / phone canonicalization (§2, §10).
- **HIGH:** doctor-tag normalization & multi-tag rule (§1); document expiring URLs + MIME allowlist (§5); custom-fields-with-clinical-data (§7).
- **MEDIUM:** empty names/phones handling (§2,§3); tasks→notes decision (§4); appointment-history scope (§9).

---

## 11. Stage 1 corrections (locked 2026-06-26)

Findings from the Stage 1 GHL exploration run. These **resolve or refine** the open items above.

### 11.1 Currency / IQD multiplier — RESOLVED (closes §6 IQD-1000× blocker)

- **IQD multiplier is ×1 (passthrough), NOT ×1000.** GHL whole dinars → Velo `amount_minor` whole dinars 1:1 (`"160000 paid"` → `160000`). Matches `src/lib/money.js` `CURRENCY_DIVISOR.IQD = 1`. The `*_minor` name is a misnomer for IQD — do **not** restore fils.
- **USD multiplier is ×100** (whole dollars → cents): `"endo by 250$"` → `25000`.
- **Currency-detect BEFORE scaling.** The prose parser must read the currency token first: `$`/`USD` → ×100; `IQD`/`دينار`/bare number → ×1. The old "`X 000id` = ×1000" assumption is **retired** — it would inflate every IQD payment 1000×.
- **Ambiguous bare numbers → manual-review queue, never silently scaled.** No `$`/`USD`/`IQD`/`دينار` token and no disambiguating context ⇒ flag, don't guess.
- **Filter test transactions out** before the prose extraction writes to `payments`.

### 11.2 Payments are prose, not structured (confirms §6 → scenario B)

- Structured payments are **tiny (~6 rows for the whole location)** — the opportunities/orders probe is effectively empty. **Real payment history lives in note `bodyText` prose.** Proceed as scenario B (regex/parse from prose).
- **`bodyText` is available as plaintext** from the API — the payment parser reads it directly, no HTML stripping required (HTML→text still applies to note *storage* per §4).

### 11.3 Documents — UI-only, Puppeteer download (refines §5)

- GHL documents have **no public API**; they are UI-only. Download via **`download-ghl-docs.mjs`** (Puppeteer), not an API endpoint. The expiring-signed-URL rule (§5) still governs: download during the run, store only the Storage path.

### 11.4 Data-quality flags (new traps for the §2/§3/§7 handlers)

- **DOBs are synthetic/placeholder** — GHL `dateOfBirth` is not real data. Import if present but **never treat as clinical truth**.
- **`+974` (Qatar) phone numbers seen** — data-entry artifacts, not real Qatari patients. **Flag in phone normalization (§2)**; do not silently treat as valid Iraq numbers.
- **Parenthetical names** in name fields (e.g. `Ahmed (brother of Ali)`) need a **normalization rule** (§3) — strip/relocate the parenthetical to a note, don't embed in `full_name`.
- **`customFields` empty in modern contacts** — **relaxes §7** for current records (no hidden clinical data there); still enumerate for legacy contacts before assuming clean.
- **GHL author IDs on notes** → map to a **migration-source marker**, not a Velo user (keep raw `userId` in `external_user_id` as provenance — §4; never an `auth.users` FK).

### Updated severity
- **RESOLVED:** IQD multiplier (was BLOCKING) → ×1, locked.
- **Still BLOCKING:** patient idempotency / phone canonicalization (§2, §10).
- **New HIGH:** currency-detect-before-scale + ambiguous-number flagging in the prose payment parser (§11.1); filter test transactions (§11.1).
- **New MEDIUM:** parenthetical-name normalization (§11.4); `+974` phone flagging (§11.4).

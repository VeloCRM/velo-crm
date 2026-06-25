# GHL (GoHighLevel / LeadConnector) API Reference — for Velo Import

**Stage:** V1.5 Stage 1 (diagnostic)
**Created:** 2026-06-26
**Status:** Derived from the prior Le Royal import toolchain in `scripts/` (`ghl-export.mjs`, `fetch-documents.mjs`, `extract-payments.mjs`, `debug-ghl-login.mjs`). Endpoint shapes marked _(to confirm)_ are verified when Ali runs `scripts/ghl-api-exploration.mjs`.

> This documents how we read GHL. It is **read-only** reconnaissance — no GHL writes anywhere in our toolchain.

## 1. Authentication

- **Base URL:** `https://services.leadconnectorhq.com` (the LeadConnector v2 API).
- **Headers on every request:**
  - `Authorization: Bearer <API_KEY>`
  - `Version: 2021-07-28` (required; requests without it 4xx)
  - `Accept: application/json`
- **Key type:** A Location API key / Private Integration token scoped to Saif's location works. The key + `GHL_LOCATION_ID` go in `.env.local` (gitignored).
- **Where Ali finds them:** GHL → Settings → Business Profile → API Keys (key); Settings → Business Profile or the app URL `.../location/<ID>/...` (location id).

> **Legacy note:** the old `debug-ghl-login.mjs` automated the GHL **web app** login with Puppeteer (`app.gohighlevel.com/login`, real Chrome, stealth plugin). That existed because some data (notably **payment history**) was not reachable via the API and had to be read from the UI. See §6.

## 2. Rate limits

- Practical ceiling ~**100 requests/minute** per the prior export (it used 300–400 ms delays between calls).
- **429 handling:** back off and retry. The exploration script waits `attempt × 20s` on a 429, up to 3 attempts. The full Stage-2 import (3,171 contacts × notes+tasks+docs ≈ 10k+ calls) must run **paginated, throttled, and ideally overnight** (Risk 1 in the master plan).

## 3. Pagination

- **Contacts:** `GET /contacts/` with `locationId`, `limit` (max 100), and `startAfterId` (cursor = the last contact's `id`). Loop until an empty page. (Some GHL tenants also return `meta.startAfter`/`startAfterId`; cursor-by-last-id is what the prior export used and is safe.)
- Per-contact subresources (notes/tasks/documents) are small and generally returned unpaginated for our volumes.

## 4. Endpoints used

| Purpose | Method + path | Key params | Response shape (observed) |
|---|---|---|---|
| List contacts | `GET /contacts/` | `locationId`, `limit`, `startAfterId` | `{ contacts: [ {...} ], meta?: {...} }` |
| Contact notes | `GET /contacts/{id}/notes` | — | `{ notes: [ { id, body, dateAdded, userId } ] }` |
| Contact tasks | `GET /contacts/{id}/tasks` | — | `{ tasks: [ { id, title, description, dueDate, completed } ] }` |
| Contact documents | `GET /contacts/{id}/documents` | — | `{ documents: [ { name/fileName, url/fileUrl/signedUrl, size } ] }` _(shape varies — handle all 3 url keys)_ |
| Location tags | `GET /locations/{locationId}/tags` | — | `{ tags: [ { name } ] }` or `[ "tag" ]` _(to confirm)_ |
| Opportunities (payments?) | `GET /opportunities/search` | `location_id` (snake_case in v2 search), `limit` | `{ opportunities: [ { monetaryValue, pipelineId, status, contactId } ] }` _(to confirm)_ |
| Payments orders | `GET /payments/orders` | `locationId` / `altId`+`altType=location`, `limit` | _(to confirm — likely 401/404 if the GHL Payments product is unused)_ |
| Payments transactions | `GET /payments/transactions` | same | _(to confirm)_ |

### Contact object — fields the prior export relied on
`id`, `firstName`, `lastName`, `name`/`contactName`, `email`, `phone`, `dateOfBirth`, `dateAdded`/`createdAt`, `tags: string[]`, `source`, `country`, `additionalPhones[]`, `additionalEmails[]`, `customFields: [{ id/fieldKey, value }]`, `attachments: [{ url, name/fileName }]`.

- **Documents live in two places:** the dedicated `/documents` endpoint **and** inside `customFields` whose value is a URL (often `storage.googleapis.com`) or an array of URLs, plus an `attachments[]` array. The import must check all three.

## 5. Error handling

- `401/403` → bad/expired key or missing `Version` header.
- `404 / 422` on a subresource (e.g. a contact with no notes) → treat as "empty", not fatal (prior code swallows these).
- `429` → back off (see §2).
- Document URLs are **time-limited signed URLs** (Google CDN). They must be **downloaded during the import run** and re-uploaded to Supabase Storage — never stored as-is (they expire → dead links). This is Risk 2 in the master plan.

## 6. ⚠️ The payments question (biggest unknown)

The prior migration did **not** import structured payments. `extract-payments.mjs` **regex-scraped payment amounts out of free-text note bodies** (e.g. `"He paid 500 000id"`, `"paid 200$"`, Arabic `"دفع ..."`). That strongly implies GHL held **no structured payment records** for this clinic — payments were typed as prose by staff.

`scripts/ghl-api-exploration.mjs` probes `/opportunities/search`, `/payments/orders`, `/payments/transactions` to settle this definitively:
- **If those endpoints return real money records** → Stage 2 imports structured payments (clean).
- **If they 404/401/empty** → payments exist only as note prose. Then the options are: (a) re-run the regex extraction (lossy, error-prone, needs Saif to validate amounts), (b) Saif provides a separate payment export (spreadsheet), or (c) import note text verbatim and start fresh financial records in Velo. **This is a blocking product decision** (see `ghl-edge-cases.md` and master-plan open questions).

## 7. What the exploration script outputs

`scripts/ghl-api-exploration.mjs` → `scripts/ghl-sample-data.json` (gitignored; real patient data). It records, per endpoint, the HTTP status, any error body, and a sample payload — so we can finalize `ghl-velo-mapping.md` against **real shapes**, not assumptions. The terminal summary (counts only, no PHI) is safe to share.

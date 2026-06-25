# GHL Contact-Documents API — Research Findings

**Stage:** V1.5 Stage 1 (diagnostic, read-only research)
**Created:** 2026-06-26
**Question:** Which GHL API endpoint (a) lists files attached to a specific contact (the contact "Documents" tab) and (b) returns/mint a downloadable signed URL?
**Confirmed context:** The files exist as signed Google Cloud Storage URLs, bucket `crm-contacts-docs-production`, pattern `…/{LOCATION_ID}/{DOC_ID}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Expires=600&…` (10-minute expiry), surfaced in the GHL UI's per-contact **Documents** tab.

> Method: web research of GHL's official support portal, marketplace developer docs, the public API-docs GitHub repo, the ideas/changelog portal, and our own Stage-1 probe results. **No API calls were made.** The marketplace docs render client-side (not machine-readable via fetch), so where a claim couldn't be verified from a readable source it is marked **UNVERIFIED** rather than guessed.

---

## ⚠️ Headline finding (flag)

**There is no documented public GHL API endpoint that lists a contact's uploaded "Documents"-tab files or mints signed download URLs for them.** The signed `crm-contacts-docs-production` URLs are produced by GHL's **internal UI backend**, not by any endpoint exposed in the public v2 API. This matches the guardrail scenario *"documents API isn't publicly available (private to GHL UI only)."*

Three independent lines of evidence:

1. **The public "Documents & Contracts" API is a different product.** It exposes only: **List Documents, Send Document, List Templates, Send Template** — all for **e-signature proposals/contracts** at the *location* level. It has **no `contactId` filter, no uploaded-file listing, and no signed/download URL** in responses. (GHL Support: "Documents & Contracts: Public APIs".)
2. **The Feb 14 2024 changelog "File and image upload through Document API"** centralizes form/survey file uploads so they appear on the contact Documents tab — but it is explicitly **UI-only** ("navigate to contacts page → document tab → received tab → Forms/Survey folders"). It announces **no API endpoints, methods, or signed URLs**.
3. **Open, unresolved feature requests** ask for exactly this ("Add uploading files to contacts", "add ability to add Files to Contact/Opportunity"). The only semi-official reply points to the **conversations/messages** attachment endpoint — i.e. messaging media, **not** contact-tab files. Open requests = the capability is **not** in the public API.

Our own Stage-1 probes corroborate: `/contacts/{id}/documents`, `/contacts/{id}/files`, `/contacts/{id}/attachments` all returned **404 (route not found)**.

---

## Confirmed endpoints (what DOES exist publicly)

| Endpoint | Method | Base | Covers | Relevant to Saif's scans? |
|---|---|---|---|---|
| `/documents/` (Documents & Contracts) | GET (List) | `services.leadconnectorhq.com` | e-signature **proposals/contracts** at location level | ❌ No — not uploaded contact files; no contactId filter, no signed URL |
| `/documents/send`, `/templates`, `/templates/send` | POST/GET | same | send/templates for proposals | ❌ No |
| `/medias/files` | GET | same | **location Media Library** (form/survey/centralized uploads may land here) | ⚠️ Maybe — location-level, not contact-linked; our call currently 422s (param issue, see `ghl-api-exploration.mjs` Step 5 variants) |
| `/conversations/messages/upload-file-attachments` | POST | same | **message** attachments (upload only) | ❌ No — messaging media, not the Documents tab |
| `/forms/upload-custom-files` | POST | same | upload a file into a **custom field** | ❌ Upload-only (not a read/list path) |
| `/contacts/{id}` | GET | same | contact incl. `customFields[]` | ✅ **Yes, IF** scans were attached via a **File Upload custom field** — the value is a URL (or array). This is the one documented path by which contact files are API-readable. |

**The only documented way a contact's files are API-readable is via a File-Upload *custom field*** (GHL Support: "Adding Files To Contacts using a Custom Field"; accepts PDF/DOC/DOCX/JPG/PNG/GIF/XLS/CSV up to 250 MB). Whether Saif's scans were uploaded that way (vs. dragged into the Documents tab) is the pivotal unknown — and is exactly what `ghl-api-exploration.mjs` Step 6 (oldest-contacts `customFields` probe) now checks.

---

## Authentication requirements

- **v1 API keys are deprecated/end-of-support.** v2 uses **Private Integration Tokens (PIT)** or **OAuth2**, against `services.leadconnectorhq.com` with header `Version: 2021-07-28`.
- Our exploration key already reads contacts/notes/tags successfully → it has at least contacts-read scope. If the scans live in **custom fields**, **no new auth is needed** — the current key + a contacts-read scope returns them via `GET /contacts/{id}`.
- Exact scope names (`contacts.readonly`, `medias.readonly`, etc.) are **UNVERIFIED** — the marketplace scope catalog is JS-rendered and not machine-readable; GHL Support confirms scopes are chosen per-PIT but does not enumerate them publicly. **There is no evidence of a `documents.readonly` scope for contact-tab files** (because no such read endpoint is documented).
- **Auth is not the blocker for contact-tab files** — the *endpoint itself* doesn't exist publicly, regardless of token type.

---

## Response shape

- **Documents & Contracts `List Documents`:** UNVERIFIED in detail (JS-rendered docs) — but documented to be proposal/contract records at location scope, **without** contact-file URLs. Not useful here.
- **`/medias/files`:** expected `{ files: [{ _id|id, name, url, type, ... }], total }` (UNVERIFIED exact keys; the script handles `files`/`medias`/`data`).
- **Contact `customFields[]` (the usable path):** each entry `{ id, fieldKey?, value }` where a File-Upload field's `value` is a **URL string** (or array of URLs / `{url|fileUrl|documentUrl}` objects). `ghl-api-exploration.mjs` Step 6 detects all three shapes.
- **Internal UI endpoint (undocumented):** unknown shape — must be captured via DevTools (see Plan B).

---

## Download flow

- **If files are in a custom field:** the field value *is* (or contains) the download URL. Stage 2 downloads it during import → re-uploads to the `patient-documents` bucket. (Confirm whether those URLs are themselves signed/expiring — Step 6 HEAD-checks one.)
- **If files are only on the Documents tab (no public list endpoint):** there is **no public mint-a-signed-URL call**. The signed `crm-contacts-docs-production` URL is generated by GHL's internal backend when the UI renders the tab. To download programmatically we must either (a) discover that internal endpoint via DevTools and replay it with a UI session token, or (b) drive the UI with a headless browser. The `X-Goog-Expires=600` means any captured URL is dead after **10 minutes** — it must be minted-and-downloaded back-to-back at import time.

---

## Untested endpoints worth probing (inconclusive — low confidence, do NOT assume they exist)

These are plausible-but-unverified paths; the script can probe and log them, but **none are documented**:
- `GET /contacts/{id}/medias`
- `GET /medias/files?altType=location&altId={loc}` filtered/searched by the contact's `{DOC_ID}` or folder
- `GET /documents?contactId={id}` and `GET /files?contactId={id}` (likely 404 like the others)
- `GET /locations/{id}/customFields` to confirm a **File-Upload field definition exists** for this clinic (Step 5b already does this — if zero file-type fields are defined, the scans are NOT in custom fields and are UI-only).

---

## Gotchas

- **Signed-URL expiry = 600 s (10 min).** Mint → download immediately; never persist GHL URLs.
- **v1 EOL:** stay on v2 + `Version: 2021-07-28`.
- **Rate limits:** ~100 req/min (existing script throttles 300–400 ms).
- **Pagination:** media library uses `offset`/`limit` + `sortBy`/`sortOrder` (and the `altType=location&altId=` pair) — the exact required combo is what the Step-5 422 variants are pinning down.
- **Bucket name `crm-contacts-docs-production`** strongly indicates these are *contact-scoped* docs (distinct from the location media library bucket) → they are most likely the **Documents-tab** files, which is precisely the set with no documented list API.
- **Don't confuse products:** "Documents & Contracts" (proposals) ≠ contact "Documents" tab (uploaded files). Almost all public docs are about the former.

---

## Recommended next step

**Plan A (cheap, already built — run first):** When Ali runs the current `ghl-api-exploration.mjs`, read Step 5b + Step 6 output:
- If `documents.fileUploadFields` lists a File-Upload custom field **and** an oldest contact shows a `fileEntries` URL → **solved**: scans are in custom fields, importable today with the existing key. No further research needed.
- If zero file-type custom fields and zero file entries → scans are **Documents-tab/UI-only** → proceed to Plan B.

**Plan B (the concrete unblock — DevTools network trace):** Ali, in a logged-in GHL browser session:
1. Open a contact you know has scanned files → click the **Documents** tab.
2. Open DevTools → **Network** → filter `XHR`/`Fetch`; clear, then click the tab so it loads.
3. Find the request that returns the document list (look for a JSON response containing the `DOC_ID`s) and, separately, the call that returns/redirects to the `storage.googleapis.com/crm-contacts-docs-production/...` signed URL.
4. Capture for each: **Request URL + method**, **request headers** (especially `Authorization`, `token-id`, `channel`, `source`, `version`, and any `location`/`Id` headers), and **response JSON shape** (keys only — no patient data).
5. Send those back. We then replicate the exact internal endpoint with the session/PIT token (read-only) in a focused probe — **no guessing.**

**Plan C (last resort):** headless-browser (Puppeteer) automation of the Documents tab to download files — the repo already has a Puppeteer login harness (`scripts/debug-ghl-login.mjs`) to build on. Slow, brittle; only if A and B fail.

**Plan D (parallel, low-effort):** ask GHL support / developer Slack whether an undocumented contact-documents read endpoint exists or is on the roadmap.

> **Do not modify `ghl-api-exploration.mjs` for this yet.** Run it as-is first (Plan A answers the question for free); only if it shows UI-only storage do we add a focused probe built from Plan B's captured endpoint.

---

### Sources
- [Documents & Contracts: Public APIs (GHL Support)](https://help.gohighlevel.com/support/solutions/articles/155000006323-documents-contracts-public-apis)
- [Adding Files To Contacts using a Custom Field (GHL Support)](https://help.gohighlevel.com/support/solutions/articles/48001171922-adding-files-to-contacts-using-a-custom-field)
- [Changelog: File and image upload through Document API (Feb 2024)](https://ideas.gohighlevel.com/changelog/file-and-image-upload-through-document-api)
- [Feature request: Add uploading files to contacts](https://ideas.gohighlevel.com/apis/p/add-uploading-files-to-contacts)
- [Feature request: Add ability to add Files to Opportunity and/or Contact](https://ideas.gohighlevel.com/contacts/p/can-we-please-add-the-ability-to-add-files-to-opportunity-andor-contact)
- [Private Integrations: Everything you need to know (auth/scopes)](https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know)
- [HighLevel API Developer Portal](https://marketplace.gohighlevel.com/docs/) · [GoHighLevel/highlevel-api-docs (GitHub)](https://github.com/GoHighLevel/highlevel-api-docs)

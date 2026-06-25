# GHL Document Storage — Investigation Plan (proposal, awaiting Ali's go-ahead)

**Stage:** V1.5 Stage 1 (diagnostic, read-only)
**Created:** 2026-06-26
**Status:** PROPOSAL — script NOT yet modified. Awaiting Ali's approval + one OLD contact ID before editing `scripts/ghl-api-exploration.mjs`.

## Problem

Stage-1 exploration found **0 documents** via `GET /contacts/{id}/documents`, which returned **HTTP 404 "Cannot GET"** for all 10 sampled contacts. But Ali confirms documents **do exist** — Saif's clinic scanned old paper files and uploaded them into GHL at setup. So `/contacts/{id}/documents` is simply **not a real GHL endpoint** (the path the legacy `fetch-documents.mjs` used never worked). We need to find where GHL actually stores those scans.

## Why the sample showed nothing (key insight)

The 10 sampled contacts were the **most recent** (June 2026) and all had `customFields: []`. GHL's documented way to attach a file to a contact is a **"File Upload" custom field** — the scanned files would live on **OLD** contacts (from clinic setup), not the newest ones. So the empty `customFields` is almost certainly a **sampling artifact**, not proof of "no documents." This is why we need an OLD contact ID Ali knows has scans.

## Candidate storage locations (ranked by likelihood)

| # | Where | Endpoint(s) to probe | Reasoning |
|---|---|---|---|
| 1 | **File-Upload custom field on the contact** | `GET /contacts/{OLD_ID}` → inspect `customFields[]` for values that are URLs / arrays of URLs | GHL's official contact-file mechanism (PDF/DOC/JPG/PNG/GIF/XLS, up to 250 MB). Most likely home for per-patient scans. The newest-contact sample just didn't have any. |
| 2 | **Location Media Library** | `GET /medias/files` with `altType=location&altId={locationId}` (+ `sortBy`, `sortOrder`, `offset`, `limit`; `type`/`query` optional) | If files were bulk-uploaded at setup, they may sit in the location's media library — possibly **not** linked to contacts. Returns `{ files: [{ _id, name, url, ... }] }`. |
| 3 | **Custom-field values on the location's field definitions** | `GET /locations/{id}/customFields` to see if any field is `dataType: FILE_UPLOAD` | Confirms whether a file field even exists for this clinic and gives its field id/key to look for in #1. |
| 4 | **Inline URLs inside note bodies** | regex-scan `body` + `bodyText` of fetched notes for `https?://…(gohighlevel|leadconnector|storage.googleapis|msgsndr)…` or `\.(pdf|jpe?g|png|gif|docx?|xlsx?)` | Staff may have pasted file links into notes. Cheap to check on data we already pull. |
| 5 | **Conversation attachments** | (discovery only) note that `/conversations/messages/upload-file-attachments` is **upload-only**; inbound message media would come from the conversations/messages search, not a contact-file API | Low likelihood for *scanned setup files*; documented for completeness so we don't chase it. |
| 6 | (rule out) `/contacts/{id}/files`, `/contacts/{id}/attachments` | probe both | Confirm they 404 like `/documents` so we can definitively close them out. |

> Auth/pagination for all of the above is identical to the rest of the script: `Authorization: Bearer`, `Version: 2021-07-28`. `/medias/files` uses `altType=location` + `altId=<locationId>`; exact required params are confirmed at runtime — the script logs the API's own 422 message if a param is missing.

## What the script will do (additive — proposed Step 5 + Step 6)

**Step 5 — endpoint discovery (location-wide, no contact needed):**
- `GET /medias/files?altType=location&altId={locationId}&sortBy=createdAt&sortOrder=desc&limit=20&offset=0`
- `GET /locations/{locationId}/customFields` (look for `dataType: FILE_UPLOAD`)
- `GET /contacts/{id}/files` and `GET /contacts/{id}/attachments` on the first sample contact (to prove/disprove these paths)
- Regex-scan the already-fetched note bodies/bodyText for file URLs/extensions; report counts + redacted host list (no patient text dumped).
- Log per endpoint: path, HTTP status, result count, and a **shape-only** sample (keys, not patient values).

**Step 6 — one OLD contact deep probe (needs Ali's input):**
- Ali provides `GHL_TEST_DOC_CONTACT_ID` (an OLD patient he personally scanned files for). Passed via env or `--doc-contact=<id>` (no PII in the repo).
- For that ID, run: `GET /contacts/{id}` (dump `customFields` shape — flag any URL-valued field), plus `/medias/files?query=…`, and the contact file/attachment paths.
- Output goes into the existing gitignored `scripts/ghl-sample-data.json` under a new `documentInvestigation` key.

## What success looks like

- At least one endpoint returns an **array of file objects** that includes **file metadata** (name/type/size) **and a resolvable download URL** (or a media id we can resolve to a URL).
- For the OLD test contact, we can point to the exact field/endpoint where that patient's scans live, and confirm we can read (HTTP 200 / signed URL) **one** file.

## What failure looks like

- All probes 404 / 401 / return empty arrays, AND no file URLs found in notes, AND the OLD contact's `customFields` has no URL-valued entry. → Documents may only be reachable via the GHL **web UI** (would push us back to a Puppeteer/manual export path), or were never actually in GHL. We'd escalate that finding to Ali rather than guess.

## Discover vs. fetch — recommendation

**This pass: DISCOVER ONLY.** Do not bulk-download. The script should:
- list/identify where files live + log metadata,
- at most do a single **HEAD or 1-file GET** on the OLD test contact's first file to prove the URL is downloadable (and note whether the URL is signed/expiring),
- **not** download all files, **not** write anything to Velo/Supabase.

Bulk download → re-upload into the `patient-documents` bucket is **Stage 2** import work, once we know the endpoint and have Saif's go-ahead on document migration scope. Keeping this pass read-only/metadata-only avoids pulling PHI to disk unnecessarily and keeps the diagnostic cheap.

## What we need from Ali before editing the script

1. **Approve this plan** (or adjust the endpoint list / discover-vs-fetch call).
2. **One OLD contact GHL ID** that he knows has scanned files (he uploaded them) — for Step 6. Provided at runtime (env/flag), never committed.

## Guardrails honored

- Read-only (GET/HEAD only); never writes to GHL or Velo.
- Additive to `ghl-api-exploration.mjs` — existing Steps 1–4 logic untouched.
- Real data stays in the gitignored `scripts/ghl-sample-data.json`; only shapes/counts/redacted hosts surface in summaries.

---

### Sources (GHL API research)
- [HighLevel API Docs — Developer Portal](https://marketplace.gohighlevel.com/docs/)
- [Get List of Files/Folders (medias)](https://marketplace.gohighlevel.com/docs/ghl/medias/fetch-media-content/index.html)
- [Upload File into Media Storage](https://marketplace.gohighlevel.com/docs/ghl/medias/upload-media-content/index.html)
- [Adding Files To Contacts using a Custom Field](https://help.gohighlevel.com/support/solutions/articles/48001171922-adding-files-to-contacts-using-a-custom-field)
- [Upload file attachments (conversations)](https://marketplace.gohighlevel.com/docs/ghl/conversations/upload-file-attachments/index.html)
- [GoHighLevel/highlevel-api-docs (GitHub)](https://github.com/GoHighLevel/highlevel-api-docs)

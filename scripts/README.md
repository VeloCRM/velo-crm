# GHL → Velo CRM Migration Scripts (Dental Clinic)

Two scripts to move your dental clinic data from GoHighLevel to Velo CRM.

## What gets migrated

| GHL Data | Velo CRM |
|----------|----------|
| Contacts (patients) | Contacts table |
| Notes per contact | Contact notes timeline |
| Tasks per contact | Included in notes |
| Attached documents | Supabase Storage |

## Step 1: Export from GHL

```bash
node scripts/ghl-export.mjs \
  --api-key=YOUR_GHL_API_KEY \
  --location-id=YOUR_LOCATION_ID
```

**Where to find your GHL credentials:**
- API Key → GHL Settings → Business Profile → API Keys
- Location ID → Look at the URL when logged into GHL: `app.gohighlevel.com/location/LOCATION_ID/...`

This creates an `export/` folder:
```
export/
├── patients.csv          ← All patients (name, phone, email, date)
├── notes/
│   └── [contact-id].json ← Each patient's notes and tasks
├── documents/
│   └── [Patient Name]/   ← Downloaded files per patient
└── _export_meta.json     ← Export summary
```

## Step 2: Import into Velo CRM

```bash
node scripts/velo-import.mjs \
  --supabase-url=https://YOUR_PROJECT.supabase.co \
  --supabase-key=YOUR_SERVICE_ROLE_KEY \
  --user-id=YOUR_AUTH_USER_UUID
```

**Where to find your Supabase credentials:**
- URL + Service Key → Supabase Dashboard → Settings → API
- User ID → Supabase Dashboard → Authentication → Users → click your user

**Dry run first** (preview without writing):
```bash
node scripts/velo-import.mjs \
  --supabase-url=... --supabase-key=... --user-id=... \
  --dry-run
```

## Prerequisites

Before importing, make sure:
1. Your Supabase database has the Velo CRM schema (run `src/lib/schema_clean.sql`)
2. You have a Supabase Storage bucket called `documents`
3. You're using the **Service Role** key (not the anon key)

## Notes

- The export respects GHL's rate limits (~100 requests/minute)
- Documents are downloaded from GHL's storage URLs
- Duplicate contacts (same email) are skipped during import
- All imported contacts are tagged with source `ghl_import`
- GHL notes become Velo timeline entries with author "GHL Import"

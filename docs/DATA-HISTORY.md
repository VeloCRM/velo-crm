# Velo Dental — Data History & Migration Context

## Production Supabase instance

Current project: `aajwuwjxpmmqcwhiynla`

Current data: test-scale (~6 patients across Le Royal + My Test Clinic). Treat the
dental schema with production-grade care regardless of row count — schema changes
get full ceremony.

## Historical context

Earlier Velo development happened on a now-decommissioned Supabase instance. That
instance previously held 3,000+ patient records imported from Saif Dental's GHL
(GoHighLevel) CRM. The decommissioning happened during the project rebuild;
current production is a fresh instance with test data only.

## Saif Dental's GHL migration (planned, not yet executed)

Saif Dental's 3,171 GHL contacts remain in GoHighLevel (their previous CRM). These
will be migrated into Velo during Phase 2 of the V2 platform restructure via the
rewritten GHL import pipeline. The migration scripts (`scripts/ghl-export.mjs`,
`scripts/download-ghl-docs.mjs`, `scripts/upload-docs-to-supabase.mjs`) reference
3,171 as a functional constant — those references are accurate to their historical
purpose and should not be edited.

## Phase 1B safety guard

The V2 migration SQL (PR #31) includes a pre-flight guard that aborts if patient
count exceeds 50. This catches wrong-instance mistakes — if you accidentally point
at production with real patient data, the migration won't proceed.

## Reference timeline

- Pre-2026: Old Supabase instance with 3,000+ records (decommissioned)
- 2026: Current production (`aajwuwjxpmmqcwhiynla`), test-scale
- Phase 2 of V2 restructure (planned): Saif Dental's 3,171 GHL contacts imported into V2 schema

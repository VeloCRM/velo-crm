/**
 * X-ray type labels — single source of truth shared by the upload modal
 * (dropdown) and the grid (filter chips). Kept in its own module so the
 * component files only export components (react-refresh/only-export-components).
 *
 * `id` values mirror the xray_type enum in scripts/xray-module-migration.sql.
 * Arabic terms are best-effort — confirm with a native-speaking dentist.
 */
export const XRAY_TYPE_OPTIONS = [
  { id: 'bitewing',   en: 'Bitewing',   ar: 'عضّية' },
  { id: 'periapical', en: 'Periapical', ar: 'ذروية' },
  { id: 'panoramic',  en: 'Panoramic',  ar: 'بانورامية' },
  { id: 'occlusal',   en: 'Occlusal',   ar: 'إطباقية' },
  { id: 'cbct',       en: 'CBCT',       ar: 'مقطعية (CBCT)' },
  { id: 'other',      en: 'Other',      ar: 'أخرى' },
]

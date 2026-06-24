/**
 * heicConverter — convert iPhone HEIC/HEIF photos to JPEG for upload flows.
 *
 * heic2any embeds libheif (~1.3 MB raw / ~256 KB brotli), so it is loaded via a
 * dynamic import() ONLY when a HEIC file is actually picked — Vite emits it as a
 * separate async chunk, keeping it out of the main/page bundles. Mobile UX audit
 * M-05 (scripts/mobile-ux-audit-2026-06-24.md).
 */

// iPhone's default camera format. Reports as image/heic|heif, or sometimes an
// empty MIME with a .heic/.heif name (drag-drop / certain browsers).
export function isHeic(file) {
  if (!file) return false
  return /image\/hei[cf]/i.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '')
}

/**
 * Convert a HEIC/HEIF File to a JPEG File. Lazy-loads heic2any on first call.
 * Throws on failure so callers can surface a friendly toast.
 * @param {File} file
 * @param {{ quality?: number }} [opts] quality 0..1 (default 0.85)
 * @returns {Promise<File>} a new image/jpeg File with a .jpg name
 */
export async function convertHeicToJpeg(file, { quality = 0.85 } = {}) {
  const { default: heic2any } = await import('heic2any')
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality })
  // heic2any returns a Blob, or Blob[] when the HEIC holds multiple images.
  const blob = Array.isArray(out) ? out[0] : out
  if (!blob) throw new Error('HEIC conversion produced no output')
  const baseName = (file.name || 'photo').replace(/\.(heic|heif)$/i, '')
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}

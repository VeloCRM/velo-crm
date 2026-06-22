/**
 * XraysTab — patient-profile X-rays tab (PR-B1). Loads the patient's X-rays,
 * renders the grid, and gates the upload modal by role (owner/doctor only;
 * receptionists browse read-only — RLS enforces this server-side too).
 *
 * Interim full-size view: a thumbnail click signs a URL and opens it in a new
 * tab (matching the Documents tab). The in-app zoom/pan lightbox + metadata
 * edit/delete arrive in PR-B2.
 */
import { useState, useEffect, useCallback } from 'react'
import XrayGrid from './XrayGrid'
import XrayUploadModal from './XrayUploadModal'
import useMyRole from '../hooks/useMyRole'
import { fetchXrays, getXraySignedUrl } from '../lib/xrays'

const EDIT_ROLES = new Set(['owner', 'doctor'])

export default function XraysTab({ patient, lang, dir, toast }) {
  const isRTL = lang === 'ar'
  const { role, loading: roleLoading } = useMyRole()
  const canEdit = !roleLoading && EDIT_ROLES.has(role)

  const [xrays, setXrays] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setXrays(await fetchXrays(patient.id))
    } catch (err) {
      console.error('[XraysTab] load failed:', err)
      toast?.(isRTL ? 'فشل تحميل الأشعة' : 'Failed to load X-rays', 'error')
    } finally {
      setLoading(false)
    }
  }, [patient.id, toast, isRTL])

  useEffect(() => { reload() }, [reload])

  // Interim view: signed URL → new tab (lightbox in PR-B2).
  const openFull = async (xray) => {
    setBusyId(xray.id)
    try {
      const { url } = await getXraySignedUrl(xray.id, 3600)
      if (!url) throw new Error('no url')
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      console.error('[XraysTab] signed-url failed:', err)
      toast?.(isRTL ? 'فشل فتح الصورة' : 'Failed to open image', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="ds-root flex flex-col gap-3">
      <XrayGrid
        xrays={xrays}
        loading={loading}
        canEdit={canEdit}
        roleLoading={roleLoading}
        isRTL={isRTL}
        busyId={busyId}
        onOpen={openFull}
        onUpload={() => setShowUpload(true)}
      />
      {showUpload && canEdit && (
        <XrayUploadModal
          patientId={patient.id}
          lang={lang}
          dir={dir}
          toast={toast}
          onClose={() => setShowUpload(false)}
          onUploaded={reload}
        />
      )}
    </div>
  )
}

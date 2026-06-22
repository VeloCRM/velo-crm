/**
 * XraysTab — patient-profile X-rays tab. Loads the patient's X-rays, renders the
 * grid, gates upload by role (owner/doctor; receptionists read-only — RLS also
 * enforces). A thumbnail click opens the in-place XrayLightbox (PR-B2) over the
 * grid's current filtered set; the lightbox handles zoom/pan + edit + delete.
 */
import { useState, useEffect, useCallback } from 'react'
import XrayGrid from './XrayGrid'
import XrayUploadModal from './XrayUploadModal'
import XrayLightbox from './XrayLightbox'
import useMyRole from '../hooks/useMyRole'
import { fetchXrays } from '../lib/xrays'

const EDIT_ROLES = new Set(['owner', 'doctor'])

export default function XraysTab({ patient, lang, dir, toast }) {
  const isRTL = lang === 'ar'
  const { role, loading: roleLoading } = useMyRole()
  const canEdit = !roleLoading && EDIT_ROLES.has(role)

  const [xrays, setXrays] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [lightbox, setLightbox] = useState(null) // { list, index } | null

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

  // Open the lightbox over the grid's current filtered/ordered set (frozen as a
  // snapshot for stable prev/next; the grid behind still refreshes via reload).
  const openLightbox = (xray, orderedList) => {
    const list = orderedList && orderedList.length ? orderedList : [xray]
    const index = Math.max(0, list.findIndex(x => x.id === xray.id))
    setLightbox({ list, index })
  }

  return (
    <div className="ds-root flex flex-col gap-3">
      <XrayGrid
        xrays={xrays}
        loading={loading}
        canEdit={canEdit}
        roleLoading={roleLoading}
        isRTL={isRTL}
        onOpen={openLightbox}
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
      {lightbox && (
        <XrayLightbox
          list={lightbox.list}
          index={lightbox.index}
          canEdit={canEdit}
          patientId={patient.id}
          lang={lang}
          dir={dir}
          toast={toast}
          onIndexChange={(i) => setLightbox(lb => (lb ? { ...lb, index: i } : lb))}
          onClose={() => setLightbox(null)}
          onMutated={reload}
        />
      )}
    </div>
  )
}

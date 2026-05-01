import { useState, useEffect } from 'react'
import { listCompetitors, insertCompetitor, deleteCompetitor } from '../../lib/competitors'

export default function CompetitorSetup({ orgId }) {
  const [competitors, setCompetitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    industry: '',
    instagram_handle: '',
    google_maps_url: '',
    location: '',
  })

  async function fetchCompetitors() {
    setLoading(true)
    try {
      const data = await listCompetitors()
      setCompetitors(data)
    } catch (err) {
      console.error('Fetch competitors error:', err)
      setCompetitors([])
    }
    setLoading(false)
  }

  // ── Fetch competitors ────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return
    fetchCompetitors()
  }, [orgId])

  // ── Add competitor ───────────────────────────────────────────────────
  async function handleAdd(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await insertCompetitor({
        name: form.name.trim(),
        industry: form.industry.trim(),
        instagram_handle: form.instagram_handle.trim(),
        google_maps_url: form.google_maps_url.trim(),
        location: form.location.trim(),
      })
      setForm({ name: '', industry: '', instagram_handle: '', google_maps_url: '', location: '' })
      await fetchCompetitors()
    } catch (err) {
      console.error('Add competitor error:', err)
    }
    setSaving(false)
  }

  // ── Delete competitor ────────────────────────────────────────────────
  async function handleDelete(id) {
    try {
      await deleteCompetitor(id)
      setCompetitors(prev => prev.filter(c => c.id !== id))
    } catch (err) {
      console.error('Delete competitor error:', err)
    }
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)', background: '#0C0E1A',
    color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none',
    transition: 'border-color 150ms ease',
  }

  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }

  const cardStyle = {
    background: '#101422', borderRadius: 10,
    border: '1px solid rgba(0,255,178,0.12)',
    boxShadow: '0 0 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
    padding: 16,
  }

  if (!orgId) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
        Competitors
      </h2>

      <form onSubmit={handleAdd} style={cardStyle}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} required />
          </div>
          <div>
            <label style={labelStyle}>Industry</label>
            <input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Instagram</label>
            <input value={form.instagram_handle} onChange={e => setForm(f => ({ ...f, instagram_handle: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Google Maps URL</label>
            <input value={form.google_maps_url} onChange={e => setForm(f => ({ ...f, google_maps_url: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Location</label>
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} style={inputStyle} />
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          style={{
            marginTop: 12,
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#00FFB2',
            color: '#0C0E1A',
            fontSize: 13,
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Adding...' : 'Add competitor'}
        </button>
      </form>

      {loading ? (
        <p style={{ color: '#7b7f9e', fontSize: 13 }}>Loading...</p>
      ) : competitors.length === 0 ? (
        <p style={{ color: '#7b7f9e', fontSize: 13 }}>No competitors added yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {competitors.map(c => (
            <div key={c.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div style={{ color: '#7b7f9e', fontSize: 12, marginTop: 2 }}>
                  {[c.industry, c.location].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#FF6B6B',
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

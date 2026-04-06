import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

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

  // ── Fetch competitors ────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return
    fetchCompetitors()
  }, [orgId])

  async function fetchCompetitors() {
    setLoading(true)
    const { data, error } = await supabase
      .from('competitors')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    if (error) console.error('Fetch competitors error:', error)
    setCompetitors(data || [])
    setLoading(false)
  }

  // ── Add competitor ───────────────────────────────────────────────────
  async function handleAdd(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    const { error } = await supabase.from('competitors').insert({
      org_id: orgId,
      name: form.name.trim(),
      industry: form.industry.trim(),
      instagram_handle: form.instagram_handle.trim(),
      google_maps_url: form.google_maps_url.trim(),
      location: form.location.trim(),
    })
    if (error) {
      console.error('Add competitor error:', error)
    } else {
      setForm({ name: '', industry: '', instagram_handle: '', google_maps_url: '', location: '' })
      await fetchCompetitors()
    }
    setSaving(false)
  }

  // ── Delete competitor ────────────────────────────────────────────────
  async function handleDelete(id) {
    const { error } = await supabase.from('competitors').delete().eq('id', id)
    if (error) console.error('Delete competitor error:', error)
    else setCompetitors(prev => prev.filter(c => c.id !== id))
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)', background: '#0f1729',
    color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none',
    transition: 'border-color 150ms ease',
  }

  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }

  const cardStyle = {
    background: '#111827', borderRadius: 10,
    border: '1px solid rgba(0,212,255,0.12)',
    boxShadow: '0 0 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── Add Form ──────────────────────────────────────────────────── */}
      <form onSubmit={handleAdd} style={{ ...cardStyle, padding: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 16 }}>
          Add Competitor
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. BrightSmile Dental" required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Industry</label>
            <input value={form.industry} onChange={e => setForm(p => ({ ...p, industry: e.target.value }))} placeholder="e.g. Dental, Real Estate" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Instagram Handle</label>
            <input value={form.instagram_handle} onChange={e => setForm(p => ({ ...p, instagram_handle: e.target.value }))} placeholder="@handle" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Google Maps URL</label>
            <input value={form.google_maps_url} onChange={e => setForm(p => ({ ...p, google_maps_url: e.target.value }))} placeholder="https://maps.google.com/..." style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Location</label>
            <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Baghdad, Erbil" style={inputStyle} />
          </div>
        </div>

        <button type="submit" disabled={saving || !form.name.trim()} style={{
          padding: '8px 18px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
          background: saving || !form.name.trim() ? '#475569' : 'linear-gradient(135deg, #00d4ff, #0099cc)',
          color: saving || !form.name.trim() ? '#94a3b8' : '#080c14',
          cursor: saving || !form.name.trim() ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', transition: 'all 150ms ease',
        }}>
          {saving ? 'Adding...' : '+ Add Competitor'}
        </button>
      </form>

      {/* ── Competitors List ──────────────────────────────────────────── */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,212,255,0.12)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
            Tracked Competitors
            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: '#475569' }}>
              ({competitors.length})
            </span>
          </h2>
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#475569', fontSize: 13 }}>Loading...</div>
        ) : competitors.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <p style={{ color: '#475569', fontSize: 13 }}>No competitors added yet.</p>
            <p style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>Add your first competitor above to start tracking.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0d1420', borderBottom: '1px solid rgba(0,212,255,0.12)' }}>
                  {['Name', 'Industry', 'Instagram', 'Location', 'Google Maps', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {competitors.map((comp, idx) => (
                  <tr key={comp.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 150ms ease' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,212,255,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#e2e8f0' }}>{comp.name}</td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{comp.industry || '\u2014'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {comp.instagram_handle
                        ? <span style={{ color: '#e879a8' }}>@{comp.instagram_handle.replace(/^@/, '')}</span>
                        : <span style={{ color: '#475569' }}>\u2014</span>}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{comp.location || '\u2014'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {comp.google_maps_url
                        ? <a href={comp.google_maps_url} target="_blank" rel="noopener noreferrer" style={{ color: '#00d4ff', fontSize: 12, textDecoration: 'none' }}>View Map ↗</a>
                        : <span style={{ color: '#475569' }}>\u2014</span>}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button onClick={() => handleDelete(comp.id)} style={{ border: 'none', background: 'transparent', color: '#ef4444', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
